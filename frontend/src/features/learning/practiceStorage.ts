export const PRACTICE_STORAGE_KEY = "hld-practice-v1";
export const MAX_ANSWER_LENGTH = 4_000;
const MAX_RECORDS = 200;
const MAX_BYTES = 256 * 1024;

export type PracticeAnswer = {
  topicId: string;
  activityId: string;
  contentVersion: string;
  updatedAt: string;
  answer:
    | { kind: "text"; text: string }
    | { kind: "choice"; optionId: string | null };
  referenceViewed: boolean;
};
type Envelope = {
  app: "hld-with-ui";
  schemaVersion: 1;
  answers: PracticeAnswer[];
};
type StorageAccess = Pick<Storage, "getItem" | "setItem">;
export type PracticeSnapshot = {
  answers: PracticeAnswer[];
  issue: string | null;
  previousData: string | null;
};

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: string[]) {
  return (
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}
const id = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) &&
  value.length <= 100;

function validAnswer(value: unknown): value is PracticeAnswer {
  if (
    !object(value) ||
    !keys(value, [
      "topicId",
      "activityId",
      "contentVersion",
      "updatedAt",
      "answer",
      "referenceViewed",
    ])
  )
    return false;
  if (
    !id(value.topicId) ||
    !id(value.activityId) ||
    typeof value.contentVersion !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(value.contentVersion) ||
    value.contentVersion.length > 32 ||
    typeof value.updatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.updatedAt) ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    typeof value.referenceViewed !== "boolean" ||
    !object(value.answer)
  )
    return false;
  const answer = value.answer;
  return (
    (answer.kind === "text" &&
      keys(answer, ["kind", "text"]) &&
      typeof answer.text === "string" &&
      answer.text.length <= MAX_ANSWER_LENGTH) ||
    (answer.kind === "choice" &&
      keys(answer, ["kind", "optionId"]) &&
      (answer.optionId === null || id(answer.optionId)))
  );
}

export function serializeAnswers(answers: PracticeAnswer[]): string {
  const envelope: Envelope = { app: "hld-with-ui", schemaVersion: 1, answers };
  return JSON.stringify(envelope, null, 2);
}

function readEnvelope(raw: string): Envelope {
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES)
    throw new Error("Saved answers exceed this app's size limit.");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Saved answers could not be read.");
  }
  if (object(value) && value.schemaVersion !== 1)
    throw new Error("Saved answers use an unsupported version.");
  if (
    !object(value) ||
    !keys(value, ["app", "schemaVersion", "answers"]) ||
    value.app !== "hld-with-ui" ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.answers) ||
    value.answers.length > MAX_RECORDS ||
    !value.answers.every(validAnswer)
  )
    throw new Error("Saved answers have an invalid format.");
  const answers = value.answers as PracticeAnswer[];
  if (
    new Set(answers.map((answer) => `${answer.topicId}/${answer.activityId}`))
      .size !== answers.length
  )
    throw new Error("Saved answers contain duplicate activities.");
  return { app: "hld-with-ui", schemaVersion: 1, answers };
}

function sameActivity(
  a: PracticeAnswer,
  b: Pick<PracticeAnswer, "topicId" | "activityId">,
) {
  return a.topicId === b.topicId && a.activityId === b.activityId;
}

// One session store survives route changes, including when durable storage fails.
// No writes occur on load, on page visits, or when a content version changes.
export function createPracticeStore(
  storage: () => StorageAccess,
  now: () => string = () => new Date().toISOString(),
) {
  let snapshot: PracticeSnapshot = {
    answers: [],
    issue: null,
    previousData: null,
  };
  let loaded = false;
  let lastRaw: string | null = null;
  const listeners = new Set<() => void>();
  function load() {
    if (loaded) return;
    loaded = true;
    try {
      lastRaw = storage().getItem(PRACTICE_STORAGE_KEY);
      if (lastRaw !== null)
        snapshot = { ...snapshot, answers: readEnvelope(lastRaw).answers };
    } catch (cause) {
      snapshot = {
        ...snapshot,
        issue:
          lastRaw === null
            ? "Browser storage is unavailable."
            : cause instanceof Error
              ? cause.message
              : "Saved answers could not be read.",
        previousData: lastRaw,
      };
    }
  }
  return {
    getSnapshot() {
      load();
      return snapshot;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    save(input: Omit<PracticeAnswer, "updatedAt">) {
      load();
      const record = { ...input, updatedAt: now() };
      if (!validAnswer(record)) throw new Error("Invalid practice answer.");
      let base = snapshot.answers;
      let issue = snapshot.issue;
      let previousData = snapshot.previousData;
      if (!issue) {
        try {
          const currentRaw = storage().getItem(PRACTICE_STORAGE_KEY);
          if (currentRaw !== lastRaw) {
            previousData = currentRaw;
            const remote =
              currentRaw === null ? [] : readEnvelope(currentRaw).answers;
            const original = base.find((answer) =>
              sameActivity(answer, record),
            );
            const changed = remote.find((answer) =>
              sameActivity(answer, record),
            );
            if (JSON.stringify(original) !== JSON.stringify(changed))
              throw new Error(
                "Another tab changed this answer. Download your work before reloading.",
              );
            // Preserve changes to other activities made by another browser tab.
            base = remote;
          }
        } catch (cause) {
          issue =
            cause instanceof Error
              ? cause.message
              : "Browser storage is unavailable.";
        }
      }
      const answers = [
        ...base.filter((answer) => !sameActivity(answer, record)),
        record,
      ];
      if (!issue) {
        try {
          const raw = serializeAnswers(answers);
          readEnvelope(raw); // Bound the complete document before attempting a write.
          storage().setItem(PRACTICE_STORAGE_KEY, raw);
          lastRaw = raw;
          previousData = null;
        } catch {
          issue = "Your answers could not be saved on this browser.";
          previousData ??= lastRaw;
        }
      }
      snapshot = { answers, issue, previousData };
      listeners.forEach((listener) => listener());
    },
  };
}

let browserStore: ReturnType<typeof createPracticeStore> | undefined;
export function getPracticeStore() {
  return (browserStore ??= createPracticeStore(() => window.localStorage));
}
