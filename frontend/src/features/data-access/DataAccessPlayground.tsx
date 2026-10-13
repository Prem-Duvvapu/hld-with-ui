import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { DataAccessDescriptor, DataAccessResult } from "../../api/types";
import { DataAccessControls } from "./DataAccessControls";
import { DataAccessResults } from "./DataAccessResults";
import {
  parseDataAccessForm,
  toDataAccessForm,
  type DataAccessForm,
} from "./dataAccessForm";
import "./DataAccess.css";
export function DataAccessPlayground({
  descriptor,
}: {
  descriptor: DataAccessDescriptor;
}) {
  const baseline = descriptor.presets.find(
    (preset) => preset.id === "baseline",
  )!;
  const [form, setForm] = useState(() => toDataAccessForm(baseline.input));
  const [activePreset, setActivePreset] = useState(baseline.id);
  const [prediction, setPrediction] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [run, setRun] = useState<{
    result: DataAccessResult;
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
  function update(next: DataAccessForm) {
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
    setForm(toDataAccessForm(preset.input));
    setActivePreset(id);
    setErrors({});
    setError("");
  }
  async function analyze() {
    if (busy.current) return;
    const parsed = parseDataAccessForm(form, descriptor.limits);
    setErrors(parsed.errors);
    setError("");
    if (!parsed.input) {
      setError(
        "Check the highlighted fields. Your design and previous results have been kept.",
      );
      return;
    }
    const draft = JSON.stringify(form),
      current = generation.current;
    busy.current = true;
    setPending(true);
    try {
      const result = await api.runDataAccess(parsed.input);
      if (generation.current === current)
        setRun((previous) => ({ result, draft, id: (previous?.id ?? 0) + 1 }));
    } catch (cause: unknown) {
      if (generation.current === current)
        setError(
          cause instanceof Error
            ? cause.message
            : "The Java analysis could not run. Keep your design and try again.",
        );
    } finally {
      busy.current = false;
      if (generation.current === current) setPending(false);
    }
  }
  const question =
    descriptor.presets.find((preset) => preset.id === activePreset)?.question ??
    "Which records will this design examine, and which write rule will it enforce?";
  return (
    <div className="access-experience">
      <section
        className="access-prediction"
        aria-label="Predict the access pattern"
      >
        <div>
          <p className="eyebrow">Predict · inspect · explain</p>
          <h2>Same data. Different work.</h2>
          <p>{question}</p>
          <p className="access-muted">
            A key helps answer a particular question. A separate write rule
            protects what must stay unique.
          </p>
        </div>
        <div className="access-field">
          <label htmlFor="access-prediction">Your prediction (optional)</label>
          <textarea
            id="access-prediction"
            value={prediction}
            maxLength={4000}
            rows={3}
            onChange={(event) => setPrediction(event.target.value)}
            placeholder="Name the records you expect, the work needed, and one tradeoff."
          />
          <small className="access-muted">
            This prediction stays on this page. Practice explanations can be
            saved locally.
          </small>
        </div>
      </section>
      {error && (
        <div className="access-error" role="alert">
          <strong>Analysis needs attention</strong>
          <p>{error}</p>
        </div>
      )}
      {pending && !run && (
        <p role="status">
          Running the submitted design in Java. No results have been received
          yet.
        </p>
      )}
      <div className="access-workbench">
        <DataAccessControls
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
          <DataAccessResults
            key={run.id}
            result={run.result}
            stale={run.draft !== JSON.stringify(form)}
            pending={pending}
          />
        ) : (
          <section className="access-empty" aria-label="No access analysis yet">
            <p className="eyebrow">Your next experiment</p>
            <h2>Ask a precise question</h2>
            <ol>
              <li>Predict the records returned for one tenant.</li>
              <li>Run the same query with each index order.</li>
              <li>Compare entries examined with records fetched.</li>
              <li>Try a duplicate business key and explain the write rule.</li>
            </ol>
            <div className="access-empty-path">
              <span>Query</span>
              <span aria-hidden="true">→</span>
              <span>Access path</span>
              <span aria-hidden="true">→</span>
              <span>Evidence</span>
            </div>
            <p>
              The analysis uses a bounded ordered-list model. It executes
              sequential operations and does not emulate a database engine or
              concurrent transactions.
            </p>
            <p className="access-muted">
              No run starts automatically. Change the design, then choose Run
              access analysis.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
