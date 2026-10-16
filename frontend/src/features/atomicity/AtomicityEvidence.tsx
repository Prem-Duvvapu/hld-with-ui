import type {
  AtomicityInput,
  AtomicityOutcome,
  AtomicityState,
} from "../../api/types";
const phases = {
  NOT_STARTED: "Not started",
  OPEN: "Open",
  BLOCKED: "Blocked",
  COMMITTED: "Committed locally",
  ABORTED: "Aborted",
};
export const atomicityKindLabels: Record<AtomicityOutcome["kind"], string> = {
  TRANSACTION_STARTED: "Transaction started",
  STOCK_APPLIED: "Stock published",
  STOCK_STAGED: "Stock staged privately",
  STOCK_REJECTED: "Stock rejected",
  ALLOCATION_APPLIED: "Allocation published",
  ALLOCATION_STAGED: "Allocation staged privately",
  WORK_SKIPPED: "Work skipped",
  TRANSACTION_COMMITTED: "Transaction committed locally",
  TRANSACTION_ABORTED: "Transaction aborted",
};
const reasons = {
  USER_ABORT: "Explicit user abort",
  INSUFFICIENT_STOCK: "Insufficient stock",
  REVISION_CONFLICT: "Published revision changed",
};
export function AtomicityEvidence({
  input,
  state,
  outcome,
}: {
  input: AtomicityInput;
  state: AtomicityState;
  outcome?: AtomicityOutcome;
}) {
  return (
    <section
      aria-label="Selected atomicity snapshot"
      className="atomicity-snapshot"
    >
      <article
        aria-label={
          outcome
            ? `Atomicity evidence for ${outcome.stepId}`
            : "Initial atomicity state"
        }
      >
        <p className="eyebrow">2 · Inspect the selected Java step</p>
        <h3>
          {outcome ? `${outcome.sequence}. ${outcome.stepId}` : "Initial state"}
        </h3>
        <p>
          {outcome?.explanation ??
            "This is the Java-reported starting state. No transaction has begun and nothing has been published or staged."}
        </p>
        {outcome && (
          <p className="atomicity-decision">
            <strong>{atomicityKindLabels[outcome.kind]}</strong>
            {outcome.checkedRemaining !== undefined && (
              <span>
                Checked {outcome.checkedRemaining} units from{" "}
                {outcome.checkSource === "CURRENT"
                  ? "current published stock"
                  : "the captured working copy"}
                .
              </span>
            )}
            {outcome.expectedRevision !== undefined && (
              <span>
                Expected revision {outcome.expectedRevision}; actual revision{" "}
                {outcome.actualRevision}.
              </span>
            )}
            {outcome.reason && (
              <span>
                Reason: {reasons[outcome.reason]} ({outcome.reason}).
              </span>
            )}
          </p>
        )}
      </article>
      <section
        aria-label="Published state at this step"
        className="atomicity-published"
      >
        <h4>Published state</h4>
        <p className="atomicity-muted">
          Private work is excluded from these Java counts and checks.
        </p>
        <dl className="atomicity-counts">
          <div>
            <dt>Remaining units</dt>
            <dd>{state.remainingUnits}</dd>
          </div>
          <div>
            <dt>Allocated units</dt>
            <dd>{state.allocatedUnits}</dd>
          </div>
          <div>
            <dt>Accounted units</dt>
            <dd>{state.invariants.accountedUnits}</dd>
          </div>
          <div>
            <dt>Published revision</dt>
            <dd>{state.revision}</dd>
          </div>
        </dl>
        <p className="atomicity-muted">
          Submitted initial stock: {input.initialUnits} units.
        </p>
        <dl
          className="atomicity-invariants"
          aria-label="Published invariant checks at this step"
        >
          {[
            [
              "Remaining stock is nonnegative",
              state.invariants.remainingNonnegative,
            ],
            [
              "Allocated units fit initial capacity",
              state.invariants.allocatedWithinCapacity,
            ],
            [
              "Remaining + allocated equals initial stock",
              state.invariants.unitsConserved,
            ],
            [
              "Aborted transactions have no published effects",
              state.invariants.abortedEffectsAbsent,
            ],
          ].map(([label, passed]) => (
            <div key={String(label)} className={passed ? "passed" : "failed"}>
              <dt>{label}</dt>
              <dd>{passed ? "Preserved" : "Violated"}</dd>
            </div>
          ))}
        </dl>
        <section aria-label="Published allocations at this step">
          <h4>Visible allocation records</h4>
          {state.allocations.length ? (
            <ul className="atomicity-allocations">
              {state.allocations.map((row) => (
                <li key={row.transactionId}>
                  <strong>{row.transactionId}</strong> · {row.quantity} units{" "}
                  <span>
                    Prepared at <code>{row.preparedAtStepId}</code> · published
                    at <code>{row.publishedAtStepId}</code>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No published allocations at this step.</p>
          )}
          <p className="atomicity-muted">
            Visible records still count when their split-write transaction later
            aborts.
          </p>
        </section>
      </section>
      <section
        aria-label="Private work at this step"
        className="atomicity-private"
      >
        <h4>Transactions and private work</h4>
        <p className="atomicity-muted">
          A captured base is history. Prepared work is private until
          publication; an absent workspace is not a zero-valued proposal.
        </p>
        <ul className="atomicity-actors">
          {state.transactions.map((actor) => (
            <li
              key={actor.id}
              aria-label={`Transaction ${actor.id}`}
              className={outcome?.transactionId === actor.id ? "active" : ""}
            >
              <div>
                <strong>{actor.id}</strong>
                <span
                  className={`atomicity-phase ${actor.phase.toLowerCase()}`}
                >
                  {phases[actor.phase]}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Requested quantity</dt>
                  <dd>{actor.quantity}</dd>
                </div>
                <div>
                  <dt>Stock units already published</dt>
                  <dd>{actor.appliedStockUnits}</dd>
                </div>
                <div>
                  <dt>Captured stock</dt>
                  <dd>{actor.baseRemaining ?? "Not begun"}</dd>
                </div>
                <div>
                  <dt>Captured revision</dt>
                  <dd>{actor.baseRevision ?? "Not begun"}</dd>
                </div>
                <div>
                  <dt>Private remaining proposal</dt>
                  <dd>{actor.workingRemaining ?? "No private workspace"}</dd>
                </div>
                <div>
                  <dt>Stock units prepared privately</dt>
                  <dd>{actor.pendingStockUnits}</dd>
                </div>
                <div>
                  <dt>Private allocation</dt>
                  <dd>
                    {actor.pendingAllocation
                      ? `${actor.pendingAllocation.quantity} units · step ${actor.pendingAllocation.stepId} · not published`
                      : "No private allocation"}
                  </dd>
                </div>
                {actor.failureReason && (
                  <div>
                    <dt>Decision reason</dt>
                    <dd>
                      {reasons[actor.failureReason]} ({actor.failureReason})
                    </dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
      </section>
      <p className="atomicity-boundary">
        COMMITTED means local modeled publication. No durable storage, crash
        recovery, acknowledgement, retry or idempotency is modeled.
      </p>
    </section>
  );
}
