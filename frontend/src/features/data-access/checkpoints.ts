import type { DataAccessOutcome, GuidedCheckpoint } from "../../api/types";
/** Resolve a unique authored operation identity against returned Java outcomes. */
export function resolveDataAccessCheckpoint(
  outcomes: readonly DataAccessOutcome[],
  target: GuidedCheckpoint["target"],
): number {
  if (
    !target ||
    typeof target !== "object" ||
    Array.isArray(target) ||
    !("operationId" in target) ||
    Object.keys(target).sort().join(",") !== "kind,occurrence,operationId" ||
    typeof target.operationId !== "string" ||
    !/^[a-z][a-z0-9-]{0,31}$/.test(target.operationId) ||
    /\s/.test(target.operationId) ||
    target.occurrence !== 1 ||
    !["LOOKUP_ID", "TENANT_RANGE", "ALL_RANGE", "INSERT"].includes(target.kind)
  )
    return -1;
  const matches = outcomes
    .map((outcome, index) => ({ outcome, index }))
    .filter(({ outcome }) => outcome.operationId === target.operationId);
  return matches.length === 1 && matches[0]!.outcome.kind === target.kind
    ? matches[0]!.index
    : -1;
}
