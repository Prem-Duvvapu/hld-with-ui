import type { GuidedCheckpoint, QueueCapacityEvent } from "../../api/types";
/** Select an authoritative transition by stable job identity, event kind and occurrence. */
export function resolveQueueCheckpoint(
  events: readonly QueueCapacityEvent[],
  target: GuidedCheckpoint["target"],
): number {
  if (
    !target ||
    typeof target !== "object" ||
    !("jobId" in target) ||
    "operation" in target ||
    "messageId" in target ||
    "attemptId" in target
  )
    return -1;
  let occurrence = 0;
  for (let index = 0; index < events.length; index++) {
    const event = events[index]!;
    if (event.jobId !== target.jobId || event.kind !== target.kind) continue;
    if (++occurrence === target.occurrence) return index;
  }
  return -1;
}
