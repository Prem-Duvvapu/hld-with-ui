import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { ReservationDescriptor, ReservationResult } from "../../api/types";
import { ReservationControls } from "./ReservationControls";
import { ReservationResults } from "./ReservationResults";
import {
  parseReservationForm,
  toReservationForm,
  type ReservationForm,
} from "./reservationForm";
import "./Reservation.css";
export function ReservationPlayground({
  descriptor,
}: {
  descriptor: ReservationDescriptor;
}) {
  const baseline = descriptor.presets.find(
    (preset) => preset.id === "unsafe-baseline",
  )!;
  const [form, setForm] = useState(() => toReservationForm(baseline.input));
  const [activePreset, setActivePreset] = useState(baseline.id);
  const [prediction, setPrediction] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [run, setRun] = useState<{
    result: ReservationResult;
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
  function update(next: ReservationForm) {
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
    setForm(toReservationForm(preset.input));
    setActivePreset(id);
    setErrors({});
    setError("");
  }
  async function analyze() {
    if (busy.current) return;
    const parsed = parseReservationForm(form, descriptor.limits);
    setErrors(parsed.errors);
    setError("");
    if (!parsed.input) {
      setError(
        "Check the highlighted fields. Your inputs and previous results have been kept.",
      );
      return;
    }
    const draft = JSON.stringify(form),
      current = generation.current;
    busy.current = true;
    setPending(true);
    try {
      const result = await api.runReservation(parsed.input);
      if (generation.current === current)
        setRun((previous) => ({ result, draft, id: (previous?.id ?? 0) + 1 }));
    } catch (cause: unknown) {
      if (generation.current === current)
        setError(
          cause instanceof Error
            ? cause.message
            : "The Java analysis could not run. Keep your inputs and try again.",
        );
    } finally {
      busy.current = false;
      if (generation.current === current) setPending(false);
    }
  }
  const question =
    descriptor.presets.find((preset) => preset.id === activePreset)
      ?.description ??
    "Who will reserve successfully, and which rule might the schedule break?";
  return (
    <div className="reservation-experience">
      <section
        className="reservation-prediction"
        aria-label="Predict the reservation result"
      >
        <div>
          <p className="eyebrow">Predict · inspect · explain</p>
          <h2>Two readers. One shared stock.</h2>
          <p>{question}</p>
          <p className="reservation-muted">
            An earlier observation can become stale. Inspect what each attempt
            checks before stock and allocations change.
          </p>
        </div>
        <div className="reservation-field">
          <label htmlFor="reservation-prediction">
            Your prediction (optional)
          </label>
          <textarea
            id="reservation-prediction"
            value={prediction}
            maxLength={4000}
            rows={3}
            onChange={(event) => setPrediction(event.target.value)}
            placeholder="Predict accepted quantities, final stock, and the rule that must hold."
          />
          <small className="reservation-muted">
            This prediction stays on this page. Practice explanations can be
            saved locally.
          </small>
        </div>
      </section>
      {error && (
        <div className="reservation-error" role="alert">
          <strong>Analysis needs attention</strong>
          <p>{error}</p>
        </div>
      )}
      {pending && !run && (
        <p role="status">
          Running the submitted schedule in Java. No results have been received
          yet.
        </p>
      )}
      <div className="reservation-workbench">
        <ReservationControls
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
          <ReservationResults
            key={run.id}
            result={run.result}
            stale={run.draft !== JSON.stringify(form)}
            pending={pending}
          />
        ) : (
          <section
            className="reservation-empty"
            aria-label="No reservation analysis yet"
          >
            <p className="eyebrow">Your next experiment</p>
            <h2>Start with both readers</h2>
            <ol>
              <li>
                Predict what happens when both reservations read one remaining
                unit.
              </li>
              <li>
                Run the stale-read schedule, then inspect each returned step.
              </li>
              <li>
                Switch to the atomic strategy and compare its acceptance
                boundary.
              </li>
              <li>
                Change a quantity or step order and explain capacity and
                conservation.
              </li>
            </ol>
            <div className="reservation-empty-path">
              <span>Read stock</span>
              <span aria-hidden="true">→</span>
              <span>Attempt</span>
              <span aria-hidden="true">→</span>
              <span>Check rules</span>
            </div>
            <p>
              The analysis models an explicit interleaving of reservation
              actions. It does not emulate a database engine, durable commits,
              rollback or retries.
            </p>
            <p className="reservation-muted">
              No run starts automatically. Change the inputs, then choose Run
              reservation schedule.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
