import type { AtomicityOutcome, GuidedCheckpoint } from "../../api/types";
import { atomicityKindLabels } from "./AtomicityEvidence";

/** Select exactly one returned outcome; prose and array positions are not identities. */
export function resolveAtomicityCheckpoint(
  outcomes: readonly AtomicityOutcome[],
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
    typeof target.kind !== "string" ||
    !Object.prototype.hasOwnProperty.call(atomicityKindLabels, target.kind)
  )
    return -1;
  const matches = outcomes
    .map((outcome, index) => ({ outcome, index }))
    .filter(({ outcome }) => outcome.stepId === target.stepId);
  return matches.length === 1 && matches[0]!.outcome.kind === target.kind
    ? matches[0]!.index
    : -1;
}
