import { useState } from "react";
import type { DataAccessResult } from "../../api/types";
import { indexLabels } from "./DataAccessControls";
import {
  DataAccessCounts,
  DataAccessEvidence,
  DataAccessRecords,
  dataAccessOperationLabels,
} from "./DataAccessEvidence";
export function DataAccessResults({
  result,
  stale,
  pending,
}: {
  result: DataAccessResult;
  stale: boolean;
  pending: boolean;
}) {
  const [position, setPosition] = useState(0);
  return (
    <section
      className="access-results"
      aria-label="Java access analysis results"
    >
      <div className="access-results-heading">
        <div>
          <p className="eyebrow">Observed model evidence</p>
          <h2>Follow the work</h2>
        </div>
        <span className="access-version">Java model {result.modelVersion}</span>
      </div>
      <p role="status" className="access-run-status">
        {pending
          ? "A new analysis is running. These are the previous results."
          : stale
            ? "Inputs changed. These results still belong to the previous submitted design."
            : "Analysis complete. These results match the submitted design."}
      </p>
      <div className="access-submitted">
        <strong>Submitted design</strong>
        <span>{indexLabels[result.input.indexOrder]}</span>
        <span>
          Business-key uniqueness{" "}
          {result.input.enforceBusinessKey ? "required" : "disabled"}
        </span>
        <span>
          {result.input.rows.length} initial records · {result.outcomes.length}{" "}
          operations · {result.finalRows.length} final records
        </span>
      </div>
      <nav className="access-outcomes" aria-label="Select an operation result">
        {result.outcomes.map((outcome, index) => (
          <button
            type="button"
            key={outcome.operationId}
            aria-pressed={position === index}
            onClick={() => setPosition(index)}
          >
            {index + 1} · {outcome.operationId} ·{" "}
            {dataAccessOperationLabels[outcome.kind]}
          </button>
        ))}
      </nav>
      <div className="access-step-controls">
        <button
          type="button"
          disabled={position === 0}
          onClick={() => setPosition(position - 1)}
        >
          Previous operation
        </button>
        <span>
          Operation {position + 1} of {result.outcomes.length}
        </span>
        <button
          type="button"
          disabled={position === result.outcomes.length - 1}
          onClick={() => setPosition(position + 1)}
        >
          Next operation
        </button>
      </div>
      <DataAccessEvidence result={result} position={position} />
      {result.outcomes.length > 1 && (
        <section className="access-total">
          <h3>Whole workload</h3>
          <DataAccessCounts work={result.totals} totals />
          <p className="access-muted">
            Counts include every operation, including a repeated query. They are
            not unique-record counts.
          </p>
        </section>
      )}
      <details className="access-final">
        <summary>Final record set · {result.finalRows.length} records</summary>
        <DataAccessRecords
          rows={result.finalRows}
          caption="Records after the complete workload"
        />
      </details>
      <details className="access-assumptions">
        <summary>What this analysis models</summary>
        <ul>
          {result.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </details>
      <section className="access-transfer">
        <h3>Explain the decision</h3>
        <p>
          Which access path supports this query? Point to the examined entries
          and returned records, then explain its write cost. If the query
          changes to every tenant, would you keep the same design?
        </p>
        <p className="access-muted">
          These are illustrative logical work counts. They do not measure
          database latency, disk writes or production capacity.
        </p>
      </section>
    </section>
  );
}
