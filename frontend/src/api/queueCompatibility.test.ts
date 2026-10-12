import { expect, it } from "vitest";
import {
  assertQueueCompatibility,
  assertQueueRunInput,
  QueueCompatibilityError,
} from "./queueCompatibility";
import {
  baselineResult,
  beforeFirstEvent,
  descriptor,
} from "../features/queues/queueTestFixtures";
it("accepts the Java-serialized baseline and a valid empty guarded prefix", () => {
  expect(() =>
    assertQueueCompatibility(baselineResult, "result"),
  ).not.toThrow();
  expect(() =>
    assertQueueCompatibility(beforeFirstEvent, "result"),
  ).not.toThrow();
  expect(() =>
    assertQueueCompatibility(descriptor, "descriptor"),
  ).not.toThrow();
});
it.each([
  null,
  { ...baselineResult, simulationId: "request-flow" },
  { ...baselineResult, schemaVersion: "9.0" },
  { ...baselineResult, modelVersion: "9.0.0" },
  { ...baselineResult, initialState: {} },
  { ...baselineResult, finalState: null },
  {
    ...baselineResult,
    events: [{ ...baselineResult.events[0], kind: "toString" }],
  },
  {
    ...baselineResult,
    events: [
      {
        ...baselineResult.events[0],
        state: {
          queuedJobIds: [],
          workers: [{ id: "worker-1", jobId: "job-1" }],
        },
      },
    ],
  },
  {
    ...baselineResult,
    events: [
      {
        ...baselineResult.events[0],
        state: {
          queuedJobIds: ["job-1"],
          workers: [
            {
              id: "worker-1",
              jobId: "job-1",
              startedAtMs: 0,
              scheduledCompletionAtMs: 10,
            },
          ],
        },
      },
    ],
  },
  { ...baselineResult, metrics: {} },
  { ...baselineResult, status: "limited" },
])("rejects incompatible or unusable queue response %j", (body) => {
  expect(() => assertQueueCompatibility(body, "result")).toThrow(
    QueueCompatibilityError,
  );
});
it("rejects unsupported descriptor limits, missing jobs and nested preset versions", () => {
  expect(() =>
    assertQueueCompatibility(
      { ...descriptor, limits: { ...descriptor.limits, maxWorkers: 99 } },
      "descriptor",
    ),
  ).toThrow(QueueCompatibilityError);
  expect(() =>
    assertQueueCompatibility(
      {
        ...descriptor,
        presets: [
          {
            ...descriptor.presets[0],
            input: { ...descriptor.presets[0]!.input, jobs: null },
          },
        ],
      },
      "descriptor",
    ),
  ).toThrow(QueueCompatibilityError);
  expect(() =>
    assertQueueCompatibility(
      {
        ...descriptor,
        presets: [
          {
            ...descriptor.presets[0],
            input: { ...descriptor.presets[0]!.input, modelVersion: "2.0.0" },
          },
        ],
      },
      "descriptor",
    ),
  ).toThrow(QueueCompatibilityError);
});

it("rejects valid-looking results for a different submitted workload", () => {
  const input = descriptor.presets[0]!.input;
  expect(() => assertQueueRunInput(baselineResult, input)).not.toThrow();
  expect(() =>
    assertQueueRunInput(baselineResult, { ...input, seed: 8 }),
  ).toThrow(QueueCompatibilityError);
  expect(() =>
    assertQueueRunInput(baselineResult, { ...input, workers: 2 }),
  ).toThrow(QueueCompatibilityError);
  expect(() =>
    assertQueueRunInput(baselineResult, {
      ...input,
      jobs: input.jobs.map((job, i) =>
        i === 0 ? { ...job, serviceTimeMs: 20 } : job,
      ),
    }),
  ).toThrow(QueueCompatibilityError);
});
