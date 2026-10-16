import type { RetryInput, RetryLimits } from "../../api/types";
export type RequestDraft = {
  key: string;
  id: string;
  arrivalTimeMs: string;
  serviceTimeMs: string;
};
export type RetryForm = {
  seed: string;
  workers: string;
  queueCapacity: string;
  attemptTimeoutMs: string;
  overallTimeoutMs: string;
  maxAttempts: string;
  backoff: RetryInput["backoff"];
  baseDelayMs: string;
  maxDelayMs: string;
  jitter: RetryInput["jitter"];
  retryBudget: string;
  unavailableUntilMs: string;
  requests: RequestDraft[];
};
export type RetryErrors = Record<string, string>;
export function toRetryForm(input: RetryInput): RetryForm {
  return {
    seed: String(input.seed),
    workers: String(input.workers),
    queueCapacity: String(input.queueCapacity),
    attemptTimeoutMs: String(input.attemptTimeoutMs),
    overallTimeoutMs: String(input.overallTimeoutMs),
    maxAttempts: String(input.maxAttempts),
    backoff: input.backoff,
    baseDelayMs: String(input.baseDelayMs),
    maxDelayMs: String(input.maxDelayMs),
    jitter: input.jitter,
    retryBudget: String(input.retryBudget),
    unavailableUntilMs: String(input.unavailableUntilMs),
    requests: input.requests.map((r, i) => ({
      key: `preset-${i}`,
      id: r.id,
      arrivalTimeMs: String(r.arrivalTimeMs),
      serviceTimeMs: String(r.serviceTimeMs),
    })),
  };
}
export function parseRetryForm(
  form: RetryForm,
  limits: RetryLimits,
): { errors: RetryErrors; input?: RetryInput } {
  const errors: RetryErrors = {};
  function integer(value: string, key: string, min: number, max: number) {
    if (
      !/^-?\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < min ||
      Number(value) > max
    )
      errors[key] = `Use a whole number from ${min} to ${max}.`;
    return Number(value);
  }
  const seed = integer(
    form.seed,
    "seed",
    -limits.maxSafeSeed,
    limits.maxSafeSeed,
  );
  const workers = integer(form.workers, "workers", 1, limits.maxWorkers);
  const queueCapacity = integer(
    form.queueCapacity,
    "queueCapacity",
    0,
    limits.maxQueueCapacity,
  );
  const attemptTimeoutMs = integer(
    form.attemptTimeoutMs,
    "attemptTimeoutMs",
    1,
    limits.maxAttemptTimeoutMs,
  );
  const overallTimeoutMs = integer(
    form.overallTimeoutMs,
    "overallTimeoutMs",
    1,
    limits.maxOverallTimeoutMs,
  );
  const maxAttempts = integer(
    form.maxAttempts,
    "maxAttempts",
    1,
    limits.maxAttempts,
  );
  const baseDelayMs = integer(
    form.baseDelayMs,
    "baseDelayMs",
    0,
    limits.maxDelayMs,
  );
  const maxDelayMs = integer(
    form.maxDelayMs,
    "maxDelayMs",
    0,
    limits.maxDelayMs,
  );
  const retryBudget = integer(
    form.retryBudget,
    "retryBudget",
    0,
    limits.maxRetryBudget,
  );
  const unavailableUntilMs = integer(
    form.unavailableUntilMs,
    "unavailableUntilMs",
    0,
    limits.maxUnavailableUntilMs,
  );
  if (!["IMMEDIATE", "EXPONENTIAL"].includes(form.backoff))
    errors.backoff = "Choose an available backoff policy.";
  if (!["NONE", "FULL"].includes(form.jitter))
    errors.jitter = "Choose no jitter or full jitter.";
  if (
    form.backoff === "IMMEDIATE" &&
    (baseDelayMs !== 0 || maxDelayMs !== 0 || form.jitter !== "NONE")
  )
    errors.backoff = "Immediate retries require zero base/cap and no jitter.";
  if (
    form.backoff === "EXPONENTIAL" &&
    !errors.baseDelayMs &&
    !errors.maxDelayMs &&
    (baseDelayMs < 1 || maxDelayMs < baseDelayMs)
  )
    errors.maxDelayMs =
      "Exponential backoff needs a positive base and a cap at least as large as its base.";
  if (form.requests.length < 1 || form.requests.length > limits.maxRequests)
    errors.requests = `Use 1–${limits.maxRequests} requests.`;
  const ids = new Set<string>();
  const requests = form.requests.map((row, i) => {
    const key = `requests.${row.key}`;
    if (
      !/^[a-z][a-z0-9-]*$/.test(row.id) ||
      /\s/.test(row.id) ||
      row.id.length > limits.maxIdLength
    )
      errors[`${key}.id`] =
        `Use a lowercase ID starting with a letter, at most ${limits.maxIdLength} characters.`;
    else if (ids.has(row.id))
      errors[`${key}.id`] = "Each request needs a unique ID.";
    ids.add(row.id);
    const arrivalTimeMs = integer(
      row.arrivalTimeMs,
      `${key}.arrivalTimeMs`,
      0,
      limits.maxArrivalTimeMs,
    );
    const serviceTimeMs = integer(
      row.serviceTimeMs,
      `${key}.serviceTimeMs`,
      1,
      limits.maxServiceTimeMs,
    );
    if (
      i &&
      !errors[`${key}.arrivalTimeMs`] &&
      Number(form.requests[i - 1]!.arrivalTimeMs) > arrivalTimeMs
    )
      errors[`${key}.arrivalTimeMs`] =
        "Keep request arrival times in nondecreasing order; equal times are allowed.";
    return { id: row.id, arrivalTimeMs, serviceTimeMs };
  });
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    input: {
      schemaVersion: "1.0",
      modelVersion: "1.0.0",
      seed,
      workers,
      queueCapacity,
      attemptTimeoutMs,
      overallTimeoutMs,
      maxAttempts,
      backoff: form.backoff,
      baseDelayMs,
      maxDelayMs,
      jitter: form.jitter,
      retryBudget,
      unavailableUntilMs,
      requests,
    },
  };
}
