import { lazy, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import type {
  AtomicityDescriptor,
  ReservationDescriptor,
} from "../../api/types";
import { ErrorState, LoadingState } from "../../components/AsyncState";
import { usePanelActive } from "../../components/ModuleShell";
import { ReservationPlayground } from "./ReservationPlayground";
import "./TransactionExperiments.css";

const AtomicityPlayground = lazy(() =>
  import("../atomicity/AtomicityPlayground").then((module) => ({
    default: module.AtomicityPlayground,
  })),
);

/** Named experiments retain independent drafts and results in the same learning module. */
export function TransactionExperiments({
  reservation,
  atomicityAvailable,
}: {
  reservation: ReservationDescriptor;
  atomicityAvailable: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const active = usePanelActive();
  const requested = params.get("experiment");
  const selected =
    requested === null || requested === "reservation"
      ? "reservation"
      : requested === "atomicity"
        ? "atomicity"
        : "unknown";
  const [visited, setVisited] = useState<ReadonlySet<string>>(
    () => new Set(selected === "unknown" ? [] : [selected]),
  );
  if (selected !== "unknown" && !visited.has(selected))
    setVisited(new Set(visited).add(selected));
  const [descriptor, setDescriptor] = useState<AtomicityDescriptor | null>(
    null,
  );
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (
      !active ||
      selected !== "atomicity" ||
      !atomicityAvailable ||
      descriptor ||
      error
    )
      return;
    let mounted = true;
    api
      .atomicityDescriptor()
      .then((value) => {
        if (mounted) setDescriptor(value);
      })
      .catch((cause: unknown) => {
        if (mounted)
          setError(
            cause instanceof Error
              ? cause.message
              : "The atomicity experiment could not load. Try again.",
          );
      });
    return () => {
      mounted = false;
    };
  }, [active, selected, atomicityAvailable, descriptor, error, attempt]);

  function choose(value: "reservation" | "atomicity") {
    if (selected === value) return;
    const next = new URLSearchParams(params);
    if (value === "reservation") next.delete("experiment");
    else next.set("experiment", "atomicity");
    setParams(next);
  }

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
        <div hidden={selected !== "reservation"}>
          <ReservationPlayground descriptor={reservation} />
        </div>
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
          ) : descriptor ? (
            <Suspense
              fallback={
                <LoadingState label="Loading the atomicity workbench" />
              }
            >
              <AtomicityPlayground descriptor={descriptor} />
            </Suspense>
          ) : error ? (
            <ErrorState
              message={error}
              retry={() => {
                setError("");
                setAttempt((value) => value + 1);
              }}
            />
          ) : (
            <LoadingState label="Loading the atomicity experiment" />
          )}
        </div>
      )}
    </div>
  );
}
