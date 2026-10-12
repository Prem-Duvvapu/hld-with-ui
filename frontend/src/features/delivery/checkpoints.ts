import type { DeliveryEvent, GuidedCheckpoint } from "../../api/types";
/** Locate only a returned semantic message/attempt transition; narration and positions are not identities. */
export function resolveDeliveryCheckpoint(
  events: readonly DeliveryEvent[],
  target: GuidedCheckpoint["target"],
): number {
  if (
    !target ||
    typeof target !== "object" ||
    Array.isArray(target) ||
    !("messageId" in target) ||
    !("attemptId" in target) ||
    "operation" in target ||
    "jobId" in target ||
    typeof target.messageId !== "string" ||
    typeof target.attemptId !== "string" ||
    typeof target.kind !== "string" ||
    !Number.isSafeInteger(target.occurrence) ||
    target.occurrence < 1 ||
    target.occurrence > 10000
  )
    return -1;
  let occurrence = 0;
  for (let index = 0; index < events.length; index++) {
    const event = events[index]!;
    if (
      event.messageId !== target.messageId ||
      event.attemptId !== target.attemptId ||
      event.kind !== target.kind
    )
      continue;
    if (++occurrence === target.occurrence) return index;
  }
  return -1;
}
