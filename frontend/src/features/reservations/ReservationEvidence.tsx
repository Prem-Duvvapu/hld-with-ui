import type {
  ReservationInput,
  ReservationState,
  ReservationOutcome,
} from "../../api/types";
const statuses = {
  NOT_READ: "Not read yet",
  READ_OBSERVED: "Read observed",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
};
export function ReservationEvidence({
  input,
  state,
  outcome,
}: {
  input: ReservationInput;
  state: ReservationState;
  outcome?: ReservationOutcome;
}) {
  return (
    <section
      aria-label="Selected reservation snapshot"
      className="reservation-snapshot"
    >
      <article
        aria-label={
          outcome ? `Evidence for ${outcome.stepId}` : "Initial state"
        }
      >
        <p className="eyebrow">2 · Inspect one step</p>
        <h3>
          {outcome ? `${outcome.sequence}. ${outcome.stepId}` : "Initial state"}
        </h3>
        <p>
          {outcome?.explanation ??
            "No reservation has read or attempted yet. This is the Java-reported starting state."}
        </p>
        {outcome?.action === "ATTEMPT_RESERVE" && (
          <div
            className={`reservation-decision ${outcome.kind === "RESERVATION_REJECTED" ? "rejected" : ""}`}
          >
            <strong>
              {outcome.kind === "RESERVATION_ACCEPTED"
                ? "Reservation accepted"
                : "Reservation rejected"}
            </strong>
            <p>
              Checked {outcome.checkedRemaining} units from{" "}
              {outcome.checkSource === "CURRENT"
                ? "current shared stock"
                : "the earlier read"}{" "}
              for a quantity of {outcome.quantity}.
            </p>
            {outcome.rejectionReason && (
              <p>Reason: insufficient stock at the selected check.</p>
            )}
          </div>
        )}
      </article>
      <dl
        className="reservation-counts"
        aria-label="Shared inventory at this snapshot"
      >
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
          <dt>Initial stock</dt>
          <dd>{input.initialUnits}</dd>
        </div>
      </dl>
      <ul className="reservation-actors" aria-label="Reservation observations">
        {state.reservations.map((actor) => (
          <li
            key={actor.id}
            aria-label={`Reservation ${actor.id}`}
            className={outcome?.reservationId === actor.id ? "active" : ""}
          >
            <div>
              <strong>{actor.id}</strong>
              <span
                className={`reservation-status ${actor.status.toLowerCase()}`}
              >
                {statuses[actor.status]}
              </span>
            </div>
            <dl>
              <div>
                <dt>Requested quantity</dt>
                <dd>{actor.quantity}</dd>
              </div>
              <div>
                <dt>Earlier observed stock</dt>
                <dd>
                  {actor.observedRemaining === undefined
                    ? "Not read yet"
                    : actor.observedRemaining}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      <dl
        className="reservation-invariants"
        aria-label="Invariant checks at this snapshot"
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
        ].map(([label, passed]) => (
          <div key={String(label)} className={passed ? "passed" : "failed"}>
            <dt>{label}</dt>
            <dd>{passed ? "Preserved" : "Violated"}</dd>
          </div>
        ))}
      </dl>
      <section
        aria-label="Allocations at this snapshot"
        className="reservation-allocations"
      >
        <h4>Accepted allocations</h4>
        {state.allocations.length ? (
          <ul>
            {state.allocations.map((allocation) => (
              <li key={allocation.reservationId}>
                <strong>{allocation.reservationId}</strong> ·{" "}
                {allocation.quantity} units · step{" "}
                <code>{allocation.stepId}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p>No allocations at this snapshot.</p>
        )}
      </section>
    </section>
  );
}
