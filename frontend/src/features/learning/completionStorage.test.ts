import { describe, expect, it, vi } from "vitest";
import {
  createCompletionStore,
  COMPLETION_STORAGE_KEY,
  MAX_COMPLETION_BYTES,
  serializeCompletions,
  type CompletionRecord,
} from "./completionStorage";
import { pathEvidence, currentPathAnswers } from "./pathEvidence";
import catalog from "../../../../content/catalog.json";
import type { CatalogEntry, LearningPathStep } from "../../api/types";
import type { PracticeAnswer } from "./practiceStorage";
const date = "2026-10-10T12:00:00.000Z";
const answer: PracticeAnswer = {
  topicId: "request-flow",
  activityId: "explain",
  contentVersion: "1.1.0",
  updatedAt: date,
  referenceViewed: true,
  answer: { kind: "text", text: "Two workers cause waiting. 队列 🚀" },
};
const reading: CompletionRecord = {
  moduleId: answer.topicId,
  contentVersion: answer.contentVersion,
  kind: "reading",
  updatedAt: date,
};
const review: CompletionRecord = { ...reading, kind: "practice", answer };
const step: LearningPathStep = {
  moduleId: answer.topicId,
  purpose: "Trace requests",
  available: true,
  entry: (catalog as CatalogEntry[]).find(
    (entry) => entry.id === "request-flow",
  )!,
  activities: [
    { id: "explain", kind: "text", optionIds: [] },
    { id: "choose", kind: "choice", optionIds: ["a", "b"] },
  ],
};
function memory(initial: string | null = null) {
  let raw = initial;
  return {
    getItem: vi.fn(() => raw),
    setItem: vi.fn((_key: string, value: string) => {
      raw = value;
    }),
    raw: () => raw,
    change: (value: string | null) => {
      raw = value;
    },
  };
}
const create = (m: ReturnType<typeof memory>) =>
  createCompletionStore(
    () => m,
    () => date,
  );

