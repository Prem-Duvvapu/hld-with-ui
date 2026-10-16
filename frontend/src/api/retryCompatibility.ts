import Ajv2020 from "ajv/dist/2020.js";
import inputSchema from "../../../contracts/timeouts-retries.input.schema.json";
import resultSchema from "../../../contracts/timeouts-retries.result.schema.json";
import descriptorSchema from "./schemas/retry-descriptor.schema.json";
import type {
  RetryDescriptor,
  RetryInput,
  RetryResult,
  RetryState,
} from "./types";

const ajv = new Ajv2020({
  allErrors: false,
  strict: true,
  strictRequired: false,
});
const validInput = ajv.compile(inputSchema);
const validResult = ajv.compile(resultSchema);
const validDescriptor = ajv.compile(descriptorSchema);
const unique = (values: readonly string[]) =>
  new Set(values).size === values.length;
export class RetryCompatibilityError extends Error {
  constructor() {
    super(
      "This retry response is incompatible with this app. Refresh and try again. If this continues, update the frontend and backend together.",
    );
    this.name = "RetryCompatibilityError";
  }
}
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  )
    return false;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameValue(item, right[index]))
    );
  const a = left as Record<string, unknown>,
    b = right as Record<string, unknown>;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every(
      (key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]),
    )
  );
}
function inputReferences(input: RetryInput) {
  return (
    unique(input.requests.map((request) => request.id)) &&
    input.requests.every(
      (request, index) =>
        index === 0 ||
        request.arrivalTimeMs >= input.requests[index - 1]!.arrivalTimeMs,
    ) &&
    input.maxDelayMs >= input.baseDelayMs
  );
}
export function assertRetryInput(body: unknown): void {
  if (!validInput(body))
    throw new Error(
      `Check the retry input: ${validInput.errors?.[0]?.instancePath || "/"} ${validInput.errors?.[0]?.message || "invalid fields"}.`,
    );
  if (!inputReferences(body as RetryInput))
    throw new Error(
      "Requests need unique IDs in arrival order, and the backoff cap must be at least the base delay.",
    );
}
export function assertRetryDescriptor(body: unknown): void {
  if (!validDescriptor(body)) throw new RetryCompatibilityError();
  const descriptor = body as RetryDescriptor;
  const required = [
    "late-work",
    "healthy-timeout",
    "queue-full",
    "immediate-outage",
    "backoff-recovery",
    "deadline-before-retry",
    "retry-budget",
    "jittered-recovery",
  ];
  if (
    !unique(descriptor.presets.map((preset) => preset.id)) ||
    !required.every((id) =>
      descriptor.presets.some((preset) => preset.id === id),
    ) ||
    !descriptor.presets.every((preset) => inputReferences(preset.input))
  )
    throw new RetryCompatibilityError();
}
function stateReferences(state: RetryState, input: RetryInput): boolean {
  if (
    state.requests.length !== input.requests.length ||
    !state.requests.every(
      (request, index) =>
        request.id === input.requests[index]!.id &&
        request.attemptsSent <= input.maxAttempts,
    ) ||
    state.workers.length !== input.workers ||
    !state.workers.every(
      (worker, index) => worker.id === `worker-${index + 1}`,
    ) ||
    state.queue.length > input.queueCapacity ||
    state.retryBudgetRemaining > input.retryBudget ||
    !unique(state.attempts.map((attempt) => attempt.id))
  )
    return false;
  const attempts = new Map(
    state.attempts.map((attempt) => [attempt.id, attempt]),
  );
  const assigned = state.workers.flatMap((worker) =>
    worker.attemptId === undefined ? [] : [worker.attemptId],
  );
  if (
    !unique(assigned) ||
    !state.queue.every((id) => attempts.get(id)?.workState === "QUEUED") ||
    !assigned.every((id) => attempts.get(id)?.workState === "RUNNING")
  )
    return false;
  return (
    state.attempts.every(
      (attempt) =>
        input.requests.some((request) => request.id === attempt.requestId) &&
        attempt.number <= input.maxAttempts &&
        attempt.id === `${attempt.requestId}-a${attempt.number}` &&
        (attempt.workState !== "QUEUED" || state.queue.includes(attempt.id)) &&
        (attempt.workState !== "RUNNING" || assigned.includes(attempt.id)),
    ) &&
    state.requests.every(
      (request) =>
        request.activeAttemptId === undefined ||
        (attempts.get(request.activeAttemptId)?.requestId === request.id &&
          attempts.get(request.activeAttemptId)?.callerState === "WAITING"),
    )
  );
}
/** Validate identities and retained reported evidence; Java owns scheduling, policy and metrics. */
export function assertRetryResult(body: unknown, submitted: RetryInput): void {
  if (!validResult(body)) throw new RetryCompatibilityError();
  const result = body as RetryResult;
  if (
    !sameValue(result.input, submitted) ||
    !inputReferences(result.input) ||
    !stateReferences(result.initialState, submitted)
  )
    throw new RetryCompatibilityError();
  let previous: RetryState = result.initialState;
  let lastTime = 0;
  for (let index = 0; index < result.events.length; index++) {
    const event = result.events[index]!,
      state = event.postState;
    const attempt =
      event.attemptId === undefined
        ? undefined
        : state.attempts.find((item) => item.id === event.attemptId);
    if (
      event.sequence !== index + 1 ||
      event.timeMs < lastTime ||
      !stateReferences(state, submitted) ||
      !submitted.requests.some((request) => request.id === event.requestId) ||
      (event.attemptId !== undefined &&
        attempt?.requestId !== event.requestId) ||
      state.attempts.length < previous.attempts.length ||
      !state.requests.every(
        (request, requestIndex) =>
          request.overallDeadlineAtMs ===
            previous.requests[requestIndex]!.overallDeadlineAtMs &&
          (previous.requests[requestIndex]!.finishedAtMs === undefined ||
            request.finishedAtMs ===
              previous.requests[requestIndex]!.finishedAtMs),
      ) ||
      !previous.attempts.every((before, attemptIndex) => {
        const after = state.attempts[attemptIndex];
        return (
          after?.id === before.id &&
          after.requestId === before.requestId &&
          after.number === before.number &&
          after.sentAtMs === before.sentAtMs &&
          (
            [
              "startedAtMs",
              "completedAtMs",
              "callerFinishedAtMs",
              "timeoutAtMs",
              "failureCause",
            ] as const
          ).every(
            (field) =>
              before[field] === undefined || after[field] === before[field],
          )
        );
      })
    )
      throw new RetryCompatibilityError();
    previous = state;
    lastTime = event.timeMs;
  }
  if (
    !sameValue(result.finalState, previous) ||
    result.metrics.finalTimeMs !== lastTime ||
    result.metrics.originalRequests !== submitted.requests.length ||
    result.metrics.succeededRequests > submitted.requests.length ||
    result.metrics.failedRequests > submitted.requests.length
  )
    throw new RetryCompatibilityError();
}
