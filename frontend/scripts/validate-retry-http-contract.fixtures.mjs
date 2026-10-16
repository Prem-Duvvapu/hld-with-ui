import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const read = (name) =>
  JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
const api = read("../../contracts/openapi.json"),
  schemas = api.components.schemas;
const derived = read("../src/api/schemas/retry-descriptor.schema.json");
const descriptor = read(
  "../../contracts/examples/timeouts-retries-descriptor.json",
);
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
const apiSchema = (name) =>
  JSON.parse(
    JSON.stringify({ ...schemas[name], $defs: schemas }).replaceAll(
      "#/components/schemas/",
      "#/$defs/",
    ),
  );
const inputValid = ajv.compile(apiSchema("RetryInput"));
const resultValid = ajv.compile(apiSchema("RetryResult"));
const descriptorValid = ajv.compile(derived);

test("retry exported HTTP components accept all four actual complete Java golden pairs", () => {
  for (const variant of ["baseline", "backoff", "deadline", "jitter"]) {
    const input = read(
      `../../contracts/examples/timeouts-retries-${variant}-input.json`,
    );
    const result = read(
      `../../contracts/examples/timeouts-retries-${variant}-result.json`,
    );
    assert.equal(inputValid(input), true, JSON.stringify(inputValid.errors));
    assert.equal(resultValid(result), true, JSON.stringify(resultValid.errors));
  }
});
test("retry direct paths preserve strict success and shared resource error contracts", () => {
  const path = "/api/v1/simulations/timeouts-retries",
    get = api.paths[path].get,
    post = api.paths[path + "/runs"].post;
  assert.equal(get.operationId, "getRetryDescriptor");
  assert.equal(post.operationId, "runRetry");
  assert.equal(
    get.responses[200].content["application/json"].schema.$ref,
    "#/components/schemas/RetryDescriptor",
  );
  assert.equal(post.requestBody.required, true);
  assert.equal(
    post.requestBody.content["application/json"].schema.$ref,
    "#/components/schemas/RetryInput",
  );
  assert.equal(
    post.responses[200].content["application/json"].schema.$ref,
    "#/components/schemas/RetryResult",
  );
  for (const status of [400, 413, 422, 500, 503])
    assert.equal(
      post.responses[status].content["application/json"].schema.$ref,
      "#/components/schemas/ApiError",
    );
  assert.ok(post.responses[503].headers["Retry-After"]);
  assert.equal(
    schemas.RetryResult.properties.input.$ref,
    "#/components/schemas/RetryInput",
  );
  assert.equal(
    schemas.RetryRequestState.properties.id.$ref,
    "#/components/schemas/RetryIdentifier",
  );
  assert.equal(
    schemas.RetryEvent.properties.attemptId.$ref,
    "#/components/schemas/RetryAttemptIdentifier",
  );
});
test("retry descriptor artifact includes only its five reachable internal dependencies and accepts actual Java GET", () => {
  assert.deepEqual(
    Object.keys(derived.$defs).sort(),
    [
      "RetryIdentifier",
      "RetryRequest",
      "RetryInput",
      "RetryLimits",
      "RetryPreset",
    ].sort(),
  );
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.$ref === "string") {
      assert.ok(value.$ref.startsWith("#/$defs/"), value.$ref);
      assert.ok(
        Object.hasOwn(derived.$defs, value.$ref.slice("#/$defs/".length)),
        value.$ref,
      );
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(derived);
  assert.equal(
    descriptorValid(descriptor),
    true,
    JSON.stringify(descriptorValid.errors),
  );
  assert.equal(descriptor.presets.length, 8);
  assert.equal(descriptor.presets[0].id, "late-work");
});
test("retry descriptor keeps all thirteen derived limits and rejects missing or invented fields", () => {
  assert.deepEqual(
    Object.keys(descriptor.limits).sort(),
    [
      "maxSafeSeed",
      "maxWorkers",
      "maxQueueCapacity",
      "maxRequests",
      "maxArrivalTimeMs",
      "maxServiceTimeMs",
      "maxAttemptTimeoutMs",
      "maxOverallTimeoutMs",
      "maxAttempts",
      "maxDelayMs",
      "maxRetryBudget",
      "maxUnavailableUntilMs",
      "maxIdLength",
    ].sort(),
  );
  for (const mutate of [
    (value) => {
      value.limits.maxAttempts = 6;
    },
    (value) => {
      value.limits.maxSafeSeed += 1;
    },
    (value) => {
      delete value.limits.maxIdLength;
    },
    (value) => {
      value.limits.maxCallbacks = 192;
    },
    (value) => {
      value.defaultInput = value.presets[0].input;
    },
    (value) => {
      value.presets[0].invented = true;
    },
    (value) => {
      value.presets[0].input.cancelServerWork = true;
    },
    (value) => {
      value.presets.pop();
    },
  ]) {
    const value = structuredClone(descriptor);
    mutate(value);
    assert.equal(descriptorValid(value), false);
  }
});
test("retry exported event categories retain actual versus proposed timing and reject cross-kind fields", () => {
  const result = read(
    "../../contracts/examples/timeouts-retries-deadline-result.json",
  );
  const blocked = result.events.find(
    (event) => event.kind === "RETRY_BLOCKED_BY_DEADLINE",
  );
  assert.ok(blocked);
  const value = structuredClone(result);
  value.events.find(
    (event) => event.kind === "RETRY_BLOCKED_BY_DEADLINE",
  ).retryAtMs = blocked.proposedRetryAtMs;
  assert.equal(resultValid(value), false);
  const input = structuredClone(descriptor.presets[0].input);
  input.requests[0].arrivalTimeMs = "0";
  assert.equal(inputValid(input), false);
});
