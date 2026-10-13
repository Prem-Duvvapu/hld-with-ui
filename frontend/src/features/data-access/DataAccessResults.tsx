import { useState } from "react";
import type {
  DataAccessResult,
  DataAccessRow,
  DataAccessWork,
} from "../../api/types";
import { indexLabels } from "./DataAccessControls";
const paths = {
  PRIMARY_KEY: "Direct primary ID lookup",
  TABLE_SCAN: "Scan the complete record set",
  TENANT_CREATED_INDEX: "Scan tenant → created order entries",
  CREATED_TENANT_INDEX: "Scan created order → tenant entries",
  INSERT: "Check the keys, then insert",
};
const labels: Record<DataAccessResult["outcomes"][number]["kind"], string> = {
  LOOKUP_ID: "ID lookup",
  TENANT_RANGE: "Tenant range",
  ALL_RANGE: "Every tenant",
  INSERT: "Insert",
};
function IdList({ ids, empty = "None" }: { ids: string[]; empty?: string }) {
  return ids.length ? (
    <div className="access-ids">
      {ids.map((id) => (
        <code key={id}>{id}</code>
      ))}
    </div>
  ) : (
    <p className="access-muted">{empty}</p>
  );
}
function Records({
  rows,
  caption,
}: {
  rows: DataAccessRow[];
  caption: string;
}) {
  return rows.length ? (
    <div
      className="access-table-scroll"
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Record</th>
            <th scope="col">Tenant</th>
            <th scope="col">Business key</th>
            <th scope="col">Created order</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">
                <code>{row.id}</code>
              </th>
              <td>{row.tenant}</td>
              <td>
                <code>{row.businessKey}</code>
              </td>
              <td>{row.createdOrder}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="access-muted">No records in this set.</p>
  );
}
function Counts({
  work,
  totals = false,
}: {
  work: DataAccessWork;
  totals?: boolean;
}) {
  return (
    <dl
      className="access-counts"
      aria-label={
        totals ? "Whole workload counts" : "Selected operation counts"
      }
    >
      {(
        [
          ["Index entries examined", work.indexEntriesExamined],
          ["Base records examined", work.baseRowsExamined],
          ["Records returned", work.returnedRows],
          ["Base record writes", work.baseWrites],
        ] as const
      ).map(([label, count]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{count}</dd>
        </div>
      ))}
    </dl>
  );
}
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
  const selected = result.outcomes[position]!;
  const operation = result.input.operations[position]!;
  const finalById = new Map(result.finalRows.map((row) => [row.id, row]));
  const isInsert = selected.kind === "INSERT";
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
            {index + 1} · {outcome.operationId} · {labels[outcome.kind]}
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
      <article
        className="access-evidence"
        aria-label={`Evidence for ${selected.operationId}`}
      >
        <p className="eyebrow">
          {selected.operationId} · {labels[selected.kind]}
        </p>
        <h3>{paths[selected.accessPath]}</h3>
        <p className="access-explanation">{selected.explanation}</p>
        <Counts work={selected.work} />
        {isInsert ? (
          <>
            <div
              className={`access-write-outcome ${selected.accepted ? "accepted" : "rejected"}`}
            >
              <strong>
                {selected.accepted ? "Record inserted" : "Insert rejected"}
              </strong>
              <p>
                {selected.conflict
                  ? `${selected.conflict.reason === "DUPLICATE_ID" ? "Record ID already exists" : "Business key already exists within this tenant"}: ${selected.conflict.recordId}. No record or access structure changed.`
                  : "The accepted record is available to later operations in this workload."}
              </p>
            </div>
            {operation.kind === "INSERT" && (
              <Records rows={[operation.row]} caption="Proposed record" />
            )}
            <dl className="access-detail-counts">
              <div>
                <dt>Primary ID checks</dt>
                <dd>{selected.work.primaryKeyLookups}</dd>
              </div>
              <div>
                <dt>Business-key checks</dt>
                <dd>{selected.work.businessKeyChecks}</dd>
              </div>
              <div>
                <dt>Secondary entries written</dt>
                <dd>{selected.work.secondaryIndexWrites}</dd>
              </div>
              <div>
                <dt>Business-key entries written</dt>
                <dd>{selected.work.businessKeyWrites}</dd>
              </div>
            </dl>
          </>
        ) : (
          <>
            <div className="access-flow" aria-label="Candidate to result flow">
              <section>
                <span className="access-flow-number">01</span>
                <h4>
                  {selected.accessPath === "TABLE_SCAN"
                    ? "Scan candidates"
                    : selected.accessPath === "PRIMARY_KEY"
                      ? "Primary-key match"
                      : "Index candidates"}
                </h4>
                <IdList ids={selected.candidateIds} />
                <small>Traversal order, before remaining filters.</small>
              </section>
              <section>
                <span className="access-flow-number">02</span>
                <h4>Match the query</h4>
                <IdList
                  ids={selected.matchedIds}
                  empty="No matching records."
                />
                <small>All matches, ordered by created order then ID.</small>
              </section>
              <section>
                <span className="access-flow-number">03</span>
                <h4>Return the result</h4>
                <IdList
                  ids={selected.returnedIds}
                  empty="The query returned no records."
                />
                <small>
                  The result limit is applied after the modeled work.
                </small>
              </section>
            </div>
            <Records
              rows={selected.returnedIds.map((id) => finalById.get(id)!)}
              caption="Returned records for this operation"
            />
            <p className="access-muted">
              Primary ID lookups: {selected.work.primaryKeyLookups} · Index
              traversal starts: {selected.work.indexSeeks} · Matches before
              limit: {selected.work.matchedRows}
            </p>
          </>
        )}
        <p className="access-muted">
          Record count: {selected.recordCountBefore} before this operation →{" "}
          {selected.recordCountAfter} after it.
        </p>
      </article>
      {result.outcomes.length > 1 && (
        <section className="access-total">
          <h3>Whole workload</h3>
          <Counts work={result.totals} totals />
          <p className="access-muted">
            Counts include every operation, including a repeated query. They are
            not unique-record counts.
          </p>
        </section>
      )}
      <details className="access-final">
        <summary>Final record set · {result.finalRows.length} records</summary>
        <Records
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
