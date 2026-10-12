import inputFixture from "../../../../contracts/examples/queue-capacity-baseline-input.json";
import resultFixture from "../../../../contracts/examples/queue-capacity-baseline-result.json";
import type {
  QueueCapacityDescriptor,
  QueueCapacityInput,
  QueueCapacityResult,
} from "../../api/types";
// The baseline result is checked against actual Java serialization by its owning backend test.
export const baselineInput = inputFixture as QueueCapacityInput;
export const baselineResult = resultFixture as QueueCapacityResult;
export const descriptor: QueueCapacityDescriptor = {
  id: "queues-tail-latency",
  title: "Queues & Tail Latency",
  kind: "simulation",
  modelVersion: "1.0.0",
  description: "One shared FIFO queue feeds bounded workers.",
  assumptions: baselineResult.assumptions,
  limits: {
    minJobs: 1,
    maxJobs: 100,
    minWorkers: 1,
    maxWorkers: 8,
    minQueueCapacity: 0,
    maxQueueCapacity: 100,
    minArrivalTimeMs: 0,
    maxArrivalTimeMs: 60_000,
    minServiceTimeMs: 1,
    maxServiceTimeMs: 10_000,
    minSeed: -9007199254740991,
    maxSeed: 9007199254740991,
    jobIdPattern: "^[a-z][a-z0-9-]{0,31}$",
  },
  presets: [
    {
      id: "baseline",
      title: "Baseline: one worker, one waiting slot",
      question: "Which jobs can wait?",
      input: baselineInput,
    },
    {
      id: "more-workers",
      title: "More workers",
      question: "Does adding workers change waiting?",
      input: { ...baselineInput, workers: 2 },
    },
  ],
};
// Shape fixture for a guard before the first admitted event; browser tests exercise Java's real limited preset.
export const beforeFirstEvent: QueueCapacityResult = {
  ...baselineResult,
  status: "limited",
  truncationReason: "event_limit",
  lastVirtualTimeMs: 0,
  events: [],
  finalState: baselineResult.initialState,
  outcomes: baselineInput.jobs.map((job) => ({
    jobId: job.id,
    status: "NOT_ARRIVED",
    arrivalTimeMs: job.arrivalTimeMs,
    serviceTimeMs: job.serviceTimeMs,
  })),
  metrics: {
    totalJobs: 4,
    completed: 0,
    rejected: 0,
    queued: 0,
    running: 0,
    notArrived: 4,
    successfulSamples: 0,
    peakWaiting: 0,
    observationStartMs: 0,
    observationEndMs: 0,
  },
};
