import type { CatalogEntry } from "../../api/types";

export const BOOKMARK_STORAGE_KEY = "hld-bookmarks-v1";
export const MAX_BOOKMARK_BYTES = 64 * 1024;
export const MAX_BOOKMARKS = 100;
export type Bookmark = Readonly<{
  moduleId: string;
  kind: "topic" | "case-study";
  contentVersion: string;
  savedAt: string;
}>;
export type BookmarkSnapshot = Readonly<{
  bookmarks: readonly Bookmark[];
  issue: string | null;
  previousData: string | null;
}>;
type Result = { ok: boolean; message?: string };
export type BookmarkImportPreview = Readonly<
  Result & {
    added: number;
    kept: number;
    moduleIds: readonly string[];
  }
>;
type StorageAccess = Pick<Storage, "getItem" | "setItem">;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, expected: string[]) {
  return (
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}
function validBookmark(value: unknown): value is Bookmark {
  return (
    object(value) &&
    exactKeys(value, ["moduleId", "kind", "contentVersion", "savedAt"]) &&
    typeof value.moduleId === "string" &&
    value.moduleId.length <= 100 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.moduleId) &&
    (value.kind === "topic" || value.kind === "case-study") &&
    typeof value.contentVersion === "string" &&
    value.contentVersion.length <= 32 &&
    /^\d+\.\d+\.\d+$/.test(value.contentVersion) &&
    typeof value.savedAt === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.savedAt) &&
    Number.isFinite(Date.parse(value.savedAt)) &&
    new Date(value.savedAt).toISOString() === value.savedAt
  );
}
export function serializeBookmarks(bookmarks: readonly Bookmark[]) {
  return JSON.stringify(
    { app: "hld-with-ui", kind: "bookmarks", schemaVersion: 1, bookmarks },
    null,
    2,
  );
}
export function readBookmarks(raw: string): Bookmark[] {
  if (new TextEncoder().encode(raw).byteLength > MAX_BOOKMARK_BYTES)
    throw new Error("Choose a bookmark backup of 64 KiB or less.");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("This bookmark backup could not be read.");
  }
  if (object(value) && value.schemaVersion !== 1)
    throw new Error("This bookmark backup uses an unsupported version.");
  if (
    !object(value) ||
    !exactKeys(value, ["app", "kind", "schemaVersion", "bookmarks"]) ||
    value.app !== "hld-with-ui" ||
    value.kind !== "bookmarks" ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.bookmarks) ||
    value.bookmarks.length > MAX_BOOKMARKS ||
    !value.bookmarks.every(validBookmark)
  )
    throw new Error("This bookmark backup has an invalid format.");
  if (
    new Set(value.bookmarks.map((item) => item.moduleId)).size !==
    value.bookmarks.length
  )
    throw new Error("This bookmark backup contains duplicate modules.");
  return value.bookmarks;
}

