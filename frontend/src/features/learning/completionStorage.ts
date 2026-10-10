import {
  validAnswer,
  type PracticeAnswer,
  type StorageResult,
} from "./practiceStorage";

export const COMPLETION_STORAGE_KEY = "hld-completion-v1";
export const MAX_COMPLETION_BYTES = 256 * 1024;
const MAX_RECORDS = 200;
type Base = { moduleId: string; contentVersion: string; updatedAt: string };
export type CompletionRecord =
  | (Base & { kind: "reading" })
  | (Base & { kind: "practice"; answer: PracticeAnswer });
type Snapshot = {
  records: CompletionRecord[];
  issue: string | null;
  previousData: string | null;
};
type Access = Pick<Storage, "getItem" | "setItem">;
export type CompletionPreview = { count: number };
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, names: string[]) =>
  Object.keys(v).length === names.length &&
  names.every((name) => Object.hasOwn(v, name));
const id = (v: unknown) =>
  typeof v === "string" &&
  v.length <= 100 &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
const version = (v: unknown) =>
  typeof v === "string" && v.length <= 32 && /^\d+\.\d+\.\d+$/.test(v);
const date = (v: unknown) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
const key = (r: CompletionRecord) =>
  `${r.moduleId}/${r.kind}/${r.kind === "practice" ? r.answer.activityId : "reading"}`;
const clone = (records: readonly CompletionRecord[]): CompletionRecord[] =>
  records.map((r) =>
    r.kind === "reading"
      ? { ...r }
      : { ...r, answer: { ...r.answer, answer: { ...r.answer.answer } } },
  );
export function serializeCompletions(records: readonly CompletionRecord[]) {
  return JSON.stringify(
    { app: "hld-with-ui", kind: "completion", schemaVersion: 1, records },
    null,
    2,
  );
}
function validRecord(v: unknown): v is CompletionRecord {
  if (
    !object(v) ||
    !id(v.moduleId) ||
    !version(v.contentVersion) ||
    !date(v.updatedAt)
  )
    return false;
  return v.kind === "reading"
    ? exact(v, ["kind", "moduleId", "contentVersion", "updatedAt"])
    : v.kind === "practice" &&
        exact(v, [
          "kind",
          "moduleId",
          "contentVersion",
          "updatedAt",
          "answer",
        ]) &&
        validAnswer(v.answer) &&
        v.answer.topicId === v.moduleId &&
        v.answer.contentVersion === v.contentVersion &&
        (v.answer.answer.kind === "text"
          ? v.answer.answer.text.trim().length > 0
          : v.answer.answer.optionId !== null);
}
function parse(raw: string): CompletionRecord[] {
  if (new TextEncoder().encode(raw).byteLength > MAX_COMPLETION_BYTES)
    throw new Error("Completion data exceeds the 256 KiB limit.");
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new Error("Completion data could not be read.");
  }
  if (object(v) && v.schemaVersion !== 1)
    throw new Error("Completion data uses an unsupported version.");
  if (object(v) && Array.isArray(v.records) && v.records.length > MAX_RECORDS)
    throw new Error(
      "Completion data exceeds the 200 mark limit. Download a backup and clear marks for a module before adding more.",
    );
  if (
    !object(v) ||
    !exact(v, ["app", "kind", "schemaVersion", "records"]) ||
    v.app !== "hld-with-ui" ||
    v.kind !== "completion" ||
    v.schemaVersion !== 1 ||
    !Array.isArray(v.records) ||
    v.records.length > MAX_RECORDS ||
    !v.records.every(validRecord)
  )
    throw new Error("Completion data has an invalid format.");
  const records = v.records as CompletionRecord[];
  if (new Set(records.map(key)).size !== records.length)
    throw new Error("Completion data contains duplicate activities.");
  return clone(records);
}

