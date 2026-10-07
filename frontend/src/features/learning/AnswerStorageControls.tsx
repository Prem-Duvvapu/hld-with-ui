import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getPracticeStore,
  MAX_IMPORT_BYTES,
  serializeAnswers,
  type ImportPreview,
} from "./practiceStorage";
import "./PracticeView.css";

function download(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function AnswerStorageControls({
  topicId,
  topicTitle = "this module",
  label = "Practice answer storage",
}: {
  topicId: string;
  topicTitle?: string;
  label?: string;
}) {
  const store = getPracticeStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<Record<string, "local" | "incoming">>(
    {},
  );
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetTarget, setResetTarget] = useState(topicId);
  const [selectedSavedModule, setSelectedSavedModule] = useState("");
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const selection = useRef(0);
  const toolsSummary = useRef<HTMLElement>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  const keepAnswers = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirmReset) keepAnswers.current?.focus();
  }, [confirmReset]);
  const moduleCount = snapshot.answers.filter(
    (answer) => answer.topicId === topicId,
  ).length;
  const otherModules = [
    ...new Set(snapshot.answers.map((answer) => answer.topicId)),
  ].filter((id) => id !== topicId);
  const savedModule = otherModules.includes(selectedSavedModule)
    ? selectedSavedModule
    : (otherModules[0] ?? "");
  const resetCount = snapshot.answers.filter(
    (answer) => answer.topicId === resetTarget,
  ).length;
  const resetTitle =
    resetTarget === topicId ? topicTitle : `saved module “${resetTarget}”`;

  async function readFile(file?: File) {
    const request = ++selection.current;
    setPreview(null);
    setChoices({});
    setConfirmReset(false);
    setMessage(null);
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setMessage({
        text: "The backup is too large. Choose a JSON backup of 256 KiB or less.",
        error: true,
      });
      return;
    }
    setReading(true);
    try {
      const raw = await file.text();
      if (request !== selection.current) return;
      const next = store.previewImport(raw);
      if (!next.ok)
        setMessage({
          text: next.message ?? "This backup could not be read.",
          error: true,
        });
      else setPreview(next);
    } catch {
      if (request === selection.current)
        setMessage({
          text: "This file could not be read. Your answers have not changed.",
          error: true,
        });
    } finally {
      if (request === selection.current) setReading(false);
    }
  }

  return (
    <div className="answer-storage-controls">
      <section
        className={`practice-save-bar ${snapshot.issue ? "practice-save-warning" : ""}`}
        aria-label={label}
      >
        <div>
          <p className="practice-save-title" role="status">
            {snapshot.issue
              ? "Answers are kept for this session only"
              : "Saved on this browser"}
          </p>
          <p>
            {snapshot.issue
              ? `${snapshot.issue} Download your answers before leaving or reloading. Previous saved data has not been replaced.`
              : "Your answers save automatically on this browser. They are not sent to the server. Saving or importing an answer does not mark a module complete."}
          </p>
        </div>
        <div className="practice-save-actions">
          <button
            className="button secondary"
            type="button"
            disabled={snapshot.answers.length === 0}
            onClick={() =>
              download(
                serializeAnswers(snapshot.answers),
                "hld-practice-answers.json",
              )
            }
          >
            Download answers
          </button>
          {snapshot.previousData !== null && (
            <button
              className="button secondary"
              type="button"
              onClick={() =>
                download(
                  snapshot.previousData!,
                  "hld-practice-previous-data.json",
                )
              }
            >
              Download previous data
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
                    ? "Your session answers are now saved on this browser."
                    : (result.message ??
                      "Saving is still unavailable. Download your work before reloading."),
                  error: !result.ok,
                });
              }}
            >
              Try saving again
            </button>
          )}
        </div>
      </section>
      <details className="answer-backup-tools">
        <summary ref={toolsSummary}>
          Import answers or reset this module
        </summary>
        <div className="answer-backup-actions">
          <label className="answer-file-label">
            Answer backup file
            <input
              type="file"
              accept=".json,application/json"
              disabled={reading}
              onChange={(event) => {
                void readFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          <button
            className="button secondary"
            type="button"
            ref={resetButton}
            disabled={moduleCount === 0 || reading}
            onClick={() => {
              setResetTarget(topicId);
              setConfirmReset(true);
              setPreview(null);
              setMessage(null);
            }}
          >
            Reset this module
          </button>
        </div>
        {otherModules.length > 0 && (
          <div className="answer-backup-actions">
            <label className="answer-file-label">
              Saved module to reset
              <select
                value={savedModule}
                onChange={(event) => setSelectedSavedModule(event.target.value)}
              >
                {otherModules.map((id) => (
                  <option value={id} key={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button secondary"
              type="button"
              disabled={reading || !savedModule}
              onClick={() => {
                setResetTarget(savedModule);
                setConfirmReset(true);
                setPreview(null);
                setMessage(null);
              }}
            >
              Reset selected saved module
            </button>
          </div>
        )}
        <p className="answer-backup-hint">
          A preview comes first. Existing nonempty answers stay unless you
          choose an imported answer. Reset affects only the module named in the
          confirmation. Other modules are kept.
        </p>
      </details>
      {reading && <p role="status">Reading your answer backup…</p>}
      {message && (
        <p
          className={`answer-operation-message ${message.error ? "answer-operation-error" : ""}`}
          role={message.error ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
      {preview && (
        <section
          className="answer-import-preview"
          aria-labelledby={`import-title-${label.replaceAll(" ", "-")}`}
        >
          <h3 id={`import-title-${label.replaceAll(" ", "-")}`}>
            Review imported answers
          </h3>
          <p>
            {preview.imported.length} saved records in this backup;{" "}
            {preview.conflicts.length} conflicts require review. Nothing has
            changed yet.
          </p>
          <p>
            Answers from older lessons or unavailable activities stay in your
            backup. Only current activities appear in learning views; past
            review does not become mastery.
          </p>
          {preview.conflicts.map((conflict) => (
            <fieldset className="answer-import-conflict" key={conflict.key}>
              <legend>
                {conflict.topicId} · {conflict.activityId}
              </legend>
              <div className="answer-conflict-comparison">
                <div>
                  <strong>
                    Local answer · v{conflict.local.contentVersion}
                  </strong>
                  <pre>
                    {conflict.local.answer.kind === "text"
                      ? conflict.local.answer.text || "No written answer"
                      : (conflict.local.answer.optionId ?? "No choice")}
                  </pre>
                </div>
                <div>
                  <strong>
                    Imported answer · v{conflict.incoming.contentVersion}
                  </strong>
                  <pre>
                    {conflict.incoming.answer.kind === "text"
                      ? conflict.incoming.answer.text || "No written answer"
                      : (conflict.incoming.answer.optionId ?? "No choice")}
                  </pre>
                </div>
              </div>
              <label>
                <input
                  type="radio"
                  name={`import-${label}-${conflict.key}`}
                  checked={choices[conflict.key] !== "incoming"}
                  onChange={() =>
                    setChoices((previous) => ({
                      ...previous,
                      [conflict.key]: "local",
                    }))
                  }
                />
                Keep local
              </label>
              <label>
                <input
                  type="radio"
                  name={`import-${label}-${conflict.key}`}
                  checked={choices[conflict.key] === "incoming"}
                  onChange={() =>
                    setChoices((previous) => ({
                      ...previous,
                      [conflict.key]: "incoming",
                    }))
                  }
                />
                Use imported
              </label>
            </fieldset>
          ))}
          <div className="answer-preview-actions">
            <button
              className="button primary"
              type="button"
              onClick={() => {
                const result = store.applyImport(preview, choices);
                setMessage({
                  text: result.ok
                    ? "Answer backup imported. Your selected answers are saved on this browser."
                    : (result.message ??
                      "Import could not be saved. Your existing answers have not been replaced."),
                  error: !result.ok,
                });
                if (result.ok) {
                  setPreview(null);
                  toolsSummary.current?.focus();
                }
              }}
            >
              Apply import
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setPreview(null);
                setChoices({});
                setMessage(null);
                toolsSummary.current?.focus();
              }}
            >
              Cancel import
            </button>
          </div>
        </section>
      )}
      {confirmReset && (
        <section
          className="answer-reset-confirmation"
          aria-label="Confirm module reset"
        >
          <h3>
            {resetTarget === topicId
              ? "Delete this module’s saved answers?"
              : "Delete the selected saved module’s answers?"}
          </h3>
          <p>
            This removes {resetCount} saved records for {resetTitle}, including
            Practice and Guided answers. Other modules are kept. Download a
            backup first if you want to keep these answers.
          </p>
          <div className="answer-preview-actions">
            <button
              className="button secondary answer-delete"
              type="button"
              onClick={() => {
                const result = store.resetTopic(resetTarget);
                setMessage({
                  text: result.ok
                    ? `Saved answers for ${resetTitle} were deleted. Other modules were kept.`
                    : (result.message ??
                      "Reset could not be saved. Your answers have not been deleted."),
                  error: !result.ok,
                });
                if (result.ok) {
                  setConfirmReset(false);
                  toolsSummary.current?.focus();
                }
              }}
            >
              Delete module answers
            </button>
            <button
              ref={keepAnswers}
              className="button secondary"
              type="button"
              onClick={() => {
                setConfirmReset(false);
                if (resetTarget === topicId) resetButton.current?.focus();
                else toolsSummary.current?.focus();
              }}
            >
              Keep answers
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
