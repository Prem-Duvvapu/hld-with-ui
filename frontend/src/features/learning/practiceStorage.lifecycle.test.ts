import { describe, expect, it, vi } from "vitest";
import {
  createPracticeStore,
  MAX_IMPORT_BYTES,
  serializeAnswers,
  type PracticeAnswer,
} from "./practiceStorage";

const answer: PracticeAnswer = {
  topicId: "cache-aside",
  activityId: "cold-miss-fill-prediction",
  contentVersion: "1.1.0",
  updatedAt: "2026-10-07T00:00:00.000Z",
  answer: { kind: "text", text: "Read origin on a cold miss." },
  referenceViewed: false,
};
const incoming = {
  ...answer,
  answer: { kind: "text" as const, text: "Imported reasoning." },
};
const conflictKey = `${answer.topicId}/${answer.activityId}`;
function memory(initial: string | null = null) {
  let raw = initial;
  let denied = false;
  let quota = false;
  const storage = {
    getItem: vi.fn(() => {
      if (denied) throw new DOMException("Denied", "SecurityError");
      return raw;
    }),
    setItem: vi.fn((_key: string, value: string) => {
      if (quota) throw new DOMException("Full", "QuotaExceededError");
      raw = value;
    }),
  };
  return {
    storage,
    raw: () => raw,
    replace: (value: string | null) => {
      raw = value;
    },
    deny: (value: boolean) => {
      denied = value;
    },
    quota: (value: boolean) => {
      quota = value;
    },
  };
}
function setup(records: PracticeAnswer[] = []) {
  const disk = memory(records.length ? serializeAnswers(records) : null);
  const store = createPracticeStore(
    () => disk.storage,
    () => "2026-10-07T01:00:00.000Z",
  );
  store.getSnapshot();
  return { disk, store };
}

