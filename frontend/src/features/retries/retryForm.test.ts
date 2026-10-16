import { expect, it } from "vitest";
import { descriptor, input } from "../../api/retryTestFixtures";
import { parseRetryForm, toRetryForm } from "./retryForm";
it("round trips every actual Java descriptor preset without normalizing its workload or policy", () => {
  expect(descriptor.presets).toHaveLength(8);
  for (const preset of descriptor.presets)
    expect(
      parseRetryForm(toRetryForm(preset.input), descriptor.limits),
    ).toEqual({ errors: {}, input: preset.input });
});
it.each(["", " ", "1.5", "1e2", "NaN", "9007199254740992"])(
  "rejects an incomplete or coerced scalar %j",
  (value) => {
    const form = toRetryForm(input);
    form.attemptTimeoutMs = value;
    const parsed = parseRetryForm(form, descriptor.limits);
    expect(parsed.input).toBeUndefined();
    expect(parsed.errors.attemptTimeoutMs).toBeTruthy();
    expect(form.attemptTimeoutMs).toBe(value);
  },
);
it("preserves legal zero and negative seed values and rejects unsafe or out of bound values", () => {
  const form = toRetryForm(input);
  form.queueCapacity = "0";
  form.retryBudget = "0";
  form.seed = "-9007199254740991";
  expect(parseRetryForm(form, descriptor.limits).input).toMatchObject({
    queueCapacity: 0,
    retryBudget: 0,
    seed: -9007199254740991,
  });
  form.seed = "9007199254740992";
  expect(parseRetryForm(form, descriptor.limits).errors.seed).toBeTruthy();
});
it("requires unique whole ASCII IDs and preserves arrival order instead of sorting it", () => {
  const form = toRetryForm(input);
  form.requests.push({
    key: "other",
    id: "a",
    arrivalTimeMs: "0",
    serviceTimeMs: "20",
  });
  expect(
    parseRetryForm(form, descriptor.limits).errors["requests.other.id"],
  ).toContain("unique");
  form.requests[1]!.id = "b\n";
  expect(parseRetryForm(form, descriptor.limits).input).toBeUndefined();
  form.requests[1]!.id = "b";
  form.requests[0]!.arrivalTimeMs = "10";
  expect(
    parseRetryForm(form, descriptor.limits).errors[
      "requests.other.arrivalTimeMs"
    ],
  ).toContain("nondecreasing");
  expect(form.requests[0]!.arrivalTimeMs).toBe("10");
});
it("checks policy combinations without silently changing the draft", () => {
  const form = toRetryForm(input);
  form.jitter = "FULL";
  expect(parseRetryForm(form, descriptor.limits).errors.backoff).toBeTruthy();
  expect(form.jitter).toBe("FULL");
  form.backoff = "EXPONENTIAL";
  form.baseDelayMs = "40";
  form.maxDelayMs = "39";
  expect(
    parseRetryForm(form, descriptor.limits).errors.maxDelayMs,
  ).toBeTruthy();
  form.maxDelayMs = "80";
  expect(parseRetryForm(form, descriptor.limits).input?.backoff).toBe(
    "EXPONENTIAL",
  );
});
it("enforces request count and per-request numeric bounds", () => {
  const form = toRetryForm(input);
  form.requests[0]!.serviceTimeMs = "0";
  expect(parseRetryForm(form, descriptor.limits).input).toBeUndefined();
  form.requests = [];
  expect(parseRetryForm(form, descriptor.limits).errors.requests).toBeTruthy();
});
