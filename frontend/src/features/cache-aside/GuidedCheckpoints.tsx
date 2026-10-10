import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  useModuleActivity,
  usePanelActive,
} from "../../components/ModuleShell";
import "./GuidedCheckpoints.css";
import { api } from "../../api/client";
import type {
  CacheAsideDescriptor,
  CacheAsideInput,
  CacheAsideResult,
  GuidedCheckpoint,
} from "../../api/types";
import { CachePlayback } from "./CachePlayback";
import { orderedEvents } from "./cacheState";
import { resolveCheckpoint } from "./checkpoints";
import {
  getPracticeStore,
  MAX_ANSWER_LENGTH,
} from "../learning/practiceStorage";
import { AnswerStorageControls } from "../learning/AnswerStorageControls";

type Run = { input: CacheAsideInput; result: CacheAsideResult };
type Progress = { prediction: string; revealed: boolean; choice?: string };

/**
 * Predict -> run the Java preset -> reveal the target event -> explain ->
 * choose a tradeoff. Answers persist locally; Java traces remain in memory.
 */
export function GuidedCheckpoints({
  checkpoints,
  descriptor,
  topicId = descriptor.id,
  contentVersion = "1.0.0",
}: {
  checkpoints: GuidedCheckpoint[];
  descriptor: CacheAsideDescriptor;
  topicId?: string;
  contentVersion?: string;
}) {
  const [localCurrent, setCurrent] = useState(0);
  const { checkpoint: requested, selectCheckpoint } = useModuleActivity();
  const active = usePanelActive();
  const requestedIndex = checkpoints.findIndex((item) => item.id === requested);
  const current = selectCheckpoint ? Math.max(0, requestedIndex) : localCurrent;
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (!active || requestedIndex < 0) return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [active, requestedIndex]);
  const store = getPracticeStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  // One Java run per preset, shared by every checkpoint that uses it.
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [pendingPreset, setPendingPreset] = useState<string | null>(null);
  const [error, setError] = useState("");

  const checkpoint = checkpoints[current]!;
  const preset = descriptor.presets.find((p) => p.id === checkpoint.presetId);
  const run = runs[checkpoint.presetId];
  const prediction = snapshot.answers.find(
    (answer) =>
      answer.topicId === topicId &&
      answer.activityId === `${checkpoint.id}-prediction`,
  );
  const tradeoff = snapshot.answers.find(
    (answer) =>
      answer.topicId === topicId &&
      answer.activityId === `${checkpoint.id}-tradeoff`,
  );
  const savedTradeoffId =
    tradeoff?.answer.kind === "choice" ? tradeoff.answer.optionId : null;
  const state: Progress = {
    prediction:
      prediction?.answer.kind === "text" ? prediction.answer.text : "",
    // A persisted reveal is not a persisted trace. Never run or fabricate evidence on load.
    revealed: Boolean(
      prediction?.referenceViewed &&
      prediction.contentVersion === contentVersion &&
      run,
    ),
    choice:
      tradeoff?.answer.kind === "choice" &&
      tradeoff.contentVersion === contentVersion
        ? (tradeoff.answer.optionId ?? undefined)
        : undefined,
  };

  function update(id: string, patch: Partial<Progress>) {
    const previous = store
      .getSnapshot()
      .answers.find(
        (answer) =>
          answer.topicId === topicId &&
          answer.activityId === `${id}-prediction`,
      );
    if (patch.prediction !== undefined || patch.revealed !== undefined)
      store.save({
        topicId,
        activityId: `${id}-prediction`,
        contentVersion,
        answer: {
          kind: "text",
          text:
            patch.prediction ??
            (previous?.answer.kind === "text" ? previous.answer.text : ""),
        },
        referenceViewed:
          patch.revealed ??
          Boolean(
            previous?.referenceViewed &&
            previous.contentVersion === contentVersion,
          ),
      });
    if (patch.choice !== undefined)
      store.save({
        topicId,
        activityId: `${id}-tradeoff`,
        contentVersion,
        answer: { kind: "choice", optionId: patch.choice },
        referenceViewed: true,
      });
  }

  async function reveal() {
    if (!preset) return;
    const id = checkpoint.id;
    const resetVersion = store.getResetVersion(topicId);
    setError("");
    if (runs[preset.id]) return update(id, { revealed: true });
    setPendingPreset(preset.id);
    try {
      const result = await api.runCacheAside(preset.input);
      if (resetVersion !== store.getResetVersion(topicId)) return;
      setRuns((previous) => ({
        ...previous,
        [preset.id]: { input: preset.input, result },
      }));
      update(id, { revealed: true });
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The simulation could not run.",
      );
    } finally {
      setPendingPreset(null);
    }
  }

  const position =
    run &&
    resolveCheckpoint(orderedEvents(run.result.events), checkpoint.target);
  const pending = pendingPreset !== null;
  const chosen = checkpoint.tradeoff.options.find(
    (option) => option.id === state.choice,
  );
  const recommended = checkpoint.tradeoff.options.find(
    (option) => option.id === checkpoint.tradeoff.recommendedOptionId,
  );

  return (
    <div>
      <AnswerStorageControls
        topicId={topicId}
        topicTitle={descriptor.title}
        label="Guided answer storage"
      />
      <div className="guided">
        <nav className="guided-steps" aria-label="Checkpoints">
          <ol>
            {checkpoints.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={index === current ? "step" : undefined}
                  onClick={() => {
                    setError("");
                    setCurrent(index);
                    selectCheckpoint?.(item.id);
                  }}
                >
                  <span aria-hidden="true">
                    {runs[item.presetId] &&
                    snapshot.answers.some(
                      (answer) =>
                        answer.topicId === topicId &&
                        answer.activityId === `${item.id}-prediction` &&
                        answer.contentVersion === contentVersion &&
                        answer.referenceViewed,
                    )
                      ? "✓"
                      : index + 1}
                  </span>
                  {item.title}
                  {runs[item.presetId] &&
                    snapshot.answers.some(
                      (answer) =>
                        answer.topicId === topicId &&
                        answer.activityId === `${item.id}-prediction` &&
                        answer.contentVersion === contentVersion &&
                        answer.referenceViewed,
                    ) && <span className="sr-only"> (revealed)</span>}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <article className="guided-card" aria-labelledby="guided-title">
          <p className="overline">
            Checkpoint {current + 1} of {checkpoints.length} · Preset:{" "}
            {preset?.title ?? checkpoint.presetId}
          </p>
          <h2 id="guided-title" ref={heading} tabIndex={-1}>
            {checkpoint.title}
          </h2>
          {requested && requestedIndex < 0 && (
            <p className="practice-version-note" role="note">
              This saved checkpoint is no longer available. Your answers remain
              in your backup; start with the current first checkpoint.
            </p>
          )}
          {prediction && prediction.contentVersion !== contentVersion && (
            <p className="practice-version-note" role="note">
              Your prediction was saved for content v{prediction.contentVersion}
              . Review it against this lesson and run the model again.
            </p>
          )}
          {tradeoff &&
            (tradeoff.contentVersion !== contentVersion ||
              (tradeoff.answer.kind === "choice" &&
                !checkpoint.tradeoff.options.some(
                  (option) => option.id === savedTradeoffId,
                ))) && (
              <p className="practice-version-note" role="note">
                Previous tradeoff choice:{" "}
                {tradeoff.answer.kind === "choice"
                  ? (tradeoff.answer.optionId ?? "No choice")
                  : "No choice"}
                , saved for content v{tradeoff.contentVersion}. Choose again
                after revealing the evidence; your previous answer stays in the
                backup until you revise it.
              </p>
            )}
          {prediction?.referenceViewed && !run && (
            <p className="practice-version-note">
              Your saved answer is restored. Run and reveal to generate the Java
              evidence again; simulation traces are not stored.
            </p>
          )}

          <section className="guided-step">
            <h3>1. Predict</h3>
            <p>{checkpoint.prompt}</p>
            <label className="guided-prediction">
              <span>
                {state.revealed
                  ? "Your prediction (revise it after seeing the evidence)"
                  : "Your prediction (optional)"}
              </span>
              <textarea
                rows={3}
                maxLength={MAX_ANSWER_LENGTH}
                value={state.prediction}
                onChange={(event) =>
                  update(checkpoint.id, { prediction: event.target.value })
                }
              />
            </label>
            {!state.revealed && (
              <button
                type="button"
                className="button primary"
                onClick={reveal}
                disabled={pending || !preset}
              >
                {pending ? "Running the Java model…" : "Run and reveal"}
              </button>
            )}
            {!preset && (
              <p className="error-text" role="alert">
                The preset “{checkpoint.presetId}” is not available from the
                Java model, so this checkpoint cannot run.
              </p>
            )}
            {error && (
              <p className="error-text" role="alert">
                {error} Select “Run and reveal” to try again.
              </p>
            )}
          </section>

          {state.revealed && run && (
            <>
              <section className="guided-step">
                <h3>2. Look at the evidence</h3>
                <p>{checkpoint.lookFor}</p>
                {position === undefined || position < 0 ? (
                  <p className="error-text" role="alert">
                    This checkpoint no longer matches the Java trace (model v
                    {run.result.modelVersion}). The playground still works.
                  </p>
                ) : (
                  <CachePlayback
                    key={checkpoint.id}
                    result={run.result}
                    input={run.input}
                    initialPosition={position}
                    showTrace={false}
                    title="Java trace at this checkpoint"
                  />
                )}
              </section>

              <section className="guided-step">
                <h3>3. Why it happens</h3>
                <p>{checkpoint.explanation}</p>
              </section>

              <fieldset className="guided-step guided-tradeoff">
                <legend>
                  <h3>4. Choose a tradeoff</h3>
                </legend>
                <p>{checkpoint.tradeoff.prompt}</p>
                {checkpoint.tradeoff.options.map((option) => (
                  <label key={option.id} className="guided-option">
                    <input
                      type="radio"
                      name={`tradeoff-${checkpoint.id}`}
                      value={option.id}
                      checked={state.choice === option.id}
                      onChange={() =>
                        update(checkpoint.id, { choice: option.id })
                      }
                    />
                    {option.label}
                  </label>
                ))}
                {chosen && (
                  <div className="guided-feedback" role="status">
                    <strong>
                      {chosen.id === recommended?.id
                        ? "Recommended choice."
                        : `Recommended: ${recommended?.label}.`}
                    </strong>
                    <p>{chosen.feedback}</p>
                    {chosen.id !== recommended?.id && recommended && (
                      <p>{recommended.feedback}</p>
                    )}
                  </div>
                )}
              </fieldset>
            </>
          )}

          <div className="guided-nav">
            <button
              type="button"
              className="button secondary"
              disabled={current === 0}
              onClick={() => {
                setError("");
                setCurrent(current - 1);
              }}
            >
              ← Previous checkpoint
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={current === checkpoints.length - 1}
              onClick={() => {
                setError("");
                setCurrent(current + 1);
              }}
            >
              Next checkpoint →
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
