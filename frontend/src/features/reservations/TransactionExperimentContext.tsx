import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import type { AtomicityDescriptor, GuidedCheckpoint } from "../../api/types";

type Experiment = "reservation" | "atomicity";
type Context = {
  selected: Experiment | "unknown";
  choose: (experiment: Experiment) => void;
  atomicityAvailable: boolean;
  descriptor: AtomicityDescriptor | null;
  error: string;
  retry: () => void;
};
const TransactionContext = createContext<Context | null>(null);

/** One topic owns the lazy descriptor; each view owns its independent model session. */
export function TransactionExperimentProvider({
  atomicityAvailable,
  checkpoints,
  children,
}: {
  atomicityAvailable: boolean;
  checkpoints: GuidedCheckpoint[];
  children: ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("experiment");
  const view = params.get("view") ?? "playground";
  const checkpoint = checkpoints.find(
    (item) => item.id === params.get("checkpoint"),
  );
  const checkpointExperiment =
    checkpoint?.simulationId === "transaction-atomicity"
      ? "atomicity"
      : checkpoint?.simulationId === "transactions-isolation"
        ? "reservation"
        : null;
  const knownChoice =
    requested === null ||
    requested === "reservation" ||
    requested === "atomicity";
  const selected = knownChoice
    ? view === "guided" && checkpointExperiment
      ? checkpointExperiment
      : requested === "atomicity"
        ? "atomicity"
        : "reservation"
    : "unknown";
  const remembered = useRef<Partial<Record<Experiment, string>>>({});
  useEffect(() => {
    if (checkpointExperiment && checkpoint)
      remembered.current[checkpointExperiment] = checkpoint.id;
  }, [checkpointExperiment, checkpoint]);
  // Saved-answer resume links identify an authored checkpoint, not a model implementation.
  useEffect(() => {
    if (!knownChoice || view !== "guided" || !checkpointExperiment) return;
    if (
      (checkpointExperiment === "atomicity" && requested === "atomicity") ||
      (checkpointExperiment === "reservation" && requested !== "atomicity")
    )
      return;
    const next = new URLSearchParams(params);
    if (checkpointExperiment === "atomicity")
      next.set("experiment", "atomicity");
    else next.delete("experiment");
    setParams(next, { replace: true });
  }, [checkpointExperiment, knownChoice, params, requested, setParams, view]);

  const [descriptor, setDescriptor] = useState<AtomicityDescriptor | null>(
    null,
  );
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const needsDescriptor =
    selected === "atomicity" &&
    atomicityAvailable &&
    (view === "playground" || view === "guided");
  useEffect(() => {
    if (!needsDescriptor || descriptor || error || inFlight.current) return;
    inFlight.current = true;
    api
      .atomicityDescriptor()
      .then((value) => {
        if (mounted.current) setDescriptor(value);
      })
      .catch((cause: unknown) => {
        if (mounted.current)
          setError(
            cause instanceof Error
              ? cause.message
              : "The atomicity experiment could not load. Try again.",
          );
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [needsDescriptor, descriptor, error, attempt]);

  function choose(experiment: Experiment) {
    if (experiment === selected) return;
    const next = new URLSearchParams(params);
    if (experiment === "reservation") next.delete("experiment");
    else next.set("experiment", "atomicity");
    // A checkpoint belongs to one experiment; restore only that sibling's authored selection.
    if (view === "guided" && remembered.current[experiment])
      next.set("checkpoint", remembered.current[experiment]!);
    else next.delete("checkpoint");
    setParams(next);
  }
  return (
    <TransactionContext.Provider
      value={{
        selected,
        choose,
        atomicityAvailable,
        descriptor,
        error,
        retry: () => {
          setError("");
          setAttempt((value) => value + 1);
        },
      }}
    >
      {children}
    </TransactionContext.Provider>
  );
}
export function useTransactionExperiment() {
  const context = useContext(TransactionContext);
  if (!context)
    throw new Error("Transaction experiments require their topic provider.");
  return context;
}