// Navigation references have their own envelope: they are never answer or mastery evidence.
// Reads/visits do not write. A failed write retains the user's action for this session.
export function createBookmarkStore(
  storage: () => StorageAccess,
  now = () => new Date().toISOString(),
) {
  let loaded = false;
  let lastRaw: string | null = null;
  let readOnly = false;
  let revision = 0;
  let snapshot: BookmarkSnapshot = {
    bookmarks: [],
    issue: null,
    previousData: null,
  };
  const listeners = new Set<() => void>();
  const previews = new WeakMap<
    BookmarkImportPreview,
    { revision: number; merged: readonly Bookmark[] }
  >();
  function freeze(next: BookmarkSnapshot): BookmarkSnapshot {
    return Object.freeze({
      ...next,
      bookmarks: Object.freeze(
        next.bookmarks.map((item) => Object.freeze({ ...item })),
      ),
    });
  }
  function publish(next: BookmarkSnapshot) {
    snapshot = freeze(next);
    revision += 1;
    listeners.forEach((listener) => listener());
  }
  function load() {
    if (loaded) return;
    loaded = true;
    try {
      lastRaw = storage().getItem(BOOKMARK_STORAGE_KEY);
      snapshot = freeze({
        ...snapshot,
        bookmarks: lastRaw === null ? [] : readBookmarks(lastRaw),
      });
    } catch (cause) {
      readOnly = lastRaw !== null;
      snapshot = freeze({
        ...snapshot,
        previousData: lastRaw,
        issue:
          lastRaw === null
            ? "Browser storage is unavailable."
            : cause instanceof Error
              ? cause.message
              : "Previous bookmarks could not be read.",
      });
    }
  }
  function persist(bookmarks: readonly Bookmark[]): Result {
    if (readOnly)
      return {
        ok: false,
        message:
          "Previous bookmark data cannot be safely replaced. Download it before resolving its format or version.",
      };
    try {
      const current = storage().getItem(BOOKMARK_STORAGE_KEY);
      if (current !== lastRaw)
        return {
          ok: false,
          message:
            "Bookmarks changed in another tab. Download your session bookmarks before reloading.",
        };
      const raw = serializeBookmarks(bookmarks);
      readBookmarks(raw);
      storage().setItem(BOOKMARK_STORAGE_KEY, raw);
      lastRaw = raw;
      return { ok: true };
    } catch {
      return {
        ok: false,
        message:
          "Bookmarks could not be saved on this browser. Download them or try saving again.",
      };
    }
  }
  function commit(bookmarks: readonly Bookmark[]): Result {
    if (bookmarks.length > MAX_BOOKMARKS)
      return {
        ok: false,
        message:
          "You can save up to 100 modules. Remove one before adding another.",
      };
    try {
      readBookmarks(serializeBookmarks(bookmarks));
    } catch (cause) {
      return {
        ok: false,
        message:
          cause instanceof Error
            ? cause.message
            : "These bookmarks could not be saved.",
      };
    }
    const result = persist(bookmarks);
    publish({
      bookmarks,
      issue: result.ok ? null : result.message!,
      previousData: result.ok ? null : snapshot.previousData,
    });
    return {
      ok: true,
      message: result.ok
        ? undefined
        : "Your change is kept for this session only. Download bookmarks before leaving or reloading.",
    };
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
    toggle(entry: CatalogEntry): Result {
      load();
      if (entry.status !== "published")
        return {
          ok: false,
          message: "Only published modules can be bookmarked.",
        };
      if (snapshot.bookmarks.some((item) => item.moduleId === entry.id))
        return commit(
          snapshot.bookmarks.filter((item) => item.moduleId !== entry.id),
        );
      return commit([
        ...snapshot.bookmarks,
        {
          moduleId: entry.id,
          kind: entry.kind,
          contentVersion: entry.contentVersion,
          savedAt: now(),
        },
      ]);
    },
    remove(moduleId: string): Result {
      load();
      return commit(
        snapshot.bookmarks.filter((item) => item.moduleId !== moduleId),
      );
    },
    clear(): Result {
      load();
      return commit([]);
    },
    retrySaving(): Result {
      load();
      const result = persist(snapshot.bookmarks);
      publish({
        ...snapshot,
        issue: result.ok ? null : result.message!,
        previousData: result.ok ? null : snapshot.previousData,
      });
      return result;
    },
    previewImport(raw: string): BookmarkImportPreview {
      load();
      try {
        const imported = readBookmarks(raw);
        const added = imported.filter(
          (incoming) =>
            !snapshot.bookmarks.some(
              (local) => local.moduleId === incoming.moduleId,
            ),
        );
        const merged = [...snapshot.bookmarks, ...added];
        readBookmarks(serializeBookmarks(merged));
        const preview: BookmarkImportPreview = Object.freeze({
          ok: true,
          added: added.length,
          kept: imported.length - added.length,
          moduleIds: Object.freeze(added.map((item) => item.moduleId)),
        });
        previews.set(preview, { revision, merged });
        return preview;
      } catch (cause) {
        return {
          ok: false,
          added: 0,
          kept: 0,
          moduleIds: [],
          message:
            cause instanceof Error
              ? cause.message
              : "This backup could not be read.",
        };
      }
    },
    applyImport(preview: BookmarkImportPreview): Result {
      load();
      const staged = previews.get(preview);
      if (!staged || staged.revision !== revision)
        return {
          ok: false,
          message:
            "Bookmarks changed after this preview. Choose the backup again before importing.",
        };
      try {
        if (storage().getItem(BOOKMARK_STORAGE_KEY) !== lastRaw)
          return {
            ok: false,
            message:
              "Bookmarks changed in another tab. Download your current work and reload before importing.",
          };
      } catch {
        // Explicit imports can still be kept in session memory when storage is denied.
      }
      previews.delete(preview);
      return commit(staged.merged);
    },
  };
}

let singleton: ReturnType<typeof createBookmarkStore> | undefined;
export function getBookmarkStore() {
  return (singleton ??= createBookmarkStore(() => window.localStorage));
}
