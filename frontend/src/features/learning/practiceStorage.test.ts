import { describe, expect, it, vi } from "vitest";
import {
  createPracticeStore,
  PRACTICE_STORAGE_KEY,
  serializeAnswers,
  type PracticeAnswer,
} from "./practiceStorage";

const record: PracticeAnswer = {
  topicId: "request-flow",
  activityId: "request-flow-interview",
  contentVersion: "1.1.0",
  updatedAt: "2026-10-07T00:00:00.000Z",
  answer: { kind: "text", text: "Finite workers cause queues." },
  referenceViewed: false,
};
function memory(raw: string | null = null) {
  return {
    getItem: vi.fn(() => raw),
    setItem: vi.fn((_key: string, value: string) => {
      raw = value;
    }),
    raw: () => raw,
  };
}
const clock = () => "2026-10-07T01:00:00.000Z";

describe("versioned practice storage", () => {
  it("does not write when loading or visiting an activity; snapshots remain stable", () => {
    const storage = memory();
    const store = createPracticeStore(() => storage);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    expect(store.getSnapshot().answers).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("round trips Unicode answers and choices, preserving reference state and topic identities", () => {
    const storage = memory();
    const store = createPracticeStore(() => storage, clock);
    store.save({
      ...record,
      answer: { kind: "text", text: "队列 → café 🚀" },
      referenceViewed: true,
    });
    store.save({
      ...record,
      topicId: "cache-aside",
      answer: { kind: "choice", optionId: "b" },
    });
    const restored = createPracticeStore(() => storage).getSnapshot();
    expect(restored.answers).toHaveLength(2);
    expect(restored.answers[0]).toMatchObject({
      updatedAt: clock(),
      referenceViewed: true,
      answer: { text: "队列 → café 🚀" },
    });
    expect(restored.answers[1]?.topicId).toBe("cache-aside");
    expect(storage.setItem).toHaveBeenCalledWith(
      PRACTICE_STORAGE_KEY,
      expect.any(String),
    );
  });
  it("retains older-version and removed activity records without migrating mastery or writing", () => {
    const storage = memory(
      serializeAnswers([
        {
          ...record,
          contentVersion: "0.9.0",
          activityId: "removed-question",
          referenceViewed: true,
        },
      ]),
    );
    const store = createPracticeStore(() => storage);
    expect(store.getSnapshot().answers[0]).toMatchObject({
      contentVersion: "0.9.0",
      referenceViewed: true,
    });
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it.each([
    ["malformed JSON", "{not-json"],
    [
      "unsupported schema",
      JSON.stringify({ app: "hld-with-ui", schemaVersion: 2, answers: [] }),
    ],
    [
      "unknown envelope field",
      JSON.stringify({
        app: "hld-with-ui",
        schemaVersion: 1,
        answers: [],
        mastery: true,
      }),
    ],
    [
      "unknown record field",
      serializeAnswers([{ ...record, extra: true } as PracticeAnswer]),
    ],
    [
      "invalid answer type",
      serializeAnswers([
        {
          ...record,
          answer: { kind: "text", text: 3 },
        } as unknown as PracticeAnswer,
      ]),
    ],
    ["duplicate activity", serializeAnswers([record, record])],
    [
      "oversized answer",
      serializeAnswers([
        { ...record, answer: { kind: "text", text: "a".repeat(4_001) } },
      ]),
    ],
    ["oversized document", " ".repeat(256 * 1024 + 1)],
    [
      "invalid timestamp",
      serializeAnswers([{ ...record, updatedAt: "yesterday" }]),
    ],
  ])("preserves %s unchanged and keeps new work in memory", (_name, raw) => {
    const storage = memory(raw);
    const store = createPracticeStore(() => storage, clock);
    expect(store.getSnapshot().issue).not.toBeNull();
    expect(store.getSnapshot().previousData).toBe(raw);
    store.save(record);
    expect(store.getSnapshot().answers[0]?.answer).toEqual(record.answer);
    expect(storage.raw()).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("continues in memory when localStorage access is denied", () => {
    const store = createPracticeStore(() => {
      throw new DOMException("Denied", "SecurityError");
    }, clock);
    store.save(record);
    expect(store.getSnapshot().issue).toContain("unavailable");
    expect(store.getSnapshot().answers).toHaveLength(1);
  });
  it("keeps the existing saved document intact on quota failure and retains the new revision", () => {
    const storage = memory(serializeAnswers([record]));
    storage.setItem.mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    const store = createPracticeStore(() => storage, clock);
    store.save({
      ...record,
      answer: { kind: "text", text: "Revised explanation" },
    });
    expect(store.getSnapshot().issue).not.toBeNull();
    expect(store.getSnapshot().answers[0]?.answer).toEqual({
      kind: "text",
      text: "Revised explanation",
    });
    expect(storage.raw()).toBe(serializeAnswers([record]));
  });
  it("merges another tab's changes to a different activity before writing", () => {
    const storage = memory(serializeAnswers([record]));
    const store = createPracticeStore(() => storage, clock);
    store.getSnapshot();
    const other = { ...record, activityId: "other-activity" };
    storage.setItem(PRACTICE_STORAGE_KEY, serializeAnswers([record, other]));
    store.save({ ...record, referenceViewed: true });
    expect(store.getSnapshot().issue).toBeNull();
    expect(
      createPracticeStore(() => storage).getSnapshot().answers,
    ).toHaveLength(2);
  });
  it("detects another tab's conflicting answer and does not overwrite it", () => {
    const storage = memory(serializeAnswers([record]));
    const store = createPracticeStore(() => storage, clock);
    store.getSnapshot();
    const remote = serializeAnswers([
      { ...record, answer: { kind: "text", text: "Other tab answer" } },
    ]);
    storage.setItem(PRACTICE_STORAGE_KEY, remote);
    store.save({
      ...record,
      answer: { kind: "text", text: "My new revision" },
    });
    expect(store.getSnapshot().issue).toContain("Another tab");
    expect(store.getSnapshot().answers[0]?.answer).toEqual({
      kind: "text",
      text: "My new revision",
    });
    expect(store.getSnapshot().previousData).toBe(remote);
    expect(storage.raw()).toBe(remote);
  });
  it("detects externally corrupted data at save time without replacing it", () => {
    const storage = memory();
    const store = createPracticeStore(() => storage, clock);
    store.getSnapshot();
    storage.setItem(PRACTICE_STORAGE_KEY, "{broken");
    store.save(record);
    expect(store.getSnapshot().issue).not.toBeNull();
    expect(store.getSnapshot().previousData).toBe("{broken");
    expect(storage.raw()).toBe("{broken");
  });
  it("notifies subscribers for revisions and unsubscribes cleanly", () => {
    const store = createPracticeStore(() => memory(), clock);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.save(record);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.save(record);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
