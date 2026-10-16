import { expect, it } from "vitest";
import type { GuidedCheckpoint } from "../../api/types";
import {
  result,
  protectedResult,
  conflictResult,
} from "./atomicityTestFixtures";
import { resolveAtomicityCheckpoint } from "./checkpoints";

it("selects an actual unique Java step and kind, never a fixed index or explanation", () => {
  for (const run of [result, protectedResult, conflictResult]) {
    for (const outcome of run.outcomes) {
      const target = {
        stepId: outcome.stepId,
        kind: outcome.kind,
        occurrence: 1,
      } as GuidedCheckpoint["target"];
      const reordered = [...run.outcomes].reverse();
      const position = resolveAtomicityCheckpoint(reordered, target);
      expect(reordered[position]).toBe(outcome);
    }
  }
});
it("rejects kind mismatch, missing steps and duplicate step identities", () => {
  const target = {
    stepId: "abort-a",
    kind: "TRANSACTION_ABORTED",
    occurrence: 1,
  } as GuidedCheckpoint["target"];
  expect(resolveAtomicityCheckpoint(result.outcomes, target)).toBe(2);
  expect(resolveAtomicityCheckpoint(result.outcomes.slice(0, 2), target)).toBe(
    -1,
  );
  expect(
    resolveAtomicityCheckpoint(
      [...result.outcomes, result.outcomes[2]!],
      target,
    ),
  ).toBe(-1);
  expect(
    resolveAtomicityCheckpoint(result.outcomes, {
      ...target,
      kind: "TRANSACTION_COMMITTED",
    } as GuidedCheckpoint["target"]),
  ).toBe(-1);
});
it.each([
  null,
  [],
  { stepId: "abort-a", kind: "TRANSACTION_ABORTED", occurrence: 2 },
  { stepId: "abort-a\n", kind: "TRANSACTION_ABORTED", occurrence: 1 },
  { stepId: "abort-a", kind: "RESERVATION_REJECTED", occurrence: 1 },
  { stepId: "abort-a", kind: "toString", occurrence: 1 },
  {
    stepId: "abort-a",
    kind: "TRANSACTION_ABORTED",
    occurrence: 1,
    eventId: "abort-a",
  },
  { operationId: "abort-a", kind: "TRANSACTION_ABORTED", occurrence: 1 },
])("rejects malformed or other-family target %j", (target) => {
  expect(
    resolveAtomicityCheckpoint(
      result.outcomes,
      target as GuidedCheckpoint["target"],
    ),
  ).toBe(-1);
});
