import type {
  DataAccessResult,
  DataAccessRow,
  DataAccessWork,
} from "../../api/types";
const paths = {
  PRIMARY_KEY: "Direct primary ID lookup",
  TABLE_SCAN: "Scan the complete record set",
  TENANT_CREATED_INDEX: "Scan tenant → created order entries",
  CREATED_TENANT_INDEX: "Scan created order → tenant entries",
  INSERT: "Check the keys, then insert",
};
export const dataAccessOperationLabels = {
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
export function DataAccessRecords({
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
export function DataAccessCounts({
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
/** Displays one Java outcome. No later outcomes, whole-run totals or final-state claims. */
export function DataAccessEvidence({
  result,
  position,
}: {
  result: DataAccessResult;
  position: number;
}) {
  const selected = result.outcomes[position];
  const operation = result.input.operations[position];
  if (!selected || !operation)
    return <p role="alert">This operation's Java evidence is unavailable.</p>;
  // Rows are immutable and append-only; the validated result supplies their original values.
  const rowsById = new Map(result.finalRows.map((row) => [row.id, row]));
  return (
    <article
      className="access-evidence"
      aria-label={`Evidence for ${selected.operationId}`}
    >
      <p className="eyebrow">
        {selected.operationId} · {dataAccessOperationLabels[selected.kind]}
      </p>
      <h3>{paths[selected.accessPath]}</h3>
      <p className="access-muted">
        Submitted operation:{" "}
        {operation.kind === "INSERT"
          ? `insert ${operation.row.id} / ${operation.row.tenant} / ${operation.row.businessKey} / ${operation.row.createdOrder}`
          : operation.kind === "LOOKUP_ID"
            ? `find record ${operation.rowId}`
            : `${operation.kind === "TENANT_RANGE" ? `tenant ${operation.tenant}` : "every tenant"}, created order ${operation.fromCreatedOrder}–${operation.toCreatedOrder}, limit ${operation.limit}`}
        .
      </p>
      <p className="access-explanation">{selected.explanation}</p>
      <DataAccessCounts work={selected.work} />
      {selected.kind === "INSERT" ? (
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
            <DataAccessRecords
              rows={[operation.row]}
              caption="Proposed record"
            />
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
              <IdList ids={selected.matchedIds} empty="No matching records." />
              <small>All matches, ordered by created order then ID.</small>
            </section>
            <section>
              <span className="access-flow-number">03</span>
              <h4>Return the result</h4>
              <IdList
                ids={selected.returnedIds}
                empty="The query returned no records."
              />
              <small>The result limit is applied after the modeled work.</small>
            </section>
          </div>
          <DataAccessRecords
            rows={selected.returnedIds.map((id) => rowsById.get(id)!)}
            caption="Returned records for this operation"
          />
          <p className="access-muted">
            Primary ID lookups: {selected.work.primaryKeyLookups} · Index
            traversal starts: {selected.work.indexSeeks} · Matches before limit:{" "}
            {selected.work.matchedRows}
          </p>
        </>
      )}
      <p className="access-muted">
        Record count: {selected.recordCountBefore} before this operation →{" "}
        {selected.recordCountAfter} after it.
      </p>
      <p className="access-muted">
        These counts belong to this operation only. Created order is not elapsed
        time.
      </p>
    </article>
  );
}
