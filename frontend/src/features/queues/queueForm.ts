import type { QueueCapacityInput, QueueCapacityLimits } from "../../api/types";

export type QueueForm = {
  workers: string;
  queueCapacity: string;
  seed: string;
  jobs: { id: string; arrivalTimeMs: string; serviceTimeMs: string }[];
};
export type QueueErrors = Record<string, string>;
export function toQueueForm(input: QueueCapacityInput): QueueForm {
  return {
    workers: String(input.workers),
    queueCapacity: String(input.queueCapacity),
    seed: String(input.seed),
    jobs: input.jobs.map((job) => ({
      id: job.id,
      arrivalTimeMs: String(job.arrivalTimeMs),
      serviceTimeMs: String(job.serviceTimeMs),
    })),
  };
}
export function validateQueueForm(
  form: QueueForm,
  limits: QueueCapacityLimits,
): QueueErrors {
  const errors: QueueErrors = {};
  function integer(
    value: string,
    field: string,
    name: string,
    min: number,
    max: number,
  ) {
    if (
      !value.trim() ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < min ||
      Number(value) > max
    )
      errors[field] = `${name} must be a whole number from ${min} to ${max}.`;
  }
  integer(
    form.workers,
    "workers",
    "Workers",
    limits.minWorkers,
    limits.maxWorkers,
  );
  integer(
    form.queueCapacity,
    "queueCapacity",
    "Waiting slots",
    limits.minQueueCapacity,
    limits.maxQueueCapacity,
  );
  integer(form.seed, "seed", "Seed", limits.minSeed, limits.maxSeed);
  if (form.jobs.length < limits.minJobs || form.jobs.length > limits.maxJobs)
    errors.jobs = `Use ${limits.minJobs} to ${limits.maxJobs} jobs.`;
  const pattern = new RegExp(limits.jobIdPattern);
  const seen = new Set<string>();
  form.jobs.forEach((job, index) => {
    const prefix = `jobs.${index}`;
    // Java Matcher.matches requires the entire ID, including any final newline.
    if (pattern.exec(job.id)?.[0] !== job.id)
      errors[`${prefix}.id`] =
        "Use a lowercase letter followed by lowercase letters, numbers or hyphens; at most 32 characters.";
    else if (seen.has(job.id))
      errors[`${prefix}.id`] = "Each job needs a unique ID.";
    seen.add(job.id);
    integer(
      job.arrivalTimeMs,
      `${prefix}.arrivalTimeMs`,
      "Arrival",
      limits.minArrivalTimeMs,
      limits.maxArrivalTimeMs,
    );
    integer(
      job.serviceTimeMs,
      `${prefix}.serviceTimeMs`,
      "Service time",
      limits.minServiceTimeMs,
      limits.maxServiceTimeMs,
    );
    const previous = form.jobs[index - 1];
    if (
      previous &&
      previous.arrivalTimeMs.trim() &&
      job.arrivalTimeMs.trim() &&
      Number(job.arrivalTimeMs) < Number(previous.arrivalTimeMs)
    )
      errors[`${prefix}.arrivalTimeMs`] =
        "Keep arrivals in nondecreasing order; equal times keep this row order.";
  });
  return errors;
}
export function queueInput(form: QueueForm): QueueCapacityInput {
  return {
    schemaVersion: "1.0",
    modelVersion: "1.0.0",
    workers: Number(form.workers),
    queueCapacity: Number(form.queueCapacity),
    seed: Number(form.seed),
    jobs: form.jobs.map((job) => ({
      id: job.id,
      arrivalTimeMs: Number(job.arrivalTimeMs),
      serviceTimeMs: Number(job.serviceTimeMs),
    })),
  };
}
