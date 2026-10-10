export const PRACTICE_STORAGE_KEY = "hld-practice-v1";
export const MAX_ANSWER_LENGTH = 4_000;
const MAX_RECORDS = 200;
export const MAX_IMPORT_BYTES = 256 * 1024;

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
export type StorageResult = { ok: boolean; message?: string };
export type ImportConflict = {
  key: string;
  topicId: string;
  activityId: string;
  local: PracticeAnswer;
  incoming: PracticeAnswer;
};
export type ImportPreview = StorageResult & {
  imported: PracticeAnswer[];
  merged: PracticeAnswer[];
  conflicts: ImportConflict[];
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

export function validAnswer(value: unknown): value is PracticeAnswer {
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
    new Date(value.updatedAt).toISOString() !== value.updatedAt ||
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
  if (new TextEncoder().encode(raw).byteLength > MAX_IMPORT_BYTES)
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
function activityKey(answer: PracticeAnswer) {
  return `${answer.topicId}/${answer.activityId}`;
}
function emptyAnswer(answer: PracticeAnswer) {
  return answer.answer.kind === "text"
    ? answer.answer.text.trim().length === 0
    : answer.answer.optionId === null;
}
function sameAnswer(a: PracticeAnswer, b: PracticeAnswer) {
  return a.answer.kind === "text" && b.answer.kind === "text"
    ? a.answer.text === b.answer.text
    : a.answer.kind === "choice" &&
        b.answer.kind === "choice" &&
        a.answer.optionId === b.answer.optionId;
}
function cloneAnswers(answers: PracticeAnswer[]): PracticeAnswer[] {
  return answers.map((answer) => ({ ...answer, answer: { ...answer.answer } }));
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
  let readOnly = false;
  let revision = 0;
  const resetVersions = new Map<string, number>();
  const previews = new WeakMap<
    ImportPreview,
    {
      revision: number;
      raw: string | null;
      merged: PracticeAnswer[];
      conflicts: ImportConflict[];
    }
  >();
  const listeners = new Set<() => void>();
  function publish(next: PracticeSnapshot) {
    snapshot = next;
    revision += 1;
    listeners.forEach((listener) => listener());
  }
  function failure(message: string): StorageResult {
    publish({ ...snapshot, issue: message });
    return { ok: false, message };
  }
  function writeAnswers(
    answers: PracticeAnswer[],
    onSuccess?: () => void,
  ): StorageResult {
    if (readOnly)
      return failure(
        "Previous saved data cannot be safely replaced. Download it before resolving its format or version.",
      );
    try {
      const currentRaw = storage().getItem(PRACTICE_STORAGE_KEY);
      if (currentRaw !== lastRaw)
        return failure(
          "Saved data changed in another tab. Download your work before reloading.",
        );
      const raw = serializeAnswers(answers);
      readEnvelope(raw);
      storage().setItem(PRACTICE_STORAGE_KEY, raw);
      lastRaw = raw;
      onSuccess?.();
      publish({ answers, issue: null, previousData: null });
      return { ok: true };
    } catch (cause) {
      return failure(
        cause instanceof Error && cause.name === "Error"
          ? cause.message
          : "Your answers could not be saved on this browser. Download your work or try saving again.",
      );
    }
  }
  function load() {
    if (loaded) return;
    loaded = true;
    try {
      lastRaw = storage().getItem(PRACTICE_STORAGE_KEY);
      if (lastRaw !== null)
        snapshot = { ...snapshot, answers: readEnvelope(lastRaw).answers };
    } catch (cause) {
      readOnly = lastRaw !== null;
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
    previewImport(raw: string): ImportPreview {
      load();
      const reject = (message: string): ImportPreview => ({
        ok: false,
        message,
        imported: [],
        merged: [],
        conflicts: [],
      });
      try {
        const imported = readEnvelope(raw).answers;
        if (readOnly)
          return reject(
            "Previous saved data cannot be safely replaced. Download it before resolving its format or version.",
          );
        const currentRaw = storage().getItem(PRACTICE_STORAGE_KEY);
        if (currentRaw !== lastRaw)
          return reject(
            "Saved data changed in another tab. Download your work before reloading.",
          );
        const merged = cloneAnswers(snapshot.answers);
        const conflicts: ImportConflict[] = [];
        for (const incoming of imported) {
          const index = merged.findIndex((local) =>
            sameActivity(local, incoming),
          );
          if (index < 0) {
            merged.push(...cloneAnswers([incoming]));
            continue;
          }
          const local = merged[index]!;
          if (local.contentVersion !== incoming.contentVersion) {
            conflicts.push({
              key: activityKey(local),
              topicId: local.topicId,
              activityId: local.activityId,
              local,
              incoming,
            });
          } else if (sameAnswer(local, incoming)) {
            merged[index] = {
              ...local,
              referenceViewed:
                local.referenceViewed || incoming.referenceViewed,
            };
          } else if (emptyAnswer(local)) {
            merged[index] = cloneAnswers([incoming])[0]!;
          } else {
            conflicts.push({
              key: activityKey(local),
              topicId: local.topicId,
              activityId: local.activityId,
              local,
              incoming,
            });
          }
        }
        readEnvelope(serializeAnswers(merged));
        const preview: ImportPreview = {
          ok: true,
          imported: cloneAnswers(imported),
          merged: cloneAnswers(merged),
          conflicts: conflicts.map((conflict) => ({
            ...conflict,
            local: cloneAnswers([conflict.local])[0]!,
            incoming: cloneAnswers([conflict.incoming])[0]!,
          })),
        };
        previews.set(preview, { revision, raw: currentRaw, merged, conflicts });
        return preview;
      } catch (cause) {
        return reject(
          cause instanceof Error && cause.name === "Error"
            ? cause.message
            : "Browser storage is unavailable. Download your work before trying again.",
        );
      }
    },
    applyImport(
      preview: ImportPreview,
      choices: Record<string, "local" | "incoming"> = {},
    ): StorageResult {
      load();
      const plan = previews.get(preview);
      if (!plan || !preview.ok)
        return {
          ok: false,
          message: "Choose a valid import file and preview it first.",
        };
      if (plan.revision !== revision)
        return {
          ok: false,
          message:
            "Your answers changed after this preview. Preview the file again.",
        };
      if (
        !object(choices) ||
        Object.entries(choices).some(
          ([key, choice]) =>
            !plan.conflicts.some((conflict) => conflict.key === key) ||
            (choice !== "local" && choice !== "incoming"),
        )
      )
        return {
          ok: false,
          message:
            "Choose local or imported answers for the listed conflicts only.",
        };
      try {
        if (storage().getItem(PRACTICE_STORAGE_KEY) !== plan.raw)
          return {
            ok: false,
            message:
              "Saved data changed after this preview. Download your work before reloading.",
          };
      } catch {
        return failure(
          "Browser storage is unavailable. Your existing answers have been kept.",
        );
      }
      const merged = cloneAnswers(plan.merged);
      for (const conflict of plan.conflicts) {
        if (choices[conflict.key] === "incoming") {
          const index = merged.findIndex((answer) =>
            sameActivity(answer, conflict.incoming),
          );
          merged[index] = cloneAnswers([conflict.incoming])[0]!;
        }
      }
      return writeAnswers(merged);
    },
    resetTopic(topicId: string): StorageResult {
      load();
      if (!id(topicId))
        return { ok: false, message: "Choose a valid module to reset." };
      return writeAnswers(
        snapshot.answers.filter((answer) => answer.topicId !== topicId),
        () => {
          resetVersions.set(topicId, (resetVersions.get(topicId) ?? 0) + 1);
        },
      );
    },
    getResetVersion(topicId: string): number {
      return resetVersions.get(topicId) ?? 0;
    },
    retrySaving(): StorageResult {
      load();
      return writeAnswers(cloneAnswers(snapshot.answers));
    },
    save(input: Omit<PracticeAnswer, "updatedAt">): StorageResult {
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
            let remote: PracticeAnswer[];
            try {
              remote =
                currentRaw === null ? [] : readEnvelope(currentRaw).answers;
            } catch (cause) {
              readOnly = true;
              throw cause;
            }
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
      let raw: string;
      try {
        raw = serializeAnswers(answers);
        readEnvelope(raw);
      } catch {
        return failure(
          "This edit was not saved because the answer limit was reached. Download a backup and reset a module, then try again.",
        );
      }
      if (!issue) {
        try {
          storage().setItem(PRACTICE_STORAGE_KEY, raw);
          lastRaw = raw;
          previousData = null;
        } catch {
          issue = "Your answers could not be saved on this browser.";
          previousData ??= lastRaw;
        }
      }
      publish({ answers, issue, previousData });
      return issue ? { ok: false, message: issue } : { ok: true };
    },
  };
}

let browserStore: ReturnType<typeof createPracticeStore> | undefined;
export function getPracticeStore() {
  return (browserStore ??= createPracticeStore(() => window.localStorage));
}