describe("explicit completion and answer evidence", () => {
  it("does not write on visits and round trips reading and reviewed Unicode answers separately", () => {
    const m = memory(),
      store = create(m);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    expect(m.setItem).not.toHaveBeenCalled();
    store.markReading(answer.topicId, answer.contentVersion, true);
    store.markReviewed([answer]);
    expect(m.setItem).toHaveBeenLastCalledWith(
      COMPLETION_STORAGE_KEY,
      expect.any(String),
    );
    expect(create(m).getSnapshot().records).toEqual([reading, review]);
    store.markReading(answer.topicId, answer.contentVersion, false);
    expect(store.getSnapshot().records).toEqual([review]);
  });
  it("never infers completion from an answer or reference; a review needs the same current evidence", () => {
    expect(pathEvidence(step, [answer])).toMatchObject({
      answered: 1,
      viewed: 1,
      reading: false,
      reviewed: 0,
    });
    expect(pathEvidence(step, [answer], [reading, review])).toMatchObject({
      reading: true,
      reviewed: 1,
    });
    for (const change of [
      {
        answer: {
          kind: "text" as const,
          text: "Edited in the same millisecond",
        },
      },
      { updatedAt: "2026-10-10T12:00:00.001Z" },
      { referenceViewed: false },
      { contentVersion: "1.0.0" },
      { activityId: "removed" },
    ]) {
      expect(
        pathEvidence(step, [{ ...answer, ...change }], [reading, review])
          .reviewed,
      ).toBe(0);
    }
    expect(
      pathEvidence(
        { ...step, entry: { ...step.entry!, contentVersion: "1.2.0" } },
        [answer],
        [reading, review],
      ),
    ).toMatchObject({ reading: false, reviewed: 0 });
    expect(
      pathEvidence({ ...step, available: false }, [answer], [reading, review]),
    ).toMatchObject({ reading: false, reviewed: 0 });
  });
  it("only offers meaningful current authored answers including valid choices", () => {
    const choice = {
      ...answer,
      activityId: "choose",
      answer: { kind: "choice" as const, optionId: "b" },
    };
    const records = [
      answer,
      choice,
      { ...answer, activityId: "removed" },
      { ...answer, answer: { kind: "text" as const, text: "  " } },
      { ...choice, answer: { kind: "choice" as const, optionId: "removed" } },
      { ...answer, contentVersion: "1.0.0" },
    ];
    expect(currentPathAnswers(step, records)).toEqual([answer, choice]);
    const m = memory(),
      store = create(m);
    store.markReviewed([choice]);
    expect(
      pathEvidence(step, [choice], store.getSnapshot().records).reviewed,
    ).toBe(1);
    expect(currentPathAnswers({ ...step, available: false }, records)).toEqual(
      [],
    );
  });
  it("preserves unrelated modules when replacing a reading/review or explicitly clearing one module", () => {
    const m = memory(),
      store = create(m);
    store.markReading("cache-aside", "1.1.0", true);
    store.markReviewed([answer]);
    store.markReading("request-flow", "1.1.0", true);
    store.markReviewed([
      { ...answer, answer: { kind: "text", text: "Changed" } },
    ]);
    expect(store.getSnapshot().records).toHaveLength(3);
    store.clearModule("request-flow");
    expect(store.getSnapshot().records.map((r) => r.moduleId)).toEqual([
      "cache-aside",
    ]);
  });
  it("keeps denied/quota-limited marks in session memory and retries after storage recovers", () => {
    const m = memory(),
      store = create(m);
    m.setItem.mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(store.markReviewed([answer])).toMatchObject({
      ok: false,
      message: expect.stringContaining("session only"),
    });
    expect(m.raw()).toBeNull();
    expect(store.getSnapshot().records).toEqual([review]);
    expect(store.retrySaving().ok).toBe(true);
    expect(create(m).getSnapshot().records).toEqual([review]);
    const denied = createCompletionStore(
      () => {
        throw new DOMException("blocked", "SecurityError");
      },
      () => date,
    );
    denied.markReading("request-flow", "1.1.0", true);
    expect(denied.getSnapshot().records).toEqual([reading]);
  });
  it.each([
    "not json",
    JSON.stringify({
      app: "hld-with-ui",
      kind: "completion",
      schemaVersion: 9,
      records: [],
    }),
  ])(
    "preserves corrupt/unsupported raw bytes and never replaces them",
    (raw) => {
      const m = memory(raw),
        store = create(m);
      expect(store.getSnapshot().previousData).toBe(raw);
      expect(store.getSnapshot().issue).toBeTruthy();
      store.markReading("request-flow", "1.1.0", true);
      expect(store.getSnapshot().records).toEqual([reading]);
      expect(store.retrySaving().ok).toBe(false);
      expect(() => store.previewImport(serializeCompletions([]))).toThrow(
        /cannot be safely replaced/,
      );
      expect(m.raw()).toBe(raw);
      expect(m.setItem).not.toHaveBeenCalled();
    },
  );
  it("does not overwrite another tab and preserves both remote bytes and local session evidence", () => {
    const m = memory(),
      store = create(m);
    store.getSnapshot();
    const remote = serializeCompletions([
      { ...reading, moduleId: "cache-aside" },
    ]);
    m.change(remote);
    store.markReviewed([answer]);
    expect(m.raw()).toBe(remote);
    expect(store.getSnapshot()).toMatchObject({
      records: [review],
      previousData: remote,
    });
    expect(store.retrySaving().ok).toBe(false);
  });
  it("explicit import replaces completion marks only, retains a private preview and rejects reuse", () => {
    const m = memory(),
      store = create(m);
    store.markReading("cache-aside", "1.1.0", true);
    const preview = store.previewImport(serializeCompletions([review]));
    expect(store.getSnapshot().records).toHaveLength(1);
    expect(m.setItem).toHaveBeenCalledTimes(1);
    preview.count = 99;
    expect(store.applyImport(preview).ok).toBe(true);
    expect(store.getSnapshot().records).toEqual([review]);
    expect(store.applyImport(preview).ok).toBe(false);
    expect(pathEvidence(step, [], store.getSnapshot().records).reviewed).toBe(
      0,
    );
  });
  it("rejects forged, stale and another-tab previews; failed import and clear preserve records", () => {
    const m = memory(),
      store = create(m);
    store.markReading("request-flow", "1.1.0", true);
    expect(store.applyImport({ count: 0 }).ok).toBe(false);
    let preview = store.previewImport(serializeCompletions([]));
    store.markReviewed([answer]);
    expect(store.applyImport(preview).ok).toBe(false);
    preview = store.previewImport(serializeCompletions([]));
    m.setItem.mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(store.applyImport(preview).ok).toBe(false);
    expect(store.getSnapshot().records).toEqual([reading, review]);
    m.setItem.mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(store.clearModule("request-flow").ok).toBe(false);
    expect(store.getSnapshot().records).toEqual([reading, review]);
    preview = store.previewImport(serializeCompletions([]));
    m.change(serializeCompletions([reading]));
    expect(store.applyImport(preview).ok).toBe(false);
  });
  it("rejects wrong envelopes, extra fields, duplicates, invalid times/IDs and empty practice evidence", () => {
    const store = create(memory());
    const bad = [
      "{",
      JSON.stringify({ app: "hld-with-ui", schemaVersion: 1, answers: [] }),
      serializeCompletions([reading, reading]),
      serializeCompletions([{ ...reading, moduleId: "invalid/id" }]),
      serializeCompletions([
        { ...reading, updatedAt: "2026-02-30T12:00:00.000Z" },
      ]),
      serializeCompletions([
        {
          ...review,
          answer: { ...answer, answer: { kind: "text", text: " " } },
        },
      ]),
      serializeCompletions([{ ...review, moduleId: "cache-aside" }]),
      JSON.stringify({
        app: "hld-with-ui",
        kind: "completion",
        schemaVersion: 1,
        records: [{ ...reading, extra: true }],
      }),
      serializeCompletions([{ ...reading, contentVersion: "invalid" }]),
    ];
    for (const raw of bad) expect(() => store.previewImport(raw)).toThrow();
    expect(store.getSnapshot().records).toEqual([]);
  });
  it("enforces record and UTF-8 byte bounds without losing the previous records", () => {
    const m = memory(),
      store = create(m);
    const many = Array.from({ length: 200 }, (_, index) => ({
      ...reading,
      moduleId: `module-${index}`,
    }));
    store.applyImport(store.previewImport(serializeCompletions(many)));
    expect(store.markReading("one-more", "1.1.0", true).ok).toBe(false);
    expect(store.getSnapshot().records).toHaveLength(200);
    expect(() =>
      store.previewImport(" ".repeat(MAX_COMPLETION_BYTES + 1)),
    ).toThrow(/limit/);
    const unicode = Array.from({ length: 34 }, (_, i) => ({
      ...review,
      answer: {
        ...answer,
        activityId: `question-${i}`,
        answer: { kind: "text" as const, text: "🚀".repeat(2000) },
      },
    }));
    expect(() => store.previewImport(serializeCompletions(unicode))).toThrow(
      /limit/,
    );
  });
});
