import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { IdempotencyDescriptor, IdempotencyResult } from "../../api/types";
import { IdempotencyControls } from "./IdempotencyControls";
import { IdempotencyResults } from "./IdempotencyResults";
import {
  parseIdempotencyForm,
  toIdempotencyForm,
  type IdempotencyForm,
} from "./idempotencyForm";
import "./Idempotency.css";
export function IdempotencyPlayground({
  descriptor,
}: {
  descriptor: IdempotencyDescriptor;
}) {
  const baseline = descriptor.presets.find(
    (preset) => preset.id === descriptor.defaultPresetId,
  )!;
  const [form, setForm] = useState(() => toIdempotencyForm(baseline.input)),
    [activePreset, setActivePreset] = useState<string>(baseline.id),
    [prediction, setPrediction] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [announcement, setAnnouncement] = useState("");
  const [run, setRun] = useState<{
    id: number;
    result: IdempotencyResult;
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
  function update(next: IdempotencyForm) {
    if (busy.current) return;
    setForm(next);
    setActivePreset("");
    setErrors({});
    setError("");
  }
  function selectPreset(id: string) {
    if (busy.current) return;
    const preset = descriptor.presets.find((item) => item.id === id);
    if (!preset) return;
    setForm(toIdempotencyForm(preset.input));
    setActivePreset(id);
    setErrors({});
    setError("");
  }
  async function simulate() {
    if (busy.current) return;
    const parsed = parseIdempotencyForm(form, descriptor.limits);
    setErrors(parsed.errors);
    setError("");
    setAnnouncement("");
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
    setAnnouncement("Running the submitted idempotency experiment.");
    try {
      const result = await api.runIdempotency(parsed.input);
      if (capturedGeneration === generation.current) {
        setRun((previous) => ({ id: (previous?.id ?? 0) + 1, result, draft }));
        setAnnouncement(
          `Idempotency experiment complete. ${result.metrics.publishedEffects} effects published across ${result.metrics.calls} calls. Inspect the returned snapshots.`,
        );
      }
    } catch (cause: unknown) {
      if (capturedGeneration === generation.current) {
        setAnnouncement("");
        setError(
          cause instanceof Error
            ? cause.message
            : "The Java experiment could not run. Your calls are still here; try again.",
        );
      }
    } finally {
      busy.current = false;
      if (capturedGeneration === generation.current) setPending(false);
    }
  }
  return (
    <div className="idem-experience">
      <section
        className="idem-prediction"
        aria-label="Predict the idempotency result"
      >
        <div>
          <p className="eyebrow">Predict · Inspect · Explain</p>
          <h2>The write happened. The response disappeared.</h2>
          <p>
            {descriptor.presets.find((preset) => preset.id === activePreset)
              ?.question ??
              "Change one condition. Predict which effects become public and which receipt the caller receives."}
          </p>
          <p className="idem-muted">
            Idempotency lets a repeated call reuse an earlier result within a
            defined boundary. Explore that boundary with the same calls under
            three protection modes.
          </p>
        </div>
        <label className="idem-field">
          <span>Your idempotency prediction (optional)</span>
          <textarea
            aria-label="Your idempotency prediction (optional)"
            rows={3}
            maxLength={4000}
            value={prediction}
            onChange={(event) => setPrediction(event.target.value)}
            placeholder="I expect… because…"
          />
          <small>Kept on this page. Use Practice to save an explanation.</small>
        </label>
      </section>
      {error && (
        <div className="idem-error" role="alert">
          {error}
          {run && (
            <p>
              The previous submitted run remains visible. This attempt produced
              no new result.
            </p>
          )}
          <p className="idem-muted">
            Correct the input if needed, then select Run idempotency experiment
            to retry explicitly.
          </p>
        </div>
      )}
      {pending && !run && (
        <p className="idem-muted">
          Running the submitted calls in Java. No result has been received yet.
        </p>
      )}
      <p className="sr-only" role="status" aria-atomic="true">
        {announcement}
      </p>
      <div className="idem-workbench">
        <IdempotencyControls
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
          <IdempotencyResults
            key={run.id}
            result={run.result}
            pending={pending}
            stale={run.draft !== JSON.stringify(form)}
          />
        ) : (
          <section
            className="idem-empty"
            aria-label="No idempotency simulation yet"
          >
            <p className="eyebrow">Start with one uncertain write</p>
            <h2>Will a retry add another effect?</h2>
            <p>
              Run the baseline, then follow the public ledger and the caller's
              missing response. Change only Protection mode to compare the same
              calls, keys and order.
            </p>
            <div className="idem-learning-steps">
              <p>
                <strong>1 · Predict</strong> How many effects will exist?
              </p>
              <p>
                <strong>2 · Inspect</strong> Find the first publication and the
                retry's receipt.
              </p>
              <p>
                <strong>3 · Explain</strong> State the boundary that makes the
                result reusable.
              </p>
            </div>
            <p className="idem-boundary">
              This is a finite virtual-time teaching model. No real database,
              provider, physical durability or automatic retry is implemented.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
