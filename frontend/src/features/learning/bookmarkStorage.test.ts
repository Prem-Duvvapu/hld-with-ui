import { describe, expect, it, vi } from "vitest";
import catalog from "../../../../content/catalog.json";
import type { CatalogEntry } from "../../api/types";
import {
  BOOKMARK_STORAGE_KEY,
  createBookmarkStore,
  MAX_BOOKMARK_BYTES,
  MAX_BOOKMARKS,
  readBookmarks,
  serializeBookmarks,
  type Bookmark,
} from "./bookmarkStorage";

const entry = catalog[0] as CatalogEntry;
const date = "2026-10-10T00:00:00.000Z";
const record = (moduleId = entry.id): Bookmark => ({
  moduleId,
  kind: "topic",
  contentVersion: "1.0.0",
  savedAt: date,
});
function setup(records: Bookmark[] = []) {
  let raw: string | null = records.length ? serializeBookmarks(records) : null;
  let denied = false;
  const setItem = vi.fn((_key: string, value: string) => {
    if (denied) throw new DOMException("Denied", "QuotaExceededError");
    raw = value;
  });
  const store = createBookmarkStore(
    () => ({ getItem: () => raw, setItem }),
    () => date,
  );
  return {
    store,
    setItem,
    raw: () => raw,
    replace: (value: string) => {
      raw = value;
    },
    deny: (value: boolean) => {
      denied = value;
    },
  };
}

describe("bookmark persistence", () => {
  it("never writes on reads/visits, and saves a navigation reference without answer data", () => {
    const s = setup();
    expect(s.store.getSnapshot().bookmarks).toEqual([]);
    expect(s.setItem).not.toHaveBeenCalled();
    expect(s.store.toggle(entry)).toEqual({ ok: true, message: undefined });
    expect(readBookmarks(s.raw()!)).toEqual([
      { ...record(), contentVersion: entry.contentVersion },
    ]);
    expect(s.setItem).toHaveBeenCalledExactlyOnceWith(
      BOOKMARK_STORAGE_KEY,
      s.raw(),
    );
    expect(JSON.parse(s.raw()!)).not.toHaveProperty("answers");
    const fresh = createBookmarkStore(() => ({
      getItem: s.raw,
      setItem: s.setItem,
    }));
    expect(fresh.getSnapshot().bookmarks).toEqual(
      s.store.getSnapshot().bookmarks,
    );
    expect(s.setItem).toHaveBeenCalledTimes(1);
  });
  it("notifies subscribers on save/remove and supports removing an unavailable reference", () => {
    const s = setup([record("retired-module")]);
    const listener = vi.fn();
    const stop = s.store.subscribe(listener);
    s.store.toggle(entry);
    s.store.remove("retired-module");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(
      s.store.getSnapshot().bookmarks.map((item) => item.moduleId),
    ).toEqual([entry.id]);
    stop();
    s.store.toggle(entry);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(readBookmarks(s.raw()!)).toEqual([]);
  });
  it("rejects new draft bookmarks without writing or creating progress", () => {
    const s = setup();
    expect(
      s.store.toggle(
        catalog.find((item) => item.status === "draft") as CatalogEntry,
      ).ok,
    ).toBe(false);
    expect(s.store.getSnapshot().bookmarks).toEqual([]);
    expect(s.setItem).not.toHaveBeenCalled();
  });
  it("keeps denied writes in session, preserves durable data, and saves on explicit retry", () => {
    const s = setup([record("capacity-estimation")]);
    s.store.getSnapshot();
    const previous = s.raw();
    s.deny(true);
    expect(s.store.toggle(entry).message).toContain("session only");
    expect(s.store.getSnapshot().bookmarks).toHaveLength(2);
    expect(s.store.getSnapshot().issue).toContain("could not be saved");
    expect(s.raw()).toBe(previous);
    s.deny(false);
    expect(s.store.retrySaving().ok).toBe(true);
    expect(readBookmarks(s.raw()!)).toHaveLength(2);
    expect(s.store.getSnapshot().issue).toBeNull();
  });
  it("handles denied reads and avoids overwriting unseen data when access returns", () => {
    let denied = true;
    const original = serializeBookmarks([record("capacity-estimation")]);
    const setItem = vi.fn();
    const store = createBookmarkStore(
      () => ({
        getItem: () => {
          if (denied) throw new DOMException("Denied", "SecurityError");
          return original;
        },
        setItem,
      }),
      () => date,
    );
    expect(store.getSnapshot().issue).toContain("unavailable");
    store.toggle(entry);
    denied = false;
    expect(store.retrySaving().ok).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    expect(store.getSnapshot().bookmarks).toHaveLength(1);
  });
  it.each([
    "{broken",
    JSON.stringify({
      app: "hld-with-ui",
      schemaVersion: 2,
      kind: "bookmarks",
      bookmarks: [],
    }),
  ])(
    "preserves unreadable/unsupported previous data and session actions: %s",
    (raw) => {
      const setItem = vi.fn();
      const store = createBookmarkStore(
        () => ({ getItem: () => raw, setItem }),
        () => date,
      );
      expect(store.getSnapshot().previousData).toBe(raw);
      store.toggle(entry);
      expect(store.getSnapshot().bookmarks).toHaveLength(1);
      expect(store.retrySaving().ok).toBe(false);
      expect(store.getSnapshot().previousData).toBe(raw);
      expect(setItem).not.toHaveBeenCalled();
    },
  );
  it("preserves another tab's durable change while keeping this tab's action for backup", () => {
    const s = setup([record()]);
    s.store.getSnapshot();
    const external = serializeBookmarks([record("other-module")]);
    s.replace(external);
    s.store.remove(entry.id);
    expect(s.raw()).toBe(external);
    expect(s.store.getSnapshot().issue).toContain("another tab");
    expect(s.store.retrySaving().ok).toBe(false);
    expect(s.setItem).not.toHaveBeenCalled();
  });
  it("enforces the merged count bound before changing saved or session data", () => {
    const s = setup(
      Array.from({ length: MAX_BOOKMARKS }, (_, index) =>
        record(`module-${index}`),
      ),
    );
    const previous = s.raw();
    expect(s.store.toggle(entry).message).toContain("100 modules");
    expect(s.store.getSnapshot().bookmarks).toHaveLength(MAX_BOOKMARKS);
    expect(s.raw()).toBe(previous);
    expect(s.store.previewImport(serializeBookmarks([record()])).ok).toBe(
      false,
    );
    expect(s.setItem).not.toHaveBeenCalled();
  });
});