describe("answer import lifecycle", () => {
  it("previews without writing, then preserves practice, guided, and archived IDs", () => {
    const { disk, store } = setup([answer]);
    const records = [
      { ...incoming, activityId: "cold-miss-fill-tradeoff" },
      {
        ...incoming,
        topicId: "removed-module",
        activityId: "removed-activity",
        contentVersion: "0.8.0",
      },
    ];
    const before = store.getSnapshot();
    const preview = store.previewImport(serializeAnswers(records));
    expect(preview.ok).toBe(true);
    expect(preview.conflicts).toEqual([]);
    expect(preview.merged).toHaveLength(3);
    expect(store.getSnapshot()).toBe(before);
    expect(disk.storage.setItem).not.toHaveBeenCalled();
    expect(store.applyImport(preview)).toEqual({ ok: true });
    expect(
      createPracticeStore(() => disk.storage).getSnapshot().answers,
    ).toEqual([answer, ...records]);
  });
  it("defaults conflicts to local and supports explicitly choosing incoming", () => {
    const { store } = setup([answer]);
    let preview = store.previewImport(serializeAnswers([incoming]));
    expect(preview.conflicts[0]).toMatchObject({
      key: conflictKey,
      local: answer,
      incoming,
    });
    expect(store.applyImport(preview)).toEqual({ ok: true });
    expect(store.getSnapshot().answers).toEqual([answer]);
    preview = store.previewImport(serializeAnswers([incoming]));
    expect(store.applyImport(preview, { [conflictKey]: "incoming" })).toEqual({
      ok: true,
    });
    expect(store.getSnapshot().answers).toEqual([incoming]);
  });
  it.each([
    { kind: "text" as const, text: "  " },
    { kind: "choice" as const, optionId: null },
  ])("replaces an empty local answer with an incoming answer", (empty) => {
    const { store } = setup([{ ...answer, answer: empty }]);
    const preview = store.previewImport(serializeAnswers([incoming]));
    expect(preview.conflicts).toEqual([]);
    expect(store.applyImport(preview).ok).toBe(true);
    expect(store.getSnapshot().answers).toEqual([incoming]);
  });
  it("merges a reveal for identical same-version answers without replacing local timestamp", () => {
    const { store } = setup([answer]);
    const preview = store.previewImport(
      serializeAnswers([
        {
          ...answer,
          answer: { text: "Read origin on a cold miss.", kind: "text" },
          referenceViewed: true,
          updatedAt: "2026-10-07T02:00:00.000Z",
        },
      ]),
    );
    expect(preview.conflicts).toEqual([]);
    expect(store.applyImport(preview).ok).toBe(true);
    expect(store.getSnapshot().answers).toEqual([
      { ...answer, referenceViewed: true },
    ]);
  });
  it("never renews a version or merges reveal automatically across versions", () => {
    const { store } = setup([answer]);
    const old = { ...answer, contentVersion: "0.9.0", referenceViewed: true };
    let preview = store.previewImport(serializeAnswers([old]));
    expect(preview.conflicts).toHaveLength(1);
    expect(store.applyImport(preview).ok).toBe(true);
    expect(store.getSnapshot().answers).toEqual([answer]);
    preview = store.previewImport(serializeAnswers([old]));
    expect(store.applyImport(preview, { [conflictKey]: "incoming" }).ok).toBe(
      true,
    );
    expect(store.getSnapshot().answers).toEqual([old]);
  });
  it("uses an internal immutable plan rather than edited public preview records", () => {
    const { store } = setup([answer]);
    const preview = store.previewImport(serializeAnswers([incoming]));
    preview.conflicts[0]!.incoming.answer = { kind: "text", text: "Tampered" };
    preview.merged.length = 0;
    preview.imported[0]!.contentVersion = "9.9.9";
    expect(store.applyImport(preview, { [conflictKey]: "incoming" }).ok).toBe(
      true,
    );
    expect(store.getSnapshot().answers).toEqual([incoming]);
  });
  it("rejects forged/cross-store previews and unknown conflict choices without mutations", () => {
    const { disk, store } = setup([answer]);
    const preview = store.previewImport(serializeAnswers([incoming]));
    const before = store.getSnapshot();
    expect(store.applyImport({ ...preview }).ok).toBe(false);
    expect(setup([answer]).store.applyImport(preview).ok).toBe(false);
    expect(store.applyImport(preview, { bad: "incoming" }).ok).toBe(false);
    expect(
      store.applyImport(preview, { [conflictKey]: "invalid" } as never).ok,
    ).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(disk.storage.setItem).not.toHaveBeenCalled();
  });
  it("rejects an import after a local edit or another tab's raw change", () => {
    const { disk, store } = setup([answer]);
    let preview = store.previewImport(serializeAnswers([incoming]));
    store.save({ ...answer, referenceViewed: true });
    const edited = store.getSnapshot();
    expect(store.applyImport(preview).message).toContain("changed after");
    expect(store.getSnapshot()).toBe(edited);
    preview = store.previewImport(serializeAnswers([incoming]));
    disk.replace(serializeAnswers([incoming]));
    expect(store.applyImport(preview).message).toContain("changed after");
    expect(store.getSnapshot()).toBe(edited);
    expect(disk.raw()).toBe(serializeAnswers([incoming]));
  });
  it.each([
    ["malformed", "{broken"],
    [
      "future schema",
      JSON.stringify({ app: "hld-with-ui", schemaVersion: 2, answers: [] }),
    ],
    [
      "unknown field",
      JSON.stringify({
        app: "hld-with-ui",
        schemaVersion: 1,
        answers: [],
        complete: true,
      }),
    ],
    ["duplicate IDs", serializeAnswers([answer, answer])],
    [
      "invalid type",
      serializeAnswers([
        { ...answer, referenceViewed: 1 } as unknown as PracticeAnswer,
      ]),
    ],
    [
      "invalid version",
      serializeAnswers([{ ...answer, contentVersion: "latest" }]),
    ],
    [
      "normalized invalid date",
      serializeAnswers([{ ...answer, updatedAt: "2026-02-30T00:00:00.000Z" }]),
    ],
    [
      "too many records",
      serializeAnswers(
        Array.from({ length: 201 }, (_, index) => ({
          ...answer,
          activityId: `record-${index}`,
        })),
      ),
    ],
    [
      "too long text",
      serializeAnswers([
        { ...answer, answer: { kind: "text", text: "x".repeat(4001) } },
      ]),
    ],
    ["UTF8 bytes", "🚀".repeat(MAX_IMPORT_BYTES / 4 + 1)],
  ])(
    "rejects %s imported data without altering any local records",
    (_name, raw) => {
      const { disk, store } = setup([answer]);
      const before = store.getSnapshot();
      expect(store.previewImport(raw).ok).toBe(false);
      expect(store.getSnapshot()).toBe(before);
      expect(disk.storage.setItem).not.toHaveBeenCalled();
    },
  );
  it("validates the merged document's total record/byte limit", () => {
    const { store } = setup(
      Array.from({ length: 200 }, (_, index) => ({
        ...answer,
        activityId: `record-${index}`,
      })),
    );
    expect(store.previewImport(serializeAnswers([incoming])).ok).toBe(false);
    const large = setup(
      Array.from({ length: 40 }, (_, index) => ({
        ...answer,
        activityId: `local-${index}`,
        answer: { kind: "text", text: "x".repeat(4000) },
      })),
    );
    expect(
      large.store.previewImport(
        serializeAnswers(
          Array.from({ length: 40 }, (_, index) => ({
            ...answer,
            activityId: `incoming-${index}`,
            answer: { kind: "text", text: "x".repeat(4000) },
          })),
        ),
      ).ok,
    ).toBe(false);
  });
});

