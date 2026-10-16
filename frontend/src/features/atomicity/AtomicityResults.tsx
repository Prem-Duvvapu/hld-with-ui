import { useId, useState } from "react";
import type { AtomicityResult } from "../../api/types";
import { AtomicityEvidence, atomicityKindLabels } from "./AtomicityEvidence";
export function AtomicityResults({
  result,
  stale,
  pending,
}: {
  result: AtomicityResult;
  stale: boolean;
  pending: boolean;
}) {
  const scope = useId(),
    [position, setPosition] = useState(0);
  const outcome = position ? result.outcomes[position - 1] : undefined;
  const state = outcome?.postState ?? result.initialState;
  return (
    <section
      className="atomicity-results"
      aria-label="Java atomicity analysis results"
    >
      <div className="atomicity-results-heading">
        <h2>What was actually published?</h2>
        <span className="atomicity-version">
          Java model {result.modelVersion}
        </span>
      </div>
      {(pending || stale) && (
        <p role="status" className="atomicity-run-status">
          {pending
            ? "Running a new atomicity schedule. Showing the previous submitted schedule until Java responds."
            : "Inputs have changed. These results belong to the previous submitted atomicity schedule. Run again to compare."}
        </p>
      )}
      <p className="atomicity-muted">
        Submitted:{" "}
        {result.input.mode === "SPLIT_WRITES"
          ? "separate published writes"
          : "private work with a revision check"}{" "}
        · initial stock {result.input.initialUnits} units ·{" "}
        {result.input.transactions.length} transactions.
      </p>
      <div
        className="atomicity-playback"
        aria-label="Select an atomicity snapshot"
      >
        <div className="atomicity-playback-buttons">
          <button
            type="button"
            disabled={position === 0}
            onClick={() => setPosition(position - 1)}
          >
            Previous atomicity step
          </button>
          <span aria-live="polite">
            {position} / {result.outcomes.length}
          </span>
          <button
            type="button"
            disabled={position === result.outcomes.length}
            onClick={() => setPosition(position + 1)}
          >
            Next atomicity step
          </button>
        </div>
        <label htmlFor={`${scope}-position`}>Atomicity snapshot position</label>
        <input
          id={`${scope}-position`}
          type="range"
          min={0}
          max={result.outcomes.length}
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
        />
        <button type="button" onClick={() => setPosition(0)}>
          Reset atomicity snapshot
        </button>
        <ol className="atomicity-returned-steps">
          <li>
            <button
              type="button"
              aria-pressed={position === 0}
              onClick={() => setPosition(0)}
            >
              Initial atomicity state
            </button>
          </li>
          {result.outcomes.map((step) => (
            <li key={step.stepId}>
              <button
                type="button"
                aria-pressed={position === step.sequence}
                onClick={() => setPosition(step.sequence)}
              >
                {step.sequence}. {step.stepId} · {step.transactionId} ·{" "}
                {atomicityKindLabels[step.kind]}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <AtomicityEvidence input={result.input} state={state} outcome={outcome} />
      <section
        className="atomicity-summary"
        aria-label="Whole atomicity experiment summary"
      >
        <p className="eyebrow">3 · Explain the whole history</p>
        <h3>Whole experiment summary</h3>
        <p>
          These Java metrics cover all returned steps, including those after the
          selected snapshot. A consistent final state does not erase an earlier
          breach.
        </p>
        <dl>
          {[
            ["Committed transactions", result.metrics.committedTransactions],
            ["Aborted transactions", result.metrics.abortedTransactions],
            ["Revision conflicts", result.metrics.conflictedTransactions],
            [
              "Aborted transactions with published effects",
              result.metrics.abortedTransactionsWithEffects,
            ],
            ["Final remaining units", result.metrics.finalRemainingUnits],
            ["Final allocated units", result.metrics.finalAllocatedUnits],
            [
              "Invariant status across all steps",
              result.metrics.invariantStatus === "PRESERVED"
                ? "Preserved"
                : "Violated",
            ],
            [
              "First violating step",
              result.metrics.firstViolationStepId ?? "None",
            ],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="atomicity-explain">
          Explain the published state, private work and terminal decision
          separately. Then change one quantity or step order and predict again.
        </p>
      </section>
      <details className="atomicity-assumptions">
        <summary>Atomicity model boundaries and assumptions</summary>
        <ul>
          {result.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