describe("bookmark backup validation and import", () => {
  it("previews without writing and adds only new references, preserving local metadata", () => {
    const s = setup([record()]);
    const previous = s.raw();
    const preview = s.store.previewImport(
      serializeBookmarks([
        { ...record(), contentVersion: "9.0.0" },
        record("cache-aside"),
      ]),
    );
    expect(preview).toMatchObject({
      ok: true,
      added: 1,
      kept: 1,
      moduleIds: ["cache-aside"],
    });
    expect(s.raw()).toBe(previous);
    expect(s.store.applyImport(preview).ok).toBe(true);
    expect(readBookmarks(s.raw()!)).toEqual([record(), record("cache-aside")]);
  });
  it("rejects stale, forged and already applied previews", () => {
    const s = setup();
    const preview = s.store.previewImport(serializeBookmarks([record()]));
    expect(s.store.applyImport({ ...preview }).ok).toBe(false);
    s.store.toggle({ ...entry, id: "other-module" });
    expect(s.store.applyImport(preview).ok).toBe(false);
    const fresh = s.store.previewImport(serializeBookmarks([record()]));
    expect(s.store.applyImport(fresh).ok).toBe(true);
    const previous = s.raw();
    expect(s.store.applyImport(fresh).ok).toBe(false);
    expect(s.raw()).toBe(previous);
  });
  it("rejects import after another tab writes, without mutating the current session", () => {
    const s = setup([record()]);
    const preview = s.store.previewImport(
      serializeBookmarks([record("cache-aside")]),
    );
    s.replace(serializeBookmarks([record("other-module")]));
    expect(s.store.applyImport(preview).message).toContain("another tab");
    expect(s.store.getSnapshot().bookmarks).toEqual([record()]);
    expect(s.setItem).not.toHaveBeenCalled();
  });
  it("can explicitly import into session memory while preserving corrupt prior data", () => {
    const s = setup();
    s.replace("{broken");
    const preview = s.store.previewImport(serializeBookmarks([record()]));
    expect(s.store.applyImport(preview).message).toContain("session only");
    expect(s.raw()).toBe("{broken");
    expect(s.store.getSnapshot().bookmarks).toEqual([record()]);
  });
  const invalid = [
    { ...record(), moduleId: "../request-flow" },
    { ...record(), kind: ["topic"] },
    { ...record(), kind: "unknown" },
    { ...record(), contentVersion: "latest" },
    { ...record(), savedAt: "2026-02-30T00:00:00.000Z" },
    { ...record(), savedAt: date.replace(".000Z", "Z") },
    { ...record(), extra: "ignored?" },
  ];
  it.each(invalid)(
    "rejects malformed records without overwriting anything: %j",
    (incoming) => {
      const s = setup([record()]);
      const previous = s.raw();
      const raw = JSON.stringify({
        app: "hld-with-ui",
        kind: "bookmarks",
        schemaVersion: 1,
        bookmarks: [incoming],
      });
      expect(s.store.previewImport(raw).ok).toBe(false);
      expect(s.raw()).toBe(previous);
      expect(s.store.getSnapshot().bookmarks).toEqual([record()]);
    },
  );
  it.each([
    JSON.stringify({
      app: "other",
      kind: "bookmarks",
      schemaVersion: 1,
      bookmarks: [],
    }),
    JSON.stringify({
      app: "hld-with-ui",
      kind: "bookmarks",
      schemaVersion: 1,
      bookmarks: [],
      extra: 1,
    }),
    serializeBookmarks([record(), record()]),
    serializeBookmarks(
      Array.from({ length: MAX_BOOKMARKS + 1 }, (_, index) =>
        record(`module-${index}`),
      ),
    ),
    '"' + "😀".repeat(MAX_BOOKMARK_BYTES / 4) + '"',
  ])("rejects wrong app, unknown fields, duplicates and bounds", (raw) =>
    expect(() => readBookmarks(raw)).toThrow(),
  );
});
