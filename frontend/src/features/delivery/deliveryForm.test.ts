import { expect, it } from "vitest";
import { parseDeliveryForm, toDeliveryForm } from "./deliveryForm";
import { baselineInput, descriptor } from "./deliveryTestFixtures";
it("serializes every required field and keeps valid message/failure row order", () => {
  const form = toDeliveryForm(baselineInput);
  expect(parseDeliveryForm(form, descriptor.limits)).toEqual({
    errors: {},
    input: baselineInput,
  });
  form.messages = "m2, 10\nm1, 0";
  form.consumers = "c2\nc1";
  form.failures = "c1, RECOVER, 75\nc1, CRASH, 25";
  form.lostAcknowledgments = "m2, 2";
  form.seed = "-42";
  expect(parseDeliveryForm(form, descriptor.limits).input).toMatchObject({
    messages: [
      { id: "m2", enqueueTimeMs: 10 },
      { id: "m1", enqueueTimeMs: 0 },
    ],
    consumers: [{ id: "c2" }, { id: "c1" }],
    failures: [
      { consumerId: "c1", action: "RECOVER", timeMs: 75 },
      { consumerId: "c1", action: "CRASH", timeMs: 25 },
    ],
    lostAcknowledgments: [{ messageId: "m2", attempt: 2 }],
    seed: -42,
  });
});
it.each(["", "1.5", "1e2", "true", "1001"])(
  "refuses invalid processing input %j without supplying an executable input",
  (value) => {
    const form = toDeliveryForm(baselineInput);
    form.processingTimeMs = value;
    expect(
      parseDeliveryForm(form, descriptor.limits).errors.processingTimeMs,
    ).toBeDefined();
    expect(parseDeliveryForm(form, descriptor.limits).input).toBeUndefined();
  },
);
it("enforces early ACK timing and descriptor-backed list/scalar bounds", () => {
  const form = toDeliveryForm(baselineInput);
  form.acknowledgmentPolicy = "ACK_BEFORE_EFFECT";
  form.acknowledgmentDelayMs = "50";
  expect(
    parseDeliveryForm(form, descriptor.limits).errors.acknowledgmentDelayMs,
  ).toMatch(/shorter/);
  form.messages = Array.from({ length: 21 }, (_, index) => `m${index}, 0`).join(
    "\n",
  );
  form.consumers = "c1\nc2\nc3\nc4";
  form.seed = "9007199254740992";
  expect(parseDeliveryForm(form, descriptor.limits).errors).toMatchObject({
    messages: expect.any(String),
    consumers: expect.any(String),
    seed: expect.any(String),
  });
});
it("refuses duplicate IDs, missing references, invalid fault order and duplicate loss pairs", () => {
  const form = toDeliveryForm(baselineInput);
  form.messages = "m1, 0\nm1, 1";
  form.consumers = "c1\nc1";
  form.failures = "missing, CRASH, 25";
  form.lostAcknowledgments = "m1, 1\nm1, 01";
  expect(parseDeliveryForm(form, descriptor.limits).errors).toMatchObject({
    messages: expect.stringContaining("unique"),
    consumers: expect.stringContaining("unique"),
    failures: expect.stringContaining("existing"),
    lostAcknowledgments: expect.stringContaining("unique"),
  });
  for (const failures of [
    "c1, RECOVER, 25",
    "c1, CRASH, 25\nc1, CRASH, 75",
    "c1, CRASH, 25\nc1, RECOVER, 25",
  ]) {
    form.failures = failures;
    expect(parseDeliveryForm(form, descriptor.limits).errors.failures).toMatch(
      /alternate/,
    );
  }
});
it("accepts inclusive limits without requiring sorted arrays or a recovery after the last crash", () => {
  const form = toDeliveryForm(baselineInput);
  form.messages = "m1, 60000";
  form.processingTimeMs = "1000";
  form.acknowledgmentDelayMs = "1000";
  form.visibilityTimeoutMs = "60000";
  form.maxDeliveryAttempts = "5";
  form.failures = "c1, CRASH, 0";
  form.seed = "-9007199254740991";
  expect(parseDeliveryForm(form, descriptor.limits).errors).toEqual({});
});
