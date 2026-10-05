import type { CacheAsideEvent, GuidedCheckpoint } from "../../api/types";

/**
 * Position of a checkpoint's target in sequence-ordered events: the
 * occurrence-th event of the target kind for the target operation. Returns -1
 * when the trace has no such event. Narration and array indexes are never
 * used as identifiers.
 */
export function resolveCheckpoint(
  events: readonly CacheAsideEvent[],
  target: GuidedCheckpoint["target"],
): number {
  let seen = 0;
  for (let index = 0; index < events.length; index++) {
    const event = events[index]!;
    if (event.operation !== target.operation || event.kind !== target.kind)
      continue;
    seen++;
    if (seen === target.occurrence) return index;
  }
  return -1;
}
