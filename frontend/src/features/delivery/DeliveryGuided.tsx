import { api } from "../../api/client";
import type { DeliveryDescriptor, GuidedCheckpoint } from "../../api/types";
import { GuidedSimulation } from "../learning/GuidedSimulation";
import { DeliveryPlayback } from "./DeliveryPlayback";
import { resolveDeliveryCheckpoint } from "./checkpoints";
/** Java execution and authoritative trace projection over the shared saved-answer flow. */
export function DeliveryGuided({
  checkpoints,
  descriptor,
  contentVersion,
}: {
  checkpoints: GuidedCheckpoint[];
  descriptor: DeliveryDescriptor;
  contentVersion: string;
}) {
  return (
    <GuidedSimulation
      checkpoints={checkpoints}
      presets={descriptor.presets}
      topicId={descriptor.id}
      topicTitle={descriptor.title}
      contentVersion={contentVersion}
      modelVersion={descriptor.modelVersion}
      execute={api.runDelivery}
      resolveTarget={(result, target) =>
        resolveDeliveryCheckpoint(result.events, target)
      }
      renderEvidence={(run, position, id) => (
        <>
          {run.result.status === "limited" && (
            <p className="delivery-notice" role="status">
              Partial Java trace: observation stops at{" "}
              {run.result.lastVirtualTimeMs} ms, with{" "}
              {run.result.metrics.runningEffects} running effects and{" "}
              {run.result.metrics.pendingAcknowledgments} pending ACKs.
              Scheduled work is unobserved; this prefix does not prove permanent
              loss.
            </p>
          )}
          <DeliveryPlayback
            key={id}
            result={run.result}
            initialPosition={position}
            title="Java trace at this checkpoint"
            showTrace={false}
          />
        </>
      )}
    />
  );
}
