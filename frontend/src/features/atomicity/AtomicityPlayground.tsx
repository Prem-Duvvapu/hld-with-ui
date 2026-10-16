import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../api/client";
import type { AtomicityDescriptor, AtomicityResult } from "../../api/types";
import { AtomicityControls } from "./AtomicityControls";
import { AtomicityResults } from "./AtomicityResults";
import {
  parseAtomicityForm,
  toAtomicityForm,
  type AtomicityForm,
} from "./atomicityForm";
import "./Atomicity.css";
export function AtomicityPlayground({
  descriptor,
}: {
  descriptor: AtomicityDescriptor;
}) {
  const baseline = descriptor.presets.find(
    (preset) => preset.id === "baseline",
  )!;
  const scope = useId();
  const [form, setForm] = useState(() => toAtomicityForm(baseline.input));
  const [activePreset, setActivePreset] = useState(baseline.id),
    [prediction, setPrediction] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [run, setRun] = useState<{
    result: AtomicityResult;
    draft: string;
    id: number;
  } | null>(null);
  const busy = useRef(false),
    generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  function update(next: AtomicityForm) {
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
    setForm(toAtomicityForm(preset.input));
    setActivePreset(id);
    setErrors({});
    setError("");
  }
  async function analyze() {
    if (busy.current) return;
    const parsed = parseAtomicityForm(form, descriptor.limits);
    setErrors(parsed.errors);
    setError("");
    if (!parsed.input) {
      setError(
        "Check the highlighted fields. Your input, prediction and previous results have been kept.",
      );
      return;
    }
    const draft = JSON.stringify(form),
      current = generation.current;
    busy.current = true;
    setPending(true);
    try {
      const result = await api.runAtomicity(parsed.input);
      if (generation.current === current)
        setRun((previous) => ({ result, draft, id: (previous?.id ?? 0) + 1 }));
    } catch (cause: unknown) {
      if (generation.current === current)
        setError(
          cause instanceof Error
            ? cause.message
            : "The Java atomicity analysis could not run. Keep your input and try again.",
        );
    } finally {
      busy.current = false;
      if (generation.current === current) setPending(false);
    }
  }
  return (
    <div className="atomicity-experience">
      <section
        className="atomicity-prediction"
        aria-label="Predict the atomicity result"
      >
        <div>
          <p className="eyebrow">
            Atomicity & abort · Predict, inspect, explain
          </p>
          <h2>One operation. Two related writes.</h2>
          <p>
            {descriptor.presets.find((preset) => preset.id === activePreset)
              ?.description ??
              "What will be published, what stays private, and what does abort remove?"}
          </p>
          <p className="atomicity-muted">
            Published effects and private proposals are different facts. A
            completed analysis can contain valid aborts or intentional invariant
            failures.
          </p>
        </div>
        <div className="atomicity-field">
          <label htmlFor={`${scope}-prediction`}>
            Your atomicity prediction (optional)
          </label>
          <textarea
            id={`${scope}-prediction`}
            rows={3}
            maxLength={4000}
            value={prediction}
            onChange={(event) => setPrediction(event.target.value)}
            placeholder="Predict published units, private work, and what remains after the terminal decision."
          />
          <small className="atomicity-muted">
            Prediction stays in this workbench. Practice explanations can be
            saved locally.
          </small>
        </div>
      </section>
      {error && (
        <div className="atomicity-error" role="alert">
          <strong>Atomicity analysis needs attention</strong>
          <p>{error}</p>
        </div>
      )}
      {pending && !run && (
        <p role="status">
          Running the submitted atomicity schedule in Java. No new evidence has
          been received yet.
        </p>
      )}
      <div className="atomicity-workbench">
        <AtomicityControls
          descriptor={descriptor}
          form={form}
          errors={errors}
          pending={pending}
          activePreset={activePreset}
          update={update}
          selectPreset={selectPreset}
          run={() => void analyze()}
        />
        {run ? (
          <AtomicityResults
            key={run.id}
            result={run.result}
            stale={run.draft !== JSON.stringify(form)}
            pending={pending}
          />
        ) : (
          <section
            className="atomicity-empty"
            aria-label="No atomicity analysis yet"
          >
            <p className="eyebrow">Your next experiment</p>
            <h2>What does abort remove?</h2>
            <ol>
              <li>
                Predict what remains after stock changes before its allocation
                record.
              </li>
              <li>
                Run the separate-write abort and inspect the returned initial
                state and each step.
              </li>
              <li>
                Choose private staging and compare what was published versus
                discarded.
              </li>
              <li>
                Try a revision conflict and explain why enough stock does not
                always permit publication.
              </li>
            </ol>
            <p>
              No run starts automatically. Commit here means local modeled
              publication, with no SQL isolation-level, durable storage,
              recovery, acknowledgement, retry or idempotency guarantee.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
