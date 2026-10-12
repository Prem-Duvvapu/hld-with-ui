import { api } from "../../api/client";
import type { CacheAsideDescriptor, GuidedCheckpoint } from "../../api/types";
import { GuidedSimulation } from "../learning/GuidedSimulation";
import { CachePlayback } from "./CachePlayback";
import { orderedEvents } from "./cacheState";
import { resolveCheckpoint } from "./checkpoints";

/** Cache adapter: only Java execution, concrete event resolution and evidence rendering. */
export function GuidedCheckpoints({
  checkpoints,
  descriptor,
  topicId = descriptor.id,
  contentVersion = "1.0.0",
}: {
  checkpoints: GuidedCheckpoint[];
  descriptor: CacheAsideDescriptor;
  topicId?: string;
  contentVersion?: string;
}) {
  return (
    <GuidedSimulation
      checkpoints={checkpoints}
      presets={descriptor.presets}
      topicId={topicId}
      topicTitle={descriptor.title}
      contentVersion={contentVersion}
      modelVersion={descriptor.modelVersion}
      execute={api.runCacheAside}
      resolveTarget={(result, target) =>
        resolveCheckpoint(orderedEvents(result.events), target)
      }
      renderEvidence={(run, position, id) => (
        <CachePlayback
          key={id}
          result={run.result}
          input={run.input}
          initialPosition={position}
          showTrace={false}
          title="Java trace at this checkpoint"
        />
      )}
    />
  );
}
