import { expect, it } from "vitest";
import authored from "../../../../content/topics/transactions-isolation/checkpoints.json";
import type { GuidedCheckpoint } from "../../api/types";
import { result, protectedResult } from "./reservationTestFixtures";
import { resolveReservationCheckpoint } from "./checkpoints";
it("resolves the actual unique returned step and kind for both golden schedules", () => {
  for (const checkpoint of authored as GuidedCheckpoint[]) {
    const run =
      checkpoint.presetId === "unsafe-baseline"
        ? result
        : checkpoint.presetId === "protected-baseline"
          ? protectedResult
          : null;
    if (!run) continue;
    const position = resolveReservationCheckpoint(
      run.outcomes,
      checkpoint.target,
    );
    expect(position).toBeGreaterThanOrEqual(0);
    expect(run.outcomes[position]).toMatchObject({
      stepId: "stepId" in checkpoint.target ? checkpoint.target.stepId : "",
      kind: checkpoint.target.kind,
    });
  }
});
it("does not substitute narration, a different kind, missing or duplicate identity", () => {
  const target: GuidedCheckpoint["target"] = {
    stepId: "attempt-b",
    kind: "RESERVATION_REJECTED",
    occurrence: 1,
  };
  expect(resolveReservationCheckpoint(protectedResult.outcomes, target)).toBe(
    3,
  );
  expect(resolveReservationCheckpoint(result.outcomes, target)).toBe(-1);
  expect(
    resolveReservationCheckpoint(protectedResult.outcomes.slice(0, 3), target),
  ).toBe(-1);
  expect(
    resolveReservationCheckpoint(
      [...protectedResult.outcomes, protectedResult.outcomes[3]!],
      target,
    ),
  ).toBe(-1);
});
it.each([
  null,
  [],
  { stepId: "attempt-b", kind: "RESERVATION_REJECTED", occurrence: 2 },
  { stepId: "attempt-b\n", kind: "RESERVATION_REJECTED", occurrence: 1 },
  { stepId: "attempt-b", kind: "ATTEMPT_RESERVE", occurrence: 1 },
  {
    stepId: "attempt-b",
    kind: "RESERVATION_REJECTED",
    occurrence: 1,
    operationId: "attempt-b",
  },
  { operationId: "attempt-b", kind: "INSERT", occurrence: 1 },
])("rejects unsupported or mixed selector %j", (target) => {
  expect(
    resolveReservationCheckpoint(
      protectedResult.outcomes,
      target as GuidedCheckpoint["target"],
    ),
  ).toBe(-1);
});
