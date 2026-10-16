import { lazy, Suspense, useState, type ReactNode } from "react";
import type { ReservationDescriptor } from "../../api/types";
import { ErrorState, LoadingState } from "../../components/AsyncState";
import { ReservationPlayground } from "./ReservationPlayground";
import { useTransactionExperiment } from "./TransactionExperimentContext";
import "./TransactionExperiments.css";
const AtomicityPlayground = lazy(() =>
  import("../atomicity/AtomicityPlayground").then((module) => ({
    default: module.AtomicityPlayground,
  })),
);

/** Named experiments retain independent drafts and results in the same learning module. */
export function TransactionExperiments({
  reservation,
}: {
  reservation: ReservationDescriptor;
}) {
  const { descriptor, error, retry } = useTransactionExperiment();
  return (
    <TransactionExperimentView
      reservation={<ReservationPlayground descriptor={reservation} />}
      atomicity={
        descriptor ? (
          <Suspense
            fallback={<LoadingState label="Loading the atomicity workbench" />}
          >
            <AtomicityPlayground descriptor={descriptor} />
          </Suspense>
        ) : error ? (
          <ErrorState message={error} retry={retry} />
        ) : (
          <LoadingState label="Loading the atomicity experiment" />
        )
      }
    />
  );
}

/** Keep each visited sibling mounted: models may share preset names, never run caches. */
export function TransactionExperimentView({
  reservation,
  atomicity,
}: {
  reservation: ReactNode;
  atomicity: ReactNode;
}) {
  const { selected, choose, atomicityAvailable } = useTransactionExperiment();
  const [visited, setVisited] = useState<ReadonlySet<string>>(
    () => new Set(selected === "unknown" ? [] : [selected]),
  );
  if (selected !== "unknown" && !visited.has(selected))
    setVisited(new Set(visited).add(selected));
  return (
    <div className="transaction-experiments">
      <section
        className="transaction-chooser"
        aria-label="Choose a transaction experiment"
      >
        <div>
          <p className="eyebrow">One topic · two questions</p>
          <h2>Choose the boundary to explore</h2>
          <p>
            Compare a stale reservation decision, or inspect related writes that
            commit or abort.
          </p>
        </div>
        <div
          className="transaction-choices"
          role="group"
          aria-label="Transaction experiments"
        >
          <button
            aria-pressed={selected === "reservation"}
            onClick={() => choose("reservation")}
          >
            <strong>Reservation race</strong>
            <span>Can two readers reserve the same unit?</span>
          </button>
          <button
            aria-pressed={selected === "atomicity"}
            onClick={() => choose("atomicity")}
          >
            <strong>Atomicity &amp; abort</strong>
            <span>
              {atomicityAvailable
                ? "What remains when related writes stop?"
                : "Unavailable in this backend"}
            </span>
          </button>
        </div>
      </section>
      {selected === "unknown" && (
        <div role="alert" className="transaction-unavailable">
          <h3>This experiment is unavailable</h3>
          <p>
            Choose Reservation race or Atomicity &amp; abort above. No
            experiment has run.
          </p>
        </div>
      )}
      {visited.has("reservation") && (
        <div hidden={selected !== "reservation"}>{reservation}</div>
      )}
      {visited.has("atomicity") && (
        <div hidden={selected !== "atomicity"}>
          {!atomicityAvailable ? (
            <div role="alert" className="transaction-unavailable">
              <h3>Atomicity is unavailable in this backend</h3>
              <p>
                This draft does not advertise the atomicity experiment. Update
                the frontend and backend together, or choose Reservation race.
              </p>
            </div>
          ) : (
            atomicity
          )}
        </div>
      )}
    </div>
  );
}
