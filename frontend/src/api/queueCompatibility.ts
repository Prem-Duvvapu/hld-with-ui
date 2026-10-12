import type {
  QueueCapacityEvent,
  QueueCapacityInput,
  QueueCapacityResult,
} from "./types";

export const queueEventLabels: Record<QueueCapacityEvent["kind"], string> = {
  "job.queued": "Job waits in the shared queue",
  "job.started": "Worker starts the job",
  "job.completed": "Worker completes the job",
  "job.rejected": "No waiting slot is available",
};
export class QueueCompatibilityError extends Error {
  constructor() {
    super(
      "This queue response is incompatible with this app. Refresh and try again. If this continues, update the frontend and backend together.",
    );
    this.name = "QueueCompatibilityError";
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function integer(value: unknown, min = 0, max = 1_060_000): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
  );
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function nullableNumber(value: unknown) {
  return (
    value == null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}
const jobPattern = /^[a-z][a-z0-9-]{0,31}$/;
function jobId(value: unknown): value is string {
  return typeof value === "string" && jobPattern.exec(value)?.[0] === value;
}
function workerId(value: unknown): value is string {
  return (
    typeof value === "string" && /^worker-[1-8]$/.exec(value)?.[0] === value
  );
}
function state(value: unknown, count?: number): boolean {
  if (
    !object(value) ||
    !Array.isArray(value.queuedJobIds) ||
    value.queuedJobIds.length > 100 ||
    !value.queuedJobIds.every(jobId) ||
    new Set(value.queuedJobIds).size !== value.queuedJobIds.length ||
    !Array.isArray(value.workers) ||
    !integer(value.workers.length, 1, 8) ||
    (count !== undefined && value.workers.length !== count)
  )
    return false;
  const assigned = new Set(value.queuedJobIds);
  const workers = new Set<string>();
  return value.workers.every((worker: unknown) => {
    if (
      !object(worker) ||
      !text(worker.id) ||
      !workerId(worker.id) ||
      workers.has(worker.id)
    )
      return false;
    workers.add(worker.id);
    if (worker.jobId == null)
      return (
        worker.startedAtMs == null && worker.scheduledCompletionAtMs == null
      );
    if (
      !jobId(worker.jobId) ||
      assigned.has(worker.jobId) ||
      !integer(worker.startedAtMs) ||
      !integer(worker.scheduledCompletionAtMs) ||
      worker.scheduledCompletionAtMs < worker.startedAtMs
    )
      return false;
    assigned.add(worker.jobId);
    return true;
  });
}
function input(value: unknown): boolean {
  if (
    !object(value) ||
    value.schemaVersion !== "1.0" ||
    value.modelVersion !== "1.0.0" ||
    !integer(value.workers, 1, 8) ||
    !integer(value.queueCapacity, 0, 100) ||
    !integer(value.seed, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) ||
    !Array.isArray(value.jobs) ||
    !integer(value.jobs.length, 1, 100)
  )
    return false;
  const ids = new Set<string>();
  let previous = -1;
  return value.jobs.every((job: unknown) => {
    if (
      !object(job) ||
      !jobId(job.id) ||
      ids.has(job.id) ||
      !integer(job.arrivalTimeMs, 0, 60_000) ||
      job.arrivalTimeMs < previous ||
      !integer(job.serviceTimeMs, 1, 10_000)
    )
      return false;
    ids.add(job.id);
    previous = job.arrivalTimeMs;
    return true;
  });
}
function descriptor(body: Record<string, unknown>) {
  if (
    body.id !== "queues-tail-latency" ||
    body.kind !== "simulation" ||
    !text(body.title) ||
    !text(body.description) ||
    !object(body.limits) ||
    !Array.isArray(body.presets) ||
    body.presets.length === 0
  )
    return false;
  const expected = {
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
    minSeed: -Number.MAX_SAFE_INTEGER,
    maxSeed: Number.MAX_SAFE_INTEGER,
    jobIdPattern: "^[a-z][a-z0-9-]{0,31}$",
  };
  const limits = body.limits;
  if (!Object.entries(expected).every(([key, value]) => limits[key] === value))
    return false;
  const ids = new Set<string>();
  return body.presets.every((preset: unknown) => {
    if (
      !object(preset) ||
      !text(preset.id) ||
      ids.has(preset.id) ||
      !text(preset.title) ||
      !text(preset.question) ||
      !input(preset.input)
    )
      return false;
    ids.add(preset.id);
    return true;
  });
}
function result(body: Record<string, unknown>) {
  if (
    body.simulationId !== "queues-tail-latency" ||
    body.schemaVersion !== "1.0" ||
    !integer(body.seed, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) ||
    !integer(body.lastVirtualTimeMs) ||
    !["completed", "limited"].includes(String(body.status)) ||
    !Array.isArray(body.assumptions) ||
    !body.assumptions.every(text) ||
    !state(body.initialState) ||
    !object(body.initialState) ||
    !Array.isArray(body.initialState.workers) ||
    !state(body.finalState, body.initialState.workers.length) ||
    !Array.isArray(body.events) ||
    body.events.length > 10_000 ||
    !Array.isArray(body.outcomes) ||
    !integer(body.outcomes.length, 1, 100) ||
    !object(body.metrics)
  )
    return false;
  if (
    body.status === "limited"
      ? ![
          "event_limit",
          "trace_size_limit",
          "virtual_time_limit",
          "wall_time_limit",
        ].includes(String(body.truncationReason))
      : body.truncationReason != null
  )
    return false;
  const count = body.initialState.workers.length;
  let time = 0;
  if (
    !body.events.every((event: unknown, index: number) => {
      if (
        !object(event) ||
        event.sequence !== index + 1 ||
        !integer(event.timeMs) ||
        event.timeMs < time ||
        event.timeMs > Number(body.lastVirtualTimeMs) ||
        typeof event.kind !== "string" ||
        !Object.hasOwn(queueEventLabels, event.kind) ||
        !jobId(event.jobId) ||
        !text(event.message) ||
        !state(event.state, count)
      )
        return false;
      time = event.timeMs;
      return ["job.started", "job.completed"].includes(event.kind)
        ? workerId(event.workerId)
        : event.workerId == null;
    })
  )
    return false;
  const ids = new Set<string>();
  if (
    !body.outcomes.every((outcome: unknown) => {
      if (
        !object(outcome) ||
        !jobId(outcome.jobId) ||
        ids.has(outcome.jobId) ||
        !integer(outcome.arrivalTimeMs, 0, 60_000) ||
        !integer(outcome.serviceTimeMs, 1, 10_000) ||
        !["NOT_ARRIVED", "QUEUED", "RUNNING", "COMPLETED", "REJECTED"].includes(
          String(outcome.status),
        )
      )
        return false;
      ids.add(outcome.jobId);
      if (
        !["startTimeMs", "terminalTimeMs", "waitTimeMs", "latencyMs"].every(
          (key) => nullableNumber(outcome[key]),
        )
      )
        return false;
      if (["COMPLETED", "RUNNING"].includes(String(outcome.status))) {
        if (
          !workerId(outcome.workerId) ||
          !integer(outcome.startTimeMs) ||
          !integer(outcome.waitTimeMs)
        )
          return false;
      } else if (
        outcome.workerId != null ||
        outcome.startTimeMs != null ||
        outcome.waitTimeMs != null
      )
        return false;
      if (outcome.status === "COMPLETED")
        return integer(outcome.terminalTimeMs) && integer(outcome.latencyMs);
      if (outcome.status === "REJECTED")
        return integer(outcome.terminalTimeMs) && outcome.latencyMs == null;
      return outcome.terminalTimeMs == null && outcome.latencyMs == null;
    })
  )
    return false;
  const metrics = body.metrics;
  if (
    ![
      "totalJobs",
      "completed",
      "rejected",
      "queued",
      "running",
      "notArrived",
      "successfulSamples",
      "peakWaiting",
    ].every((key) => integer(metrics[key], 0, 100)) ||
    metrics.totalJobs !== body.outcomes.length ||
    metrics.observationStartMs !== 0 ||
    metrics.observationEndMs !== body.lastVirtualTimeMs ||
    !nullableNumber(metrics.completedThroughputPerSecond)
  )
    return false;
  const stats = [
    "meanSuccessfulWaitMs",
    "meanSuccessfulLatencyMs",
    "p95SuccessfulWaitMs",
    "p95SuccessfulLatencyMs",
  ];
  if (
    !stats.every((key) =>
      metrics.successfulSamples === 0
        ? metrics[key] == null
        : typeof metrics[key] === "number" &&
          Number.isFinite(metrics[key]) &&
          Number(metrics[key]) >= 0,
    )
  )
    return false;
  return body.events.every(
    (event) => object(event) && ids.has(String(event.jobId)),
  );
}
/** Reject unsupported versions, transitions and incomplete snapshots before a renderer mounts. */
export function assertQueueCompatibility(
  body: unknown,
  kind: "descriptor" | "result",
): void {
  if (
    !object(body) ||
    body.modelVersion !== "1.0.0" ||
    !(kind === "descriptor" ? descriptor(body) : result(body))
  )
    throw new QueueCompatibilityError();
}

/** A supported response must also belong to the exact workload that was submitted. */
export function assertQueueRunInput(
  result: QueueCapacityResult,
  input: QueueCapacityInput,
): void {
  if (
    result.seed !== input.seed ||
    result.initialState.workers.length !== input.workers ||
    result.outcomes.length !== input.jobs.length ||
    !result.outcomes.every((outcome, index) => {
      const job = input.jobs[index]!;
      return (
        outcome.jobId === job.id &&
        outcome.arrivalTimeMs === job.arrivalTimeMs &&
        outcome.serviceTimeMs === job.serviceTimeMs
      );
    })
  )
    throw new QueueCompatibilityError();
}
