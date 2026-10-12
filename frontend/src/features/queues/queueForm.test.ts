import {
  assertQueueCompatibility,
  QueueCompatibilityError,
} from "../../api/queueCompatibility";
import { expect, it } from "vitest";
import { queueInput, toQueueForm, validateQueueForm } from "./queueForm";
import { baselineInput, baselineResult, descriptor } from "./queueTestFixtures";
it("preserves the exact version, metadata and ordered workload in serialization", () => {
  const form = toQueueForm(baselineInput);
  expect(validateQueueForm(form, descriptor.limits)).toEqual({});
  expect(queueInput(form)).toEqual(baselineInput);
  form.workers = "2";
  form.queueCapacity = "0";
  form.seed = "-7";
  form.jobs[0]!.serviceTimeMs = "100";
  expect(queueInput(form)).toEqual({
    ...baselineInput,
    workers: 2,
    queueCapacity: 0,
    seed: -7,
    jobs: baselineInput.jobs.map((job, i) =>
      i === 0 ? { ...job, serviceTimeMs: 100 } : job,
    ),
  });
});
it.each(["workers", "queueCapacity", "seed"] as const)(
  "refuses a blank %s instead of converting it to zero",
  (field) => {
    const form = toQueueForm(baselineInput);
    form[field] = "";
    expect(validateQueueForm(form, descriptor.limits)[field]).toMatch(
      /whole number/,
    );
  },
);
it("rejects duplicate IDs, invalid identifiers, out-of-order arrival and blank service", () => {
  const form = toQueueForm(baselineInput);
  form.jobs[0]!.arrivalTimeMs = "20";
  form.jobs[1]!.id = form.jobs[0]!.id;
  form.jobs[2]!.id = "bad ID";
  form.jobs[3]!.serviceTimeMs = "";
  expect(validateQueueForm(form, descriptor.limits)).toMatchObject({
    "jobs.1.arrivalTimeMs": expect.stringContaining("order"),
    "jobs.1.id": expect.stringContaining("unique"),
    "jobs.2.id": expect.stringContaining("lowercase"),
    "jobs.3.serviceTimeMs": expect.stringContaining("whole number"),
  });
});
it("applies inclusive descriptor limits without accepting fractions or oversized workloads", () => {
  const form = toQueueForm(baselineInput);
  form.workers = "8";
  form.queueCapacity = "100";
  form.seed = String(Number.MAX_SAFE_INTEGER);
  expect(validateQueueForm(form, descriptor.limits)).toEqual({});
  form.workers = "8.5";
  form.jobs = Array.from({ length: 101 }, (_, i) => ({
    id: `job-${i}`,
    arrivalTimeMs: "60001",
    serviceTimeMs: "0",
  }));
  expect(validateQueueForm(form, descriptor.limits)).toHaveProperty("jobs");
  expect(validateQueueForm(form, descriptor.limits)).toHaveProperty("workers");
  expect(
    validateQueueForm(form, descriptor.limits)["jobs.0.arrivalTimeMs"],
  ).toBeDefined();
});

it("rejects trailing newlines in authored jobs, presets and returned worker IDs with full-string validation", () => {
  const form = toQueueForm(baselineInput);
  form.jobs[0]!.id = "job-1\n";
  expect(validateQueueForm(form, descriptor.limits)["jobs.0.id"]).toMatch(
    /lowercase/,
  );
  const invalidPreset = {
    ...descriptor.presets[0]!,
    input: {
      ...baselineInput,
      jobs: baselineInput.jobs.map((job, index) =>
        index === 0 ? { ...job, id: "job-1\n" } : job,
      ),
    },
  };
  expect(() =>
    assertQueueCompatibility(
      { ...descriptor, presets: [invalidPreset] },
      "descriptor",
    ),
  ).toThrow(QueueCompatibilityError);
  for (const returned of [
    {
      ...baselineResult,
      initialState: {
        ...baselineResult.initialState,
        workers: [{ id: "worker-1\n" }],
      },
    },
    {
      ...baselineResult,
      events: baselineResult.events.map((event, index) =>
        index === 0 ? { ...event, workerId: "worker-1\n" } : event,
      ),
    },
    {
      ...baselineResult,
      outcomes: baselineResult.outcomes.map((outcome, index) =>
        index === 0 ? { ...outcome, workerId: "worker-1\n" } : outcome,
      ),
    },
  ])
    expect(() => assertQueueCompatibility(returned, "result")).toThrow(
      QueueCompatibilityError,
    );
});
