import { useState } from "react";
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

type Run = { input: CacheAsideInput; result: CacheAsideResult };
type Progress = { prediction: string; revealed: boolean; choice?: string };

/**
 * Predict -> run the Java preset -> reveal the target event -> explain ->
 * choose a tradeoff. Answers live in memory for now; durable storage is
 * HLD-08.
 */
export function GuidedCheckpoints({
  checkpoints,
  descriptor,
}: {
  checkpoints: GuidedCheckpoint[];
  descriptor: CacheAsideDescriptor;
}) {
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  // One Java run per preset, shared by every checkpoint that uses it.
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [pendingPreset, setPendingPreset] = useState<string | null>(null);
  const [error, setError] = useState("");

  const checkpoint = checkpoints[current]!;
  const preset = descriptor.presets.find((p) => p.id === checkpoint.presetId);
  const state = progress[checkpoint.id] ?? { prediction: "", revealed: false };
  const run = runs[checkpoint.presetId];

  function update(id: string, patch: Partial<Progress>) {
    setProgress((previous) => ({
      ...previous,
      [id]: { prediction: "", revealed: false, ...previous[id], ...patch },
    }));
  }

  async function reveal() {
    if (!preset) return;
    const id = checkpoint.id;
    setError("");
    if (runs[preset.id]) return update(id, { revealed: true });
    setPendingPreset(preset.id);
    try {
      const result = await api.runCacheAside(preset.input);
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
                }}
              >
                <span aria-hidden="true">
                  {progress[item.id]?.revealed ? "✓" : index + 1}
                </span>
                {item.title}
                {progress[item.id]?.revealed && (
                  <span className="sr-only"> (revealed)</span>
                )}
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
        <h2 id="guided-title">{checkpoint.title}</h2>

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
              The preset “{checkpoint.presetId}” is not available from the Java
              model, so this checkpoint cannot run.
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
  );
}
