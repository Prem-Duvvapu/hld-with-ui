import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const read = (name) =>
  JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
const api = read("../../contracts/openapi.json"),
  schemas = api.components.schemas;
const derived = read("../src/api/schemas/atomicity-descriptor.schema.json");
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
const inputValid = ajv.compile(apiSchema("AtomicityInput"));
const resultValid = ajv.compile(apiSchema("AtomicityResult"));
const descriptorValid = ajv.compile(derived);
const baseline = read(
  "../../contracts/examples/transaction-atomicity-baseline-input.json",
);
const protectedInput = read(
  "../../contracts/examples/transaction-atomicity-protected-input.json",
);
const descriptor = {
  id: "transaction-atomicity",
  title: "Atomicity & Abort",
  kind: "simulation",
  modelVersion: "1.0.0",
  description:
    "Structural descriptor metadata; model evidence comes from actual Java examples.",
  limits: {
    maxInitialUnits: 20,
    minTransactions: 1,
    maxTransactions: 3,
    maxQuantity: 20,
    minSteps: 2,
    maxSteps: 12,
    maxIdLength: 32,
  },
  presets: [
    {
      id: "baseline",
      title: "Split abort",
      description: "Separate public writes.",
      input: baseline,
    },
    {
      id: "protected-baseline",
      title: "Private abort",
      description: "Discard unpublished work.",
      input: protectedInput,
    },
  ],
  assumptions: [
    "Illustrative local model; no database engine or durability guarantee.",
  ],
};
test("atomicity exported HTTP schemas accept all four actual complete Java golden pairs", () => {
  for (const variant of ["baseline", "protected", "conflict", "max-boundary"]) {
    const input = read(
      `../../contracts/examples/transaction-atomicity-${variant}-input.json`,
    );
    const result = read(
      `../../contracts/examples/transaction-atomicity-${variant}-result.json`,
    );
    assert.equal(inputValid(input), true, JSON.stringify(inputValid.errors));
    assert.equal(resultValid(result), true, JSON.stringify(resultValid.errors));
  }
});
test("atomicity direct paths preserve strict response and resource status mappings", () => {
  const path = "/api/v1/simulations/transaction-atomicity",
    get = api.paths[path].get,
    post = api.paths[path + "/runs"].post;
  assert.equal(get.operationId, "getAtomicityDescriptor");
  assert.equal(post.operationId, "runAtomicity");
  assert.equal(
    get.responses[200].content["application/json"].schema.$ref,
    "#/components/schemas/AtomicityDescriptor",
  );
  assert.equal(post.requestBody.required, true);
  assert.equal(
    post.requestBody.content["application/json"].schema.$ref,
    "#/components/schemas/AtomicityInput",
  );
  assert.equal(
    post.responses[200].content["application/json"].schema.$ref,
    "#/components/schemas/AtomicityResult",
  );
  for (const status of [400, 413, 422, 503, 500])
    assert.equal(
      post.responses[status].content["application/json"].schema.$ref,
      "#/components/schemas/ApiError",
    );
  assert.ok(post.responses[503].headers["Retry-After"]);
  assert.equal(
    schemas.AtomicityResult.properties.input.$ref,
    "#/components/schemas/AtomicityInput",
  );
  assert.equal(
    schemas.AtomicityTransactionState.properties.id.$ref,
    "#/components/schemas/AtomicityIdentifier",
  );
});
test("atomicity descriptor artifact has exactly its six reachable dependencies and internal references", () => {
  assert.deepEqual(
    Object.keys(derived.$defs).sort(),
    [
      "AtomicityIdentifier",
      "AtomicityTransaction",
      "AtomicityStep",
      "AtomicityInput",
      "AtomicityLimits",
      "AtomicityPreset",
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
});
test("atomicity descriptor export keeps all seven exact Java limits and closed preset metadata", () => {
  for (const mutate of [
    (v) => {
      v.defaultInput = baseline;
    },
    (v) => {
      v.limits.minSteps = 1;
    },
    (v) => {
      v.limits.maxTransactions = 4;
    },
    (v) => {
      delete v.limits.minSteps;
    },
    (v) => {
      v.presets[0].question = "Unknown metadata";
    },
    (v) => {
      delete v.presets[0].description;
    },
    (v) => {
      v.presets[0].input.initialUnits = "1";
    },
    (v) => {
      v.presets[0].id += "\n";
    },
  ]) {
    const value = structuredClone(descriptor);
    mutate(value);
    assert.equal(descriptorValid(value), false, JSON.stringify(value));
  }
});
test("atomicity exported result preserves closed stock/revision/private and history conditionals", () => {
  for (const [variant, mutate] of [
    [
      "baseline",
      (v) => {
        delete v.metrics.firstViolationStepId;
      },
    ],
    [
      "baseline",
      (v) => {
        v.outcomes[0].checkedRemaining = 1;
      },
    ],
    [
      "protected",
      (v) => {
        v.finalState.transactions[0].workingRemaining = 0;
      },
    ],
    [
      "conflict",
      (v) => {
        delete v.outcomes.at(-1).actualRevision;
      },
    ],
    [
      "conflict",
      (v) => {
        v.outcomes.at(-1).action = "ABORT";
      },
    ],
  ]) {
    const value = read(
      `../../contracts/examples/transaction-atomicity-${variant}-result.json`,
    );
    mutate(value);
    assert.equal(resultValid(value), false, JSON.stringify(value));
  }
});
