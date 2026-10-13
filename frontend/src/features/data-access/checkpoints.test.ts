import { expect, it } from "vitest";
import type { GuidedCheckpoint } from "../../api/types";
import { result } from "./dataAccessTestFixtures";
import { resolveDataAccessCheckpoint } from "./checkpoints";
const target = {
  operationId: "q1",
  kind: "TENANT_RANGE",
  occurrence: 1,
} as GuidedCheckpoint["target"];
it("finds the returned stable identity and kind independent of explanation or array position", () => {
  const other = { ...result.outcomes[0]!, operationId: "other" };
  expect(resolveDataAccessCheckpoint(result.outcomes, target)).toBe(0);
  expect(
    resolveDataAccessCheckpoint(
      [other, { ...result.outcomes[0]!, explanation: "Rewritten narration" }],
      target,
    ),
  ).toBe(1);
});
it("refuses malformed, mixed, unsupported, repeated and unavailable semantic targets", () => {
  for (const invalid of [
    null,
    [],
    true,
    "target",
    {},
    { ...target, operationId: "missing" },
    { ...target, kind: "INSERT" },
    { ...target, operationId: "q1\n" },
    { ...target, operationId: "Q1" },
    { ...target, operationId: "a".repeat(33) },
    { ...target, occurrence: 0 },
    { ...target, occurrence: 2 },
    { ...target, occurrence: "1" },
    { ...target, operation: 1 },
    { ...target, jobId: "q1" },
    { ...target, messageId: "m1", attemptId: "m1-a1" },
    { ...target, extra: true },
    { operation: 1, kind: "cache.hit", occurrence: 1 },
    { jobId: "q1", kind: "job.started", occurrence: 1 },
  ])
    expect(
      resolveDataAccessCheckpoint(
        result.outcomes,
        invalid as unknown as GuidedCheckpoint["target"],
      ),
    ).toBe(-1);
  expect(
    resolveDataAccessCheckpoint(
      [result.outcomes[0]!, result.outcomes[0]!],
      target,
    ),
  ).toBe(-1);
  expect(
    resolveDataAccessCheckpoint(
      [result.outcomes[0]!, { ...result.outcomes[0]!, kind: "INSERT" }],
      target,
    ),
  ).toBe(-1);
});
