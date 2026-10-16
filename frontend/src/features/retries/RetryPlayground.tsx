import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { RetryDescriptor, RetryResult } from "../../api/types";
import { RetryControls } from "./RetryControls";
import { RetryResults } from "./RetryResults";
import {
  parseRetryForm,
  toRetryForm,
  type RetryErrors,
  type RetryForm,
} from "./retryForm";
import "./Retry.css";
export function RetryPlayground({
  descriptor,
}: {
  descriptor: RetryDescriptor;
}) {
  const baseline = descriptor.presets.find((p) => p.id === "late-work")!;
  const [form, setForm] = useState(() => toRetryForm(baseline.input)),
    [activePreset, setActivePreset] = useState(baseline.id),
    [prediction, setPrediction] = useState("");
  const [errors, setErrors] = useState<RetryErrors>({}),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const [run, setRun] = useState<{
    id: number;
    result: RetryResult;
    draft: string;
  } | null>(null);
  const busy = useRef(false),
    generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  function update(next: RetryForm) {
    if (busy.current) return;
    setForm(next);
    setActivePreset("");
    setErrors({});
    setError("");
  }
  function selectPreset(id: string) {
    if (busy.current) return;
    const preset = descriptor.presets.find((p) => p.id === id);
    if (!preset) return;
    setForm(toRetryForm(preset.input));
    setActivePreset(id);
    setErrors({});
    setError("");
  }
  async function simulate() {
    if (busy.current) return;
    const parsed = parseRetryForm(form, descriptor.limits);
    setErrors(parsed.errors);
    setError("");
    if (!parsed.input) {
      setError(
        "Check the highlighted fields. Your input, prediction and previous results have been kept.",
      );
      return;
    }
    const draft = JSON.stringify(form),
      capturedGeneration = generation.current;
    busy.current = true;
    setPending(true);
    try {
      const result = await api.runRetry(parsed.input);
      if (capturedGeneration === generation.current)
        setRun((previous) => ({ id: (previous?.id ?? 0) + 1, result, draft }));
    } catch (cause: unknown) {
      if (capturedGeneration === generation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "The Java retry experiment could not run. Your workload is still here; try again.",
        );
    } finally {
      busy.current = false;
      if (capturedGeneration === generation.current) setPending(false);
    }
  }
  return (
    <div className="retry-experience">
      <section
        className="retry-prediction"
        aria-label="Predict the retry result"
      >
        <div>
          <p className="eyebrow">Predict · Inspect · Explain</p>
          <h2>Does a timeout stop the server's work?</h2>
          <p>
            {descriptor.presets.find((p) => p.id === activePreset)
              ?.description ??
              "Change one condition, predict the caller outcome and inspect which server attempts still execute."}
          </p>
          <p className="retry-muted">
            Caller patience and server ownership are separate. This is a bounded
            virtual-time model, with no actual network or business effects.
          </p>
        </div>
        <label className="retry-field">
          <span>Your retry prediction (optional)</span>
          <textarea
            aria-label="Your retry prediction (optional)"
            rows={3}
            maxLength={4000}
            value={prediction}
            onChange={(e) => setPrediction(e.target.value)}
            placeholder="I expect… because…"
          />
          <small>Kept on this page. Practice saves your explanation.</small>
        </label>
      </section>
      {error && (
        <div className="retry-error" role="alert">
          {error}
          {run && (
            <p>
              The previous submitted run remains visible. This attempt produced
              no new result.
            </p>
          )}
        </div>
      )}
      {pending && !run && (
        <p role="status" className="retry-muted">
          Running the submitted workload in Java. No result has been received
          yet.
        </p>
      )}
      <div className="retry-workbench">
        <RetryControls
          descriptor={descriptor}
          form={form}
          errors={errors}
          pending={pending}
          activePreset={activePreset}
          update={update}
          selectPreset={selectPreset}
          run={() => void simulate()}
        />
        {run ? (
          <RetryResults
            key={run.id}
            result={run.result}
            pending={pending}
            stale={run.draft !== JSON.stringify(form)}
          />
        ) : (
          <section className="retry-empty">
            <p className="eyebrow">Start with the baseline</p>
            <h2>One caller stops waiting. Accepted work continues.</h2>
            <p>
              Predict, then run. Compare the timed-out caller with its original
              server work and the new retry. Step through the returned snapshots
              to see what the server still owns.
            </p>
            <p className="retry-boundary">
              No cancellation, business writes, idempotency or durability is
              modeled.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
