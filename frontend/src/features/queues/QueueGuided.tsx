import { api } from "../../api/client";
import type {
  GuidedCheckpoint,
  QueueCapacityDescriptor,
} from "../../api/types";
import { GuidedSimulation } from "../learning/GuidedSimulation";
import { QueuePlayback } from "./QueuePlayback";
import { resolveQueueCheckpoint } from "./checkpoints";
/** Queue adapter over Java-owned snapshots; it does not simulate or infer transitions. */
export function QueueGuided({
  checkpoints,
  descriptor,
  topicId = descriptor.id,
  contentVersion,
}: {
  checkpoints: GuidedCheckpoint[];
  descriptor: QueueCapacityDescriptor;
  topicId?: string;
  contentVersion: string;
}) {
  return (
    <GuidedSimulation
      checkpoints={checkpoints}
      presets={descriptor.presets}
      topicId={topicId}
      topicTitle={descriptor.title}
      contentVersion={contentVersion}
      modelVersion={descriptor.modelVersion}
      execute={api.runQueue}
      resolveTarget={(result, target) =>
        resolveQueueCheckpoint(result.events, target)
      }
      renderEvidence={(run, position, id) => (
        <>
          {run.result.status === "limited" && (
            <p className="queue-notice" role="status">
              Partial Java trace: the observation stops at{" "}
              {run.result.lastVirtualTimeMs} ms, with{" "}
              {run.result.metrics.queued} queued, {run.result.metrics.running}{" "}
              running and {run.result.metrics.notArrived} not-arrived jobs.
              Scheduled completions are not observed completions.
            </p>
          )}
          <QueuePlayback
            key={id}
            result={run.result}
            input={run.input}
            initialPosition={position}
            showTrace={false}
            title="Java trace at this checkpoint"
          />
        </>
      )}
    />
  );
}
