import { expect, it } from "vitest";
import type { GuidedCheckpoint } from "../../api/types";
import { resolveQueueCheckpoint } from "./checkpoints";
import { baselineResult } from "./queueTestFixtures";
it("selects the Java event by job identity and kind regardless of neighboring jobs or narration", () => {
  const target = { jobId: "job-2", kind: "job.queued", occurrence: 1 };
  const position = resolveQueueCheckpoint(baselineResult.events, target);
  expect(baselineResult.events[position]).toMatchObject({
    jobId: "job-2",
    kind: "job.queued",
    timeMs: 0,
  });
  const changed = baselineResult.events.map((event) => ({
    ...event,
    message: "Changed explanation.",
  }));
  expect(resolveQueueCheckpoint(changed, target)).toBe(position);
});
it("distinguishes repeated occurrences and refuses another model's selector or a missing target", () => {
  const repeated = [...baselineResult.events, baselineResult.events[1]!];
  expect(
    resolveQueueCheckpoint(repeated, {
      jobId: "job-2",
      kind: "job.queued",
      occurrence: 2,
    }),
  ).toBe(baselineResult.events.length);
  for (const target of [
    { operation: 1, kind: "job.started", occurrence: 1 },
    { jobId: "job-1", operation: 1, kind: "job.started", occurrence: 1 },
    { jobId: "missing", kind: "job.started", occurrence: 1 },
    {
      jobId: "job-2",
      kind: "job.queued",
      occurrence: 1,
      messageId: "m1",
      attemptId: "m1-a1",
    },
    { jobId: "job-2", kind: "job.queued", occurrence: 2 },
  ] as GuidedCheckpoint["target"][])
    expect(resolveQueueCheckpoint(baselineResult.events, target)).toBe(-1);
});
