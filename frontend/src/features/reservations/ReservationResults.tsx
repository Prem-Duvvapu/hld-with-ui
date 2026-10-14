import { useState } from "react";
import type { ReservationResult } from "../../api/types";
import { ReservationEvidence } from "./ReservationEvidence";
export function ReservationResults({
  result,
  stale,
  pending,
}: {
  result: ReservationResult;
  stale: boolean;
  pending: boolean;
}) {
  const [position, setPosition] = useState(0);
  const outcome = position ? result.outcomes[position - 1] : undefined;
  const state = outcome?.postState ?? result.initialState;
  return (
    <section
      className="reservation-results"
      aria-label="Java reservation analysis results"
    >
      <div className="reservation-results-heading">
        <h2>Follow the shared stock</h2>
        <span className="reservation-version">
          Java model {result.modelVersion}
        </span>
      </div>
      {(pending || stale) && (
        <p role="status" className="reservation-run-status">
          {pending
            ? "Running a new schedule. Showing the previous submitted schedule until Java responds."
            : "Inputs have changed. These results belong to the previous submitted schedule. Run again to compare."}
        </p>
      )}
      <p className="reservation-muted">
        Submitted:{" "}
        {result.input.strategy === "STALE_READ_WRITE"
          ? "earlier read, then assign"
          : "current-state atomic reservation"}{" "}
        · initial stock {result.input.initialUnits} ·{" "}
        {result.input.reservations.length} reservations.
      </p>
      <div
        className="reservation-playback"
        aria-label="Select a reservation snapshot"
      >
        <div className="reservation-playback-buttons">
          <button
            disabled={position === 0}
            onClick={() => setPosition(position - 1)}
          >
            Previous step
          </button>
          <span aria-live="polite">
            {position} / {result.outcomes.length}
          </span>
          <button
            disabled={position === result.outcomes.length}
            onClick={() => setPosition(position + 1)}
          >
            Next step
          </button>
        </div>
        <label htmlFor="reservation-snapshot-position">Snapshot position</label>
        <input
          id="reservation-snapshot-position"
          type="range"
          min={0}
          max={result.outcomes.length}
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
        />
        <button onClick={() => setPosition(0)}>Reset to initial state</button>
        <ol className="reservation-returned-steps">
          <li>
            <button
              aria-pressed={position === 0}
              onClick={() => setPosition(0)}
            >
              Initial state
            </button>
          </li>
          {result.outcomes.map((step) => (
            <li key={step.stepId}>
              <button
                aria-pressed={position === step.sequence}
                onClick={() => setPosition(step.sequence)}
              >
                {step.sequence}. {step.stepId} · {step.reservationId} ·{" "}
                {step.kind === "READ_OBSERVED"
                  ? "Read observed"
                  : step.kind === "RESERVATION_ACCEPTED"
                    ? "Accepted"
                    : "Rejected"}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <ReservationEvidence
        input={result.input}
        state={state}
        outcome={outcome}
      />
      <section
        className="reservation-summary"
        aria-label="Whole schedule summary"
      >
        <p className="eyebrow">3 · Explain the result</p>
        <h3>Whole schedule summary</h3>
        <p>
          These Java metrics cover every submitted step, including steps after
          the selected snapshot.
        </p>
        <dl>
          <div>
            <dt>Accepted reservations</dt>
            <dd>{result.metrics.acceptedReservations}</dd>
          </div>
          <div>
            <dt>Rejected reservations</dt>
            <dd>{result.metrics.rejectedReservations}</dd>
          </div>
          <div>
            <dt>Final remaining units</dt>
            <dd>{result.metrics.finalRemainingUnits}</dd>
          </div>
          <div>
            <dt>Final allocated units</dt>
            <dd>{result.metrics.finalAllocatedUnits}</dd>
          </div>
          <div>
            <dt>Invariant status across all steps</dt>
            <dd>
              {result.metrics.invariantStatus === "PRESERVED"
                ? "Preserved"
                : "Violated"}
            </dd>
          </div>
          <div>
            <dt>First violating step</dt>
            <dd>{result.metrics.firstViolationStepId ?? "None"}</dd>
          </div>
        </dl>
        <p className="reservation-explain">
          Explain the earlier observation, the value checked at the attempt, and
          the rule preserved or broken. Then change one quantity or step order
          and predict again.
        </p>
      </section>
      <details className="reservation-assumptions">
        <summary>Model boundaries and assumptions</summary>
        <ul>
          {result.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
