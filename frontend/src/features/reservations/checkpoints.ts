import type { GuidedCheckpoint, ReservationOutcome } from "../../api/types";
/** Select one returned Java outcome by its actual step identity and kind. */
export function resolveReservationCheckpoint(
  outcomes: readonly ReservationOutcome[],
  target: GuidedCheckpoint["target"],
): number {
  if (
    !target ||
    typeof target !== "object" ||
    Array.isArray(target) ||
    !("stepId" in target) ||
    Object.keys(target).sort().join(",") !== "kind,occurrence,stepId" ||
    typeof target.stepId !== "string" ||
    !/^[a-z][a-z0-9-]{0,31}$/.test(target.stepId) ||
    /\s/.test(target.stepId) ||
    target.occurrence !== 1 ||
    !["READ_OBSERVED", "RESERVATION_ACCEPTED", "RESERVATION_REJECTED"].includes(
      target.kind,
    )
  )
    return -1;
  const matches = outcomes
    .map((outcome, index) => ({ outcome, index }))
    .filter(({ outcome }) => outcome.stepId === target.stepId);
  return matches.length === 1 && matches[0]!.outcome.kind === target.kind
    ? matches[0]!.index
    : -1;
}
