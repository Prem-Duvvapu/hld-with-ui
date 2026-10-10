import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getCompletionStore,
  MAX_COMPLETION_BYTES,
  serializeCompletions,
  type CompletionPreview,
} from "./completionStorage";
import { downloadJson } from "./downloadJson";

export function CompletionTools() {
  const store = getCompletionStore();
  const saved = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [preview, setPreview] = useState<CompletionPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selection = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      selection.current++;
    },
    [],
  );
  async function read(file?: File) {
    const request = ++selection.current;
    setPreview(null);
    setMessage(null);
    setReading(false);
    if (!file) return;
    if (file.size > MAX_COMPLETION_BYTES) {
      setMessage("Choose a completion backup of 256 KiB or less.");
      return;
    }
    setReading(true);
    try {
      const raw = await file.text();
      if (request !== selection.current) return;
      setPreview(store.previewImport(raw));
    } catch (e) {
      if (request === selection.current)
        setMessage(
          e instanceof Error
            ? e.message
            : "The completion backup could not be read.",
        );
    } finally {
      if (request === selection.current) setReading(false);
    }
  }
  return (
    <details className="path-completion completion-tools">
      <summary>Back up or manage completion marks</summary>
      <p>
        Completion marks stay on this browser and are never sent to Java. This
        separate backup includes copies of the answers you marked reviewed. Keep
        your answer backup too: importing completion marks does not restore or
        change your working answers or bookmarks.
      </p>
      <div className="completion-actions">
        <button
          className="button secondary"
          type="button"
          onClick={() =>
            downloadJson(
              serializeCompletions(saved.records),
              "hld-completion.json",
            )
          }
        >
          Download completion marks
        </button>
        {saved.previousData !== null && (
          <button
            className="button secondary"
            type="button"
            onClick={() =>
              downloadJson(
                saved.previousData!,
                "hld-completion-previous-data.json",
              )
            }
          >
            Download previous completion data
          </button>
        )}
        {saved.issue && (
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              const result = store.retrySaving();
              setMessage(
                result.ok
                  ? "Session completion marks saved on this browser."
                  : (result.message ?? "Saving is unavailable."),
              );
            }}
          >
            Try saving completion marks again
          </button>
        )}
      </div>
      <label className="completion-file">
        Completion backup file
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            void read(event.target.files?.[0]);
          }}
        />
      </label>
      {reading && <p role="status">Reading completion backup…</p>}
      {preview && (
        <div
          className="path-notice"
          role="group"
          aria-label="Review completion backup"
        >
          <h2>Replace completion marks?</h2>
          <p>
            This backup has {preview.count} marks. Applying it replaces all{" "}
            {saved.records.length} completion marks on this browser, including
            marks for other modules. Download your current marks first if you
            want to keep them. Only current activities with matching saved
            answers count as reviewed.
          </p>
          <div className="completion-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                selection.current++;
                setPreview(null);
                if (input.current) input.current.value = "";
                input.current?.focus();
              }}
            >
              Keep current completion marks
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                const result = store.applyImport(preview);
                setMessage(
                  result.ok
                    ? "Completion marks replaced. Working answers and bookmarks were kept."
                    : (result.message ??
                        "Import failed; existing marks were kept."),
                );
                if (result.ok) {
                  setPreview(null);
                  if (input.current) input.current.value = "";
                  input.current?.focus();
                }
              }}
            >
              Replace with this completion backup
            </button>
          </div>
        </div>
      )}
      {message && (
        <p role="status" className="completion-hint">
          {message}
        </p>
      )}
    </details>
  );
}
