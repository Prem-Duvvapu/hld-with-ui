import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { LearningPathStep } from "../../api/types";
import { getPracticeStore } from "./practiceStorage";
import { getCompletionStore } from "./completionStorage";
import { currentPathAnswers, pathEvidence } from "./pathEvidence";

export function CompletionControls({ step }: { step: LearningPathStep }) {
  const store = getCompletionStore();
  const completion = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const answers = getPracticeStore();
  const saved = useSyncExternalStore(answers.subscribe, answers.getSnapshot);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const clear = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirm) keep.current?.focus();
  }, [confirm]);
  if (!step.available || step.entry?.status !== "published") return null;
  const work = pathEvidence(step, saved.answers, completion.records);
  const candidates = currentPathAnswers(step, saved.answers);
  const count = completion.records.filter(
    (record) => record.moduleId === step.moduleId,
  ).length;
  return (
    <details className="path-completion">
      <summary>
        Record my progress{" "}
        <span className="sr-only">for {step.entry.title}</span>
      </summary>
      <p>
        Record reading separately from reviewing your own reasoning. These are
        your self-checks; the app does not grade explanations.
      </p>
      <label className="path-reading-check">
        <input
          type="checkbox"
          checked={work.reading}
          onChange={(event) => {
            const result = store.markReading(
              step.moduleId,
              step.entry!.contentVersion,
              event.target.checked,
            );
            setMessage(
              result.ok
                ? event.target.checked
                  ? "Reading marked complete on this browser."
                  : "Reading mark removed."
                : (result.message ?? "The reading mark could not be saved."),
            );
          }}
        />{" "}
        I've read this lesson
      </label>
      <p>
        Return here after comparing your saved answers with the lesson or
        reference and explaining the tradeoff in your own words. Editing an
        answer or updating the lesson makes its earlier review stop counting.
      </p>
      <div className="completion-actions">
        <button
          className="button secondary"
          type="button"
          disabled={!candidates.length}
          onClick={() => {
            const result = store.markReviewed(candidates);
            setMessage(
              result.ok
                ? `${candidates.length} saved ${candidates.length === 1 ? "answer marked" : "answers marked"} reviewed.`
                : (result.message ?? "The reviews could not be saved."),
            );
          }}
        >
          Mark {candidates.length || "saved"}{" "}
          {candidates.length === 1 ? "answer" : "answers"} reviewed
        </button>
        <button
          ref={clear}
          className="button secondary"
          type="button"
          disabled={!count}
          onClick={() => setConfirm(true)}
        >
          Clear these completion marks
        </button>
      </div>
      {!candidates.length && (
        <p className="completion-hint">
          Save an answer in Practice or Guided Simulation first. Viewing a
          reference alone does not count as an answer.
        </p>
      )}
      {confirm && (
        <div
          className="path-notice"
          role="group"
          aria-label={`Clear completion marks for ${step.entry.title}`}
        >
          <p>
            Clear {count} reading and practice marks for {step.entry.title}?
            Your answers, references and bookmarks will stay saved.
          </p>
          <div className="completion-actions">
            <button
              ref={keep}
              type="button"
              className="button secondary"
              onClick={() => {
                setConfirm(false);
                clear.current?.focus();
              }}
            >
              Keep my marks
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                const result = store.clearModule(step.moduleId);
                setMessage(
                  result.ok
                    ? "Completion marks cleared. Your answers are kept."
                    : (result.message ?? "Marks could not be cleared."),
                );
                if (result.ok) {
                  setConfirm(false);
                  keep.current?.blur();
                }
                // The stable summary remains focusable after the clear button disables.
                if (result.ok)
                  clear.current
                    ?.closest("details")
                    ?.querySelector("summary")
                    ?.focus();
              }}
            >
              Confirm clear completion marks
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
