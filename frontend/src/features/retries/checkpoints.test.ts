import { expect, it } from "vitest";
import type { GuidedCheckpoint } from "../../api/types";
import {
  result,
  backoffResult,
  deadlineResult,
  jitterResult,
} from "../../api/retryTestFixtures";
import { resolveRetryCheckpoint } from "./checkpoints";

it("resolves every actual Java event by request, optional attempt, kind and occurrence", () => {
  for (const run of [result, backoffResult, deadlineResult, jitterResult]) {
    const occurrences = new Map<string, number>();
    for (const [index, event] of run.events.entries()) {
      const key = `${event.requestId}/${event.attemptId ?? ""}/${event.kind}`;
      const occurrence = (occurrences.get(key) ?? 0) + 1;
      occurrences.set(key, occurrence);
      const target = {
        requestId: event.requestId,
        ...(event.attemptId === undefined
          ? {}
          : { attemptId: event.attemptId }),
        kind: event.kind,
        occurrence,
      } as GuidedCheckpoint["target"];
      expect(resolveRetryCheckpoint(run.events, target)).toBe(index);
    }
  }
});
it("follows actual event identities after reordering and ignores narration", () => {
  const target = {
    requestId: "a",
    attemptId: "a-a1",
    kind: "ATTEMPT_TIMED_OUT",
    occurrence: 1,
  } as GuidedCheckpoint["target"];
  const reversed = [...result.events]
    .reverse()
    .map((event) => ({ ...event, explanation: "Unrelated narration" }));
  const position = resolveRetryCheckpoint(reversed, target);
  expect(reversed[position]?.kind).toBe("ATTEMPT_TIMED_OUT");
  expect(reversed[position]?.attemptId).toBe("a-a1");
  expect(position).not.toBe(resolveRetryCheckpoint(result.events, target));
});
it("counts only matching actual events and rejects missing occurrences without fabricating evidence", () => {
  const event = result.events.find((item) => item.kind === "WORK_COMPLETED")!;
  const events = [
    event,
    ...result.events.filter((item) => item.kind !== "WORK_COMPLETED"),
    event,
  ];
  const target = {
    requestId: event.requestId,
    attemptId: event.attemptId!,
    kind: "WORK_COMPLETED" as const,
    occurrence: 2,
  };
  expect(resolveRetryCheckpoint(events, target)).toBe(events.length - 1);
  expect(resolveRetryCheckpoint(events, { ...target, occurrence: 3 })).toBe(-1);
  expect(resolveRetryCheckpoint([], target)).toBe(-1);
});
it.each([
  null,
  [],
  false,
  {},
  { requestId: "a", kind: "REQUEST_ARRIVED", occurrence: 0 },
  { requestId: "a", kind: "REQUEST_ARRIVED", occurrence: 385 },
  { requestId: "a", kind: "REQUEST_ARRIVED", occurrence: 1.5 },
  { requestId: "a", kind: "REQUEST_ARRIVED", occurrence: "1" },
  { requestId: null, kind: "REQUEST_ARRIVED", occurrence: 1 },
  { requestId: "a\n", kind: "REQUEST_ARRIVED", occurrence: 1 },
  { requestId: "A", kind: "REQUEST_ARRIVED", occurrence: 1 },
  { requestId: "a".repeat(33), kind: "REQUEST_ARRIVED", occurrence: 1 },
  { requestId: "a", kind: "toString", occurrence: 1 },
  { requestId: "a", kind: "READ_OBSERVED", occurrence: 1 },
  { requestId: "a", kind: "REQUEST_ARRIVED", occurrence: 1, attemptId: "a-a1" },
  { requestId: "a", kind: "WORK_COMPLETED", occurrence: 1 },
  { requestId: "a", kind: "WORK_COMPLETED", occurrence: 1, attemptId: null },
  { requestId: "a", kind: "WORK_COMPLETED", occurrence: 1, attemptId: "b-a1" },
  { requestId: "a", kind: "WORK_COMPLETED", occurrence: 1, attemptId: "a-a6" },
  {
    requestId: "a",
    kind: "WORK_COMPLETED",
    occurrence: 1,
    attemptId: "a-a1\n",
  },
  { requestId: "a", kind: "REQUEST_ARRIVED", occurrence: 1, operation: 1 },
  { requestId: "a", kind: "REQUEST_ARRIVED", occurrence: 1, jobId: "job-1" },
  { requestId: "a", kind: "REQUEST_ARRIVED", occurrence: 1, messageId: "m1" },
  { requestId: "a", kind: "REQUEST_ARRIVED", occurrence: 1, operationId: "q1" },
  { requestId: "a", kind: "REQUEST_ARRIVED", occurrence: 1, stepId: "s1" },
  { requestId: "a", kind: "REQUEST_ARRIVED", occurrence: 1, extra: true },
  { attemptId: "a-a1", kind: "WORK_COMPLETED", occurrence: 1 },
])("rejects malformed, mixed, orphan or other-model target %j", (target) => {
  expect(
    resolveRetryCheckpoint(result.events, target as GuidedCheckpoint["target"]),
  ).toBe(-1);
});
it("does not confuse the original request with an attempt or another caller", () => {
  expect(
    resolveRetryCheckpoint(result.events, {
      requestId: "missing",
      kind: "REQUEST_FAILED",
      occurrence: 1,
    } as GuidedCheckpoint["target"]),
  ).toBe(-1);
  expect(
    resolveRetryCheckpoint(result.events, {
      requestId: "a",
      attemptId: "a-a5",
      kind: "WORK_COMPLETED",
      occurrence: 1,
    } as GuidedCheckpoint["target"]),
  ).toBe(-1);
});
