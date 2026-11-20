import { api } from "../../api/client";
import type { GuidedCheckpoint, IdempotencyDescriptor } from "../../api/types";
import { GuidedSimulation } from "../learning/GuidedSimulation";
import { resolveIdempotencyCheckpoint } from "./checkpoints";
import { IdempotencyStateView } from "./IdempotencyStateView";
import { outcomeLabels } from "./idempotencyLabels";
import "./Idempotency.css";

export function IdempotencyGuided({
  checkpoints,
  descriptor,
  contentVersion,
}: {
  checkpoints: GuidedCheckpoint[];
  descriptor: IdempotencyDescriptor;
  contentVersion: string;
}) {
  return (
    <GuidedSimulation
      checkpoints={checkpoints.filter(
        (checkpoint) => checkpoint.simulationId === "idempotency",
      )}
      presets={descriptor.presets}
      topicId="idempotency"
      topicTitle="Idempotency"
      contentVersion={contentVersion}
      modelVersion={descriptor.modelVersion}
      execute={api.runIdempotency}
      resolveTarget={(result, target) =>
        resolveIdempotencyCheckpoint(result.outcomes, target)
      }
      renderEvidence={(run, position) => {
        const outcome = run.result.outcomes[position]!;
        return (
          <section
            className="idem-results"
            aria-label="Java idempotency evidence at this checkpoint"
          >
            <div className="idem-results-heading">
              <h3>Java evidence at this checkpoint</h3>
              <span className="idem-version">
                Model {run.result.modelVersion} · Virtual time
              </span>
            </div>
            <p className="idem-muted">
              Only the selected post-step snapshot is shown. Later effects,
              later responses and whole-run metrics are outside this evidence.
            </p>
            <section
              className="idem-event"
              aria-label="Selected idempotency checkpoint step"
            >
              <p className="eyebrow">
                Step {outcome.sequence} · {outcome.timeMs} ms · {outcome.stepId}
              </p>
              <h4>{outcomeLabels[outcome.kind]}</h4>
              <p>{outcome.explanation}</p>
              <p className="idem-muted">
                Call {outcome.callId} · action {outcome.action} · {outcome.kind}
              </p>
            </section>
            <IdempotencyStateView
              state={outcome.postState}
              input={run.input}
              selectedCallId={outcome.callId}
            />
            <p className="idem-boundary">
              A public effect, a retained server receipt and a caller's
              observation are separate facts. These logical snapshots do not
              establish physical durability or an external provider's
              guarantees.
            </p>
          </section>
        );
      }}
    />
  );
}