// Separate self-reported evidence. No visits, answer saves or reference reveals write here.
export function createCompletionStore(
  storage: () => Access,
  now = () => new Date().toISOString(),
) {
  let snapshot: Snapshot = { records: [], issue: null, previousData: null };
  let loaded = false,
    readOnly = false,
    lastRaw: string | null = null,
    revision = 0;
  const listeners = new Set<() => void>();
  const previews = new WeakMap<
    CompletionPreview,
    { records: CompletionRecord[]; revision: number; raw: string | null }
  >();
  function publish(next: Snapshot) {
    snapshot = next;
    revision++;
    listeners.forEach((fn) => fn());
  }
  function load() {
    if (loaded) return;
    loaded = true;
    try {
      lastRaw = storage().getItem(COMPLETION_STORAGE_KEY);
      if (lastRaw !== null) snapshot.records = parse(lastRaw);
    } catch (e) {
      readOnly = lastRaw !== null;
      snapshot.issue =
        e instanceof Error ? e.message : "Browser storage is unavailable.";
      snapshot.previousData = lastRaw;
    }
  }
  function persist(
    records: CompletionRecord[],
    sessionFallback: boolean,
  ): StorageResult {
    let raw: string;
    try {
      raw = serializeCompletions(records);
      parse(raw);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Completion limits reached.";
      publish({ ...snapshot, issue: message });
      return { ok: false, message };
    }
    let previousData = snapshot.previousData ?? lastRaw;
    try {
      if (readOnly)
        throw new Error(
          "Previous completion data cannot be safely replaced. Download it before resolving its format or version.",
        );
      const currentRaw = storage().getItem(COMPLETION_STORAGE_KEY);
      if (currentRaw !== lastRaw) {
        previousData = currentRaw;
        throw new Error(
          "Completion data changed in another tab. Download your session marks before reloading.",
        );
      }
      storage().setItem(COMPLETION_STORAGE_KEY, raw);
      lastRaw = raw;
      publish({ records: clone(records), issue: null, previousData: null });
      return { ok: true };
    } catch (e) {
      const reason =
        e instanceof Error && e.name === "Error"
          ? e.message
          : "Completion marks could not be saved on this browser.";
      const message = sessionFallback
        ? `${reason} Your change is kept for this session only.`
        : reason;
      publish({
        ...snapshot,
        previousData,
        ...(sessionFallback ? { records: clone(records) } : {}),
        issue: message,
      });
      return { ok: false, message };
    }
  }
  function replaceMarks(incoming: CompletionRecord[]) {
    const keys = new Set(incoming.map(key));
    return persist(
      [...snapshot.records.filter((r) => !keys.has(key(r))), ...incoming],
      true,
    );
  }
  return {
    getSnapshot() {
      load();
      return snapshot;
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    markReading(moduleId: string, contentVersion: string, done: boolean) {
      load();
      const record: CompletionRecord = {
        kind: "reading",
        moduleId,
        contentVersion,
        updatedAt: now(),
      };
      if (!validRecord(record)) throw new Error("Invalid reading completion.");
      return done
        ? replaceMarks([record])
        : persist(
            snapshot.records.filter((r) => key(r) !== key(record)),
            true,
          );
    },
    markReviewed(answers: readonly PracticeAnswer[]) {
      load();
      const records: CompletionRecord[] = answers.map((answer) => ({
        kind: "practice",
        moduleId: answer.topicId,
        contentVersion: answer.contentVersion,
        updatedAt: now(),
        answer: { ...answer, answer: { ...answer.answer } },
      }));
      if (
        !records.every(validRecord) ||
        new Set(records.map(key)).size !== records.length
      )
        throw new Error("Invalid reviewed answers.");
      return records.length ? replaceMarks(records) : { ok: true };
    },
    clearModule(moduleId: string) {
      load();
      if (!id(moduleId)) throw new Error("Invalid module.");
      return persist(
        snapshot.records.filter((r) => r.moduleId !== moduleId),
        false,
      );
    },
    retrySaving() {
      load();
      return persist(snapshot.records, false);
    },
    previewImport(raw: string): CompletionPreview {
      load();
      const records = parse(raw);
      if (readOnly)
        throw new Error(
          "Previous completion data cannot be safely replaced. Download it before resolving its format or version.",
        );
      const current = storage().getItem(COMPLETION_STORAGE_KEY);
      if (current !== lastRaw)
        throw new Error(
          "Completion data changed in another tab. Download your marks before reloading.",
        );
      const preview = { count: records.length };
      previews.set(preview, { records, revision, raw: current });
      return preview;
    },
    applyImport(preview: CompletionPreview): StorageResult {
      load();
      const plan = previews.get(preview);
      if (!plan || plan.revision !== revision)
        return {
          ok: false,
          message:
            "Completion marks changed after this preview. Preview the file again.",
        };
      try {
        if (storage().getItem(COMPLETION_STORAGE_KEY) !== plan.raw)
          return {
            ok: false,
            message:
              "Completion data changed in another tab. Preview the file again after reloading.",
          };
      } catch {
        return {
          ok: false,
          message: "Browser storage is unavailable. Existing marks were kept.",
        };
      }
      return persist(plan.records, false);
    },
  };
}
let browserStore: ReturnType<typeof createCompletionStore> | undefined;
export function getCompletionStore() {
  return (browserStore ??= createCompletionStore(() => window.localStorage));
}
