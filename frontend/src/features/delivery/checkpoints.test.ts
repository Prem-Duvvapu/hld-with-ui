import { expect, it } from "vitest";
import type { GuidedCheckpoint } from "../../api/types";
import { resolveDeliveryCheckpoint } from "./checkpoints";
import { baselineResult } from "./deliveryTestFixtures";
it("selects the actual message/attempt pair and kind independently of narration", () => {
  const target: GuidedCheckpoint["target"] = {
    messageId: "m1",
    attemptId: "m1-a1",
    kind: "effect.committed",
    occurrence: 1,
  };
  const position = resolveDeliveryCheckpoint(baselineResult.events, target);
  expect(baselineResult.events[position]).toMatchObject({
    messageId: "m1",
    attemptId: "m1-a1",
    kind: "effect.committed",
    timeMs: 50,
  });
  expect(
    resolveDeliveryCheckpoint(
      baselineResult.events.map((event) => ({
        ...event,
        message: "Different explanation.",
      })),
      target,
    ),
  ).toBe(position);
});
it("distinguishes repeated occurrences and refuses mismatched identities, missing targets and another model's selector", () => {
  const target: GuidedCheckpoint["target"] = {
    messageId: "m1",
    attemptId: "m1-a1",
    kind: "effect.committed",
    occurrence: 2,
  };
  expect(
    resolveDeliveryCheckpoint(
      [...baselineResult.events, baselineResult.events[2]!],
      target,
    ),
  ).toBe(baselineResult.events.length);
  for (const invalid of [
    target,
    { ...target, occurrence: 1, messageId: "m2" },
    { ...target, occurrence: 1, attemptId: "m1-a2" },
    { jobId: "m1", kind: "effect.committed", occurrence: 1 },
    { operation: 1, kind: "effect.committed", occurrence: 1 },
    { ...target, occurrence: 1, operation: 1 },
  ] as GuidedCheckpoint["target"][])
    expect(resolveDeliveryCheckpoint(baselineResult.events, invalid)).toBe(-1);
});

it("keeps malformed wire selectors unavailable instead of throwing or accepting unsafe occurrences", () => {
  const target = {
    messageId: "m1",
    attemptId: "m1-a1",
    kind: "effect.committed",
    occurrence: 1,
  };
  for (const invalid of [
    null,
    true,
    "target",
    [],
    {},
    { ...target, messageId: null },
    { ...target, attemptId: null },
    { ...target, occurrence: 0 },
    { ...target, occurrence: 1.5 },
    { ...target, occurrence: NaN },
    { ...target, occurrence: Infinity },
    { ...target, occurrence: 10001 },
  ])
    expect(
      resolveDeliveryCheckpoint(
        baselineResult.events,
        invalid as unknown as GuidedCheckpoint["target"],
      ),
    ).toBe(-1);
});

it("refuses a data-access identity mixed into a matching delivery pair", () => {
  const legacy: GuidedCheckpoint["target"] = {
    messageId: "m1",
    attemptId: "m1-a1",
    kind: "effect.committed",
    occurrence: 1,
  };
  expect(
    resolveDeliveryCheckpoint(baselineResult.events, legacy),
  ).toBeGreaterThanOrEqual(0);
  for (const operationId of ["q1", null])
    expect(
      resolveDeliveryCheckpoint(baselineResult.events, {
        ...legacy,
        operationId,
      } as GuidedCheckpoint["target"]),
    ).toBe(-1);
});
