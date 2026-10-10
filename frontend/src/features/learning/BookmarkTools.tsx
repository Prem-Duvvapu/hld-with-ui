import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { downloadJson } from "./downloadJson";
import {
  getBookmarkStore,
  MAX_BOOKMARK_BYTES,
  serializeBookmarks,
  type BookmarkImportPreview,
} from "./bookmarkStorage";

export function BookmarkTools({
  titles,
  onClear,
}: {
  titles: ReadonlyMap<string, string>;
  onClear: () => void;
}) {
  const store = getBookmarkStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [preview, setPreview] = useState<BookmarkImportPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const selection = useRef(0);
  const keep = useRef<HTMLButtonElement>(null);
  const clear = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      selection.current += 1;
    },
    [],
  );
  useEffect(() => {
    if (confirm) keep.current?.focus();
  }, [confirm]);
  async function readFile(file?: File) {
    const request = ++selection.current;
    setPreview(null);
    setMessage(null);
    setReading(false);
    setConfirm(false);
    if (!file) return;
    if (file.size > MAX_BOOKMARK_BYTES) {
      setMessage({
        text: "Choose a bookmark backup of 64 KiB or less.",
        error: true,
      });
      return;
    }
    setReading(true);
    try {
      const raw = await file.text();
      if (selection.current !== request) return;
      const result = store.previewImport(raw);
      if (result.ok) setPreview(result);
      else
        setMessage({
          text: result.message ?? "This backup could not be read.",
          error: true,
        });
    } catch {
      if (selection.current === request)
        setMessage({
          text: "This file could not be read. Choose another bookmark backup.",
          error: true,
        });
    } finally {
      if (selection.current === request) setReading(false);
    }
  }
  return (
    <details className="bookmark-tools">
      <summary>Back up or manage bookmarks</summary>
      <p>
        These tools affect bookmarks only. Practice answers use their own answer
        backup and stay unchanged.
      </p>
      <div className="bookmark-actions">
        <button
          className="button secondary"
          type="button"
          disabled={!snapshot.bookmarks.length}
          onClick={() =>
            downloadJson(
              serializeBookmarks(snapshot.bookmarks),
              "hld-bookmarks.json",
            )
          }
        >
          Download bookmarks
        </button>
        {snapshot.previousData !== null && (
          <button
            className="button secondary"
            type="button"
            onClick={() =>
              downloadJson(
                snapshot.previousData!,
                "hld-bookmarks-previous-data.json",
              )
            }
          >
            Download previous bookmark data
          </button>
        )}
        {snapshot.issue && (
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              const result = store.retrySaving();
              setMessage({
                text: result.ok
                  ? "Your session bookmarks are now saved on this browser."
                  : (result.message ?? "Saving is still unavailable."),
                error: !result.ok,
              });
            }}
          >
            Try saving bookmarks again
          </button>
        )}
      </div>
      <label>
        Import a bookmark backup
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            void readFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      <p>
        JSON, up to 64 KiB and 100 saved modules. Existing saves keep their
        version and date; importing does not create answers or completion
        evidence.
      </p>
      {reading && <p role="status">Reading bookmark backup…</p>}
      {preview && (
        <div className="bookmark-preview" aria-label="Bookmark import preview">
          <p>
            {preview.added} new bookmarks will be added. {preview.kept} existing
            saves will be kept. Nothing changes until you apply.
          </p>
          {!!preview.moduleIds.length && (
            <ul>
              {preview.moduleIds.map((id) => (
                <li key={id}>{titles.get(id) ?? id}</li>
              ))}
            </ul>
          )}
          <p>
            Current availability will be checked for imported modules. A backup
            does not publish unavailable content.
          </p>
          <div className="bookmark-actions">
            <button
              className="button primary"
              type="button"
              onClick={() => {
                const result = store.applyImport(preview);
                setPreview(null);
                setMessage({
                  text: result.ok
                    ? (result.message ??
                      "Bookmarks imported. Existing saves were kept.")
                    : (result.message ?? "Import could not be applied."),
                  error: !result.ok,
                });
                fileInput.current?.focus();
              }}
            >
              Apply bookmark import
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setPreview(null);
                fileInput.current?.focus();
              }}
            >
              Cancel import
            </button>
          </div>
        </div>
      )}
      <div className="bookmark-actions">
        <button
          ref={clear}
          className="button secondary"
          type="button"
          disabled={!snapshot.bookmarks.length}
          onClick={() => {
            selection.current += 1;
            setReading(false);
            setPreview(null);
            setMessage(null);
            setConfirm(true);
          }}
        >
          Clear all bookmarks
        </button>
      </div>
      {confirm && (
        <div
          className="bookmark-reset"
          role="group"
          aria-label="Confirm bookmark reset"
        >
          <p>
            Remove all {snapshot.bookmarks.length} bookmarks from this browser?
            Your answers will stay unchanged.
          </p>
          <div className="bookmark-actions">
            <button
              ref={keep}
              className="button secondary"
              type="button"
              onClick={() => {
                setConfirm(false);
                clear.current?.focus();
              }}
            >
              Keep bookmarks
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                const result = store.clear();
                setConfirm(false);
                setMessage({
                  text: result.ok
                    ? (result.message ??
                      "All bookmarks removed. Your answers were kept.")
                    : (result.message ?? "Bookmarks could not be removed."),
                  error: !result.ok,
                });
                onClear();
              }}
            >
              Remove all bookmarks
            </button>
          </div>
        </div>
      )}
      {message && (
        <p role={message.error ? "alert" : "status"}>{message.text}</p>
      )}
    </details>
  );
}
