import { expect, it } from "vitest";
import type { GuidedCheckpoint } from "../../api/types";
import { pairs } from "../../api/idempotencyTestFixtures";
import { resolveIdempotencyCheckpoint } from "./checkpoints";
import { outcomeLabels } from "./idempotencyLabels";

it("selects all sixteen kinds in actual Java evidence by unique step identity despite reordering or narration changes", () => {
  const kinds = new Set<string>();
  for (const { result } of pairs) {
    for (const outcome of result.outcomes) {
      kinds.add(outcome.kind);
      const target = {
        stepId: outcome.stepId,
        kind: outcome.kind,
        occurrence: 1,
      } as GuidedCheckpoint["target"];
      const evidence = [...result.outcomes].reverse().map((item) => ({
        ...item,
        explanation: "Narration does not identify this step.",
      }));
      const position = resolveIdempotencyCheckpoint(evidence, target);
      expect(position).toBeGreaterThanOrEqual(0);
      expect(evidence[position]!.stepId).toBe(outcome.stepId);
      expect(evidence[position]!.kind).toBe(outcome.kind);
    }
  }
  expect([...kinds].sort()).toEqual(Object.keys(outcomeLabels).sort());
  expect(kinds.size).toBe(16);
});
it("rejects missing and duplicated steps and mismatched returned kinds", () => {
  const outcomes = pairs[0]!.result.outcomes;
  const outcome = outcomes.find((item) => item.kind === "RESPONSE_LOST")!;
  const target = {
    stepId: outcome.stepId,
    kind: outcome.kind,
    occurrence: 1,
  } as GuidedCheckpoint["target"];
  expect(resolveIdempotencyCheckpoint([], target)).toBe(-1);
  expect(
    resolveIdempotencyCheckpoint(
      outcomes.filter((item) => item !== outcome),
      target,
    ),
  ).toBe(-1);
  expect(resolveIdempotencyCheckpoint([...outcomes, outcome], target)).toBe(-1);
  expect(
    resolveIdempotencyCheckpoint(outcomes, {
      ...target,
      kind: "ATOMIC_COMMITTED",
    } as GuidedCheckpoint["target"]),
  ).toBe(-1);
});
it.each([
  null,
  [],
  true,
  "lost-a",
  {},
  { stepId: "lost-a", kind: "RESPONSE_LOST", occurrence: 2 },
  { stepId: "lost-a", kind: "RESPONSE_LOST", occurrence: 0 },
  { stepId: "lost-a", kind: "RESPONSE_LOST", occurrence: 1.5 },
  { stepId: "lost-a", kind: "RESPONSE_LOST", occurrence: "1" },
  { stepId: null, kind: "RESPONSE_LOST", occurrence: 1 },
  { stepId: "lost-a\n", kind: "RESPONSE_LOST", occurrence: 1 },
  { stepId: "s".repeat(33), kind: "RESPONSE_LOST", occurrence: 1 },
  { stepId: "lost-a", kind: "UNKNOWN", occurrence: 1 },
  { stepId: "lost-a", kind: "toString", occurrence: 1 },
  { stepId: "lost-a", kind: "READ_OBSERVED", occurrence: 1 },
  { stepId: "lost-a", kind: "TRANSACTION_ABORTED", occurrence: 1 },
  { stepId: "lost-a", kind: "REQUEST_FAILED", occurrence: 1 },
  { stepId: "lost-a", kind: "RESPONSE_LOST" },
  ...[
    "operation",
    "jobId",
    "messageId",
    "attemptId",
    "operationId",
    "requestId",
    "callId",
    "eventId",
    "unknown",
  ].map((field) => ({
    stepId: "lost-a",
    kind: "RESPONSE_LOST",
    occurrence: 1,
    [field]: null,
  })),
])("rejects malformed or other-family targets %j", (target) => {
  expect(
    resolveIdempotencyCheckpoint(
      pairs[0]!.result.outcomes,
      target as GuidedCheckpoint["target"],
    ),
  ).toBe(-1);
});
