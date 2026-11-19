import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const read = (name) =>
  JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
const api = read("../../contracts/openapi.json"),
  schemas = api.components.schemas;
const derived = read("../src/api/schemas/idempotency-descriptor.schema.json");
const descriptor = read("../../contracts/examples/idempotency-descriptor.json");
const canonical = read("../../contracts/idempotency.descriptor.schema.json");
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
ajv.addSchema(read("../../contracts/idempotency.input.schema.json"));
const apiSchema = (name) =>
  JSON.parse(
    JSON.stringify({ ...schemas[name], $defs: schemas }).replaceAll(
      "#/components/schemas/",
      "#/$defs/",
    ),
  );
const inputValid = ajv.compile(apiSchema("IdempotencyInput"));
const resultValid = ajv.compile(apiSchema("IdempotencyResult"));
const descriptorValid = ajv.compile(derived);
const canonicalValid = ajv.compile(canonical);
const ids = [
  "unprotected-response-loss",
  "split-crash-gap",
  "split-race",
  "atomic-response-loss",
  "atomic-race",
  "payload-conflict",
  "atomic-payload-race",
  "retention-boundary",
  "key-and-tenant-scope",
];
const pairs = ids.map((id) => ({
  id,
  input: read(`../../contracts/examples/idempotency-${id}-input.json`),
  result: read(`../../contracts/examples/idempotency-${id}-result.json`),
}));

test("idempotency HTTP 1.13.0 registers direct GET/POST and complete shared errors", () => {
  assert.equal(api.info.version, "1.13.0");
  const path = "/api/v1/simulations/idempotency",
    get = api.paths[path].get,
    post = api.paths[path + "/runs"].post;
  assert.equal(get.operationId, "getIdempotencyDescriptor");
  assert.equal(post.operationId, "runIdempotency");
  assert.equal(
    get.responses[200].content["application/json"].schema.$ref,
    "#/components/schemas/IdempotencyDescriptor",
  );
  assert.equal(post.requestBody.required, true);
  assert.equal(
    post.requestBody.content["application/json"].schema.$ref,
    "#/components/schemas/IdempotencyInput",
  );
  assert.equal(
    post.responses[200].content["application/json"].schema.$ref,
    "#/components/schemas/IdempotencyResult",
  );
  for (const status of [400, 413, 422, 500, 503])
    assert.equal(
      post.responses[status].content["application/json"].schema.$ref,
      "#/components/schemas/ApiError",
    );
  assert.ok(post.responses[503].headers["Retry-After"]);
  assert.equal(
    schemas.IdempotencyResult.properties.input.$ref,
    "#/components/schemas/IdempotencyInput",
  );
  assert.equal(
    schemas.IdempotencyCallState.properties.resolvedRecordId.$ref,
    "#/components/schemas/IdempotencyRecordIdentifier",
  );
});
test("exported HTTP schemas accept all nine actual configured Java pairs", () => {
  for (const pair of pairs) {
    assert.equal(
      inputValid(pair.input),
      true,
      `${pair.id}: ${JSON.stringify(inputValid.errors)}`,
    );
    assert.equal(
      resultValid(pair.result),
      true,
      `${pair.id}: ${JSON.stringify(resultValid.errors)}`,
    );
    assert.deepEqual(
      descriptor.presets.find((preset) => preset.id === pair.id)?.input,
      pair.input,
    );
  }
});
test("lazy descriptor has exactly its reachable dependencies and accepts the actual Java GET", () => {
  assert.deepEqual(
    Object.keys(derived.$defs).sort(),
    [
      "IdempotencyLimits",
      "IdempotencyPreset",
      "IdempotencyInput",
      "IdempotencyIdentifier",
      "IdempotencyUnits",
      "IdempotencyTimeMs",
      "IdempotencyAction",
      "IdempotencyCall",
      "IdempotencyStep",
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
  assert.equal(
    canonicalValid(descriptor),
    true,
    JSON.stringify(canonicalValid.errors),
  );
  assert.equal(descriptor.defaultPresetId, "unprotected-response-loss");
  assert.deepEqual(
    descriptor.presets.map((preset) => preset.id),
    ids,
  );
});
test("descriptor has eleven exact limits and rejects unknown, nullable or missing fields", () => {
  assert.equal(Object.keys(descriptor.limits).length, 11);
  const mutations = [
    (value) => {
      value.limits.maxCalls = 13;
    },
    (value) => {
      value.limits.maxDerivedIdLength = 40;
    },
    (value) => {
      delete value.limits.minSteps;
    },
    (value) => {
      value.limits.maxBytes = 100;
    },
    (value) => {
      value.schemaVersion = "2.0";
    },
    (value) => {
      value.defaultPresetId = "missing";
    },
    (value) => {
      value.presets.pop();
    },
    (value) => {
      value.presets[0].id = "invented";
    },
    (value) => {
      value.presets[0].description = value.presets[0].question;
    },
    (value) => {
      value.presets[0].input.seed = 1;
    },
    (value) => {
      value.presets[0].input.calls[0].units = "1";
    },
  ];
  for (const key of canonical.required) {
    mutations.push((value) => {
      delete value[key];
    });
    mutations.push((value) => {
      value[key] = null;
    });
  }
  for (const mutate of mutations) {
    const value = structuredClone(descriptor);
    mutate(value);
    assert.equal(descriptorValid(value), false);
    assert.equal(canonicalValid(value), false);
  }
});
test("exported outcomes preserve mode, action, phase and crash history capabilities", () => {
  const atomic = pairs.find(
    (pair) => pair.id === "atomic-response-loss",
  ).result;
  const split = pairs.find((pair) => pair.id === "split-crash-gap").result;
  assert.equal(resultValid(split), true);
  for (const mutate of [
    (value) => {
      const outcome = value.outcomes.find(
        (item) => item.kind === "ATOMIC_COMMITTED",
      );
      delete outcome.postState.calls.find((call) => call.id === outcome.callId)
        .resolvedRecordId;
    },
    (value) => {
      value.outcomes[0].kind = "ATOMIC_COMMITTED";
    },
    (value) => {
      value.outcomes[0].postState.calls[0].receipt = null;
    },
    (value) => {
      value.finalState.calls[0] = structuredClone(split.finalState.calls[0]);
    },
  ]) {
    const value = structuredClone(atomic);
    mutate(value);
    assert.equal(resultValid(value), false);
  }
});
