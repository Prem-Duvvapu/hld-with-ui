import { api } from "../../api/client";
import type { AtomicityDescriptor, GuidedCheckpoint } from "../../api/types";
import { GuidedSimulation } from "../learning/GuidedSimulation";
import { AtomicityEvidence } from "./AtomicityEvidence";
import { resolveAtomicityCheckpoint } from "./checkpoints";
import "./Atomicity.css";

export function AtomicityGuided({
  checkpoints,
  descriptor,
  contentVersion,
}: {
  checkpoints: GuidedCheckpoint[];
  descriptor: AtomicityDescriptor;
  contentVersion: string;
}) {
  return (
    <GuidedSimulation
      checkpoints={checkpoints.filter(
        (checkpoint) => checkpoint.simulationId === "transaction-atomicity",
      )}
      presets={descriptor.presets}
      topicId="transactions-isolation"
      topicTitle="Transactions & Isolation"
      contentVersion={contentVersion}
      modelVersion={descriptor.modelVersion}
      execute={api.runAtomicity}
      resolveTarget={(result, target) =>
        resolveAtomicityCheckpoint(result.outcomes, target)
      }
      renderEvidence={(run, position) => {
        const outcome = run.result.outcomes[position]!;
        return (
          <section
            className="atomicity-results"
            aria-label="Java atomicity at this checkpoint"
          >
            <div className="atomicity-results-heading">
              <h3>Java evidence at this checkpoint</h3>
              <span className="atomicity-version">
                Model {run.result.modelVersion} · Logical steps
              </span>
            </div>
            <p className="atomicity-muted">
              Selected post-step state from the submitted schedule. Published
              state and private work are shown separately. Later steps and whole
              experiment metrics are outside this snapshot.
            </p>
            <AtomicityEvidence
              input={run.input}
              state={outcome.postState}
              outcome={outcome}
            />
          </section>
        );
      }}
    />
  );
}