describe("reset and save recovery", () => {
  it.each(["records", "bytes"] as const)(
    "refuses an edit above the %s limit while keeping accepted answers exportable",
    (limit) => {
      const records = Array.from(
        { length: limit === "records" ? 200 : 70 },
        (_, index) => ({
          ...answer,
          activityId: `record-${index}`,
          answer: {
            kind: "text" as const,
            text: limit === "records" ? "Short" : "x".repeat(4000),
          },
        }),
      );
      if (limit === "bytes") {
        while (
          new TextEncoder().encode(serializeAnswers(records)).byteLength >
          MAX_IMPORT_BYTES
        ) {
          records.pop();
        }
      }
      const { disk, store } = setup(records);
      const original = disk.raw();
      const result = store.save({
        ...incoming,
        answer: {
          kind: "text",
          text: limit === "records" ? "New answer" : "x".repeat(4000),
        },
      });
      expect(result.ok).toBe(false);
      expect(result.message).toContain("answer limit was reached");
      expect(store.getSnapshot().answers).toEqual(records);
      expect(disk.raw()).toBe(original);
      expect(
        store.previewImport(serializeAnswers(store.getSnapshot().answers)).ok,
      ).toBe(true);
      expect(store.resetTopic("cache-aside").ok).toBe(true);
      expect(store.save(incoming).ok).toBe(true);
    },
  );
  it("resets only one topic's practice and guided answers, notifying with the new reset epoch", () => {
    const other = { ...answer, topicId: "request-flow" };
    const { disk, store } = setup([
      answer,
      { ...answer, activityId: "cold-miss-fill-tradeoff" },
      other,
    ]);
    const epochs: number[] = [];
    store.subscribe(() => epochs.push(store.getResetVersion("cache-aside")));
    expect(store.resetTopic("cache-aside")).toEqual({ ok: true });
    expect(store.getSnapshot().answers).toEqual([other]);
    expect(
      createPracticeStore(() => disk.storage).getSnapshot().answers,
    ).toEqual([other]);
    expect(epochs).toEqual([1]);
    expect(store.getResetVersion("request-flow")).toBe(0);
    expect(store.resetTopic("bad/id").ok).toBe(false);
  });
  it.each(["quota", "denied"] as const)(
    "failed %s import/reset preserves memory and disk; retry recovers",
    (failure) => {
      const { disk, store } = setup([answer]);
      const preview = store.previewImport(serializeAnswers([incoming]));
      const original = disk.raw();
      if (failure === "quota") disk.quota(true);
      else disk.deny(true);
      expect(store.applyImport(preview, { [conflictKey]: "incoming" }).ok).toBe(
        false,
      );
      expect(store.getSnapshot().answers).toEqual([answer]);
      expect(store.resetTopic("cache-aside").ok).toBe(false);
      expect(store.getResetVersion("cache-aside")).toBe(0);
      expect(store.getSnapshot().answers).toEqual([answer]);
      expect(disk.raw()).toBe(original);
      store.save(incoming);
      expect(store.getSnapshot().answers[0]!.answer).toEqual(incoming.answer);
      expect(store.retrySaving().ok).toBe(false);
      disk.quota(false);
      disk.deny(false);
      expect(store.retrySaving()).toEqual({ ok: true });
      expect(store.getSnapshot().issue).toBeNull();
      expect(
        createPracticeStore(() => disk.storage).getSnapshot().answers[0]!
          .answer,
      ).toEqual(incoming.answer);
    },
  );
  it("recovers storage that was denied during initial load only if durable raw is unchanged", () => {
    const disk = memory();
    disk.deny(true);
    const store = createPracticeStore(() => disk.storage);
    store.save(answer);
    disk.deny(false);
    expect(store.retrySaving().ok).toBe(true);
    const other = memory();
    other.deny(true);
    const blocked = createPracticeStore(() => other.storage);
    blocked.save(answer);
    other.deny(false);
    other.replace(serializeAnswers([incoming]));
    expect(blocked.retrySaving().ok).toBe(false);
    expect(other.raw()).toBe(serializeAnswers([incoming]));
  });
  it.each([
    "{broken",
    JSON.stringify({ app: "hld-with-ui", schemaVersion: 2, answers: [] }),
  ])("refuses import/reset/retry over unreadable previous data", (raw) => {
    const disk = memory(raw);
    const store = createPracticeStore(() => disk.storage);
    store.save(answer);
    expect(store.previewImport(serializeAnswers([incoming])).ok).toBe(false);
    expect(store.resetTopic("cache-aside").ok).toBe(false);
    expect(store.retrySaving().ok).toBe(false);
    expect(store.getSnapshot().answers[0]!.answer).toEqual(answer.answer);
    expect(store.getSnapshot().previousData).toBe(raw);
    expect(disk.raw()).toBe(raw);
    expect(disk.storage.setItem).not.toHaveBeenCalled();
  });
  it("does not recover over changes from another tab, and refuses externally corrupted data", () => {
    const { disk, store } = setup([answer]);
    disk.quota(true);
    store.save(incoming);
    disk.quota(false);
    disk.replace(
      serializeAnswers([{ ...answer, activityId: "other-activity" }]),
    );
    expect(store.retrySaving().ok).toBe(false);
    expect(store.resetTopic("cache-aside").ok).toBe(false);
    const unchanged = disk.raw();
    expect(store.getSnapshot().answers[0]!.answer).toEqual(incoming.answer);
    expect(disk.raw()).toBe(unchanged);
    const fresh = setup();
    fresh.disk.replace("{external corruption");
    fresh.store.save(answer);
    expect(fresh.store.retrySaving().ok).toBe(false);
    expect(fresh.disk.raw()).toBe("{external corruption");
  });
});
