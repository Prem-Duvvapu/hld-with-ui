import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const read = (name) =>
  JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
const api = read("../../contracts/openapi.json");
const schemas = api.components.schemas;
const derived = read("../src/api/schemas/reservation-descriptor.schema.json");
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
function apiSchema(name) {
  return JSON.parse(
    JSON.stringify({ ...schemas[name], $defs: schemas }).replaceAll(
      "#/components/schemas/",
      "#/$defs/",
    ),
  );
}
const validInput = ajv.compile(apiSchema("ReservationInput"));
const validResult = ajv.compile(apiSchema("ReservationResult"));
const validDescriptor = ajv.compile(derived);
const baselineInput = read(
  "../../contracts/examples/transactions-isolation-baseline-input.json",
);
const protectedInput = read(
  "../../contracts/examples/transactions-isolation-protected-input.json",
);
const descriptor = {
  id: "transactions-isolation",
  title: "Transactions & Isolation",
  kind: "simulation",
  modelVersion: "1.0.0",
  description: "A structural descriptor fixture, not captured Java metadata.",
  limits: {
    maxInitialUnits: 20,
    minReservations: 2,
    maxReservations: 4,
    maxQuantity: 20,
    maxSteps: 8,
    maxIdLength: 32,
  },
  presets: [
    {
      id: "unsafe-baseline",
      title: "Unsafe baseline",
      description: "Inspect the saved observation.",
      input: baselineInput,
    },
    {
      id: "protected-baseline",
      title: "Protected baseline",
      description: "Inspect the current-state boundary.",
      input: protectedInput,
    },
  ],
  assumptions: ["These logical strategies do not emulate a database engine."],
};

test("exported reservation HTTP schemas accept both actual complete Java goldens", () => {
  for (const scenario of ["baseline", "protected"]) {
    const input = read(
      `../../contracts/examples/transactions-isolation-${scenario}-input.json`,
    );
    const result = read(
      `../../contracts/examples/transactions-isolation-${scenario}-result.json`,
    );
    assert.equal(validInput(input), true, JSON.stringify(validInput.errors));
    assert.equal(validResult(result), true, JSON.stringify(validResult.errors));
  }
});
test("reservation API paths point to concrete canonical exported input/result and descriptor shapes", () => {
  const path = "/api/v1/simulations/transactions-isolation";
  assert.equal(
    api.paths[path].get.responses[200].content["application/json"].schema.$ref,
    "#/components/schemas/ReservationDescriptor",
  );
  assert.equal(
    api.paths[path + "/runs"].post.requestBody.content["application/json"]
      .schema.$ref,
    "#/components/schemas/ReservationInput",
  );
  assert.equal(
    api.paths[path + "/runs"].post.responses[200].content["application/json"]
      .schema.$ref,
    "#/components/schemas/ReservationResult",
  );
  for (const status of [400, 413, 422, 503])
    assert.equal(
      api.paths[path + "/runs"].post.responses[status].content[
        "application/json"
      ].schema.$ref,
      "#/components/schemas/ApiError",
    );
  assert.equal(
    schemas.ReservationResult.properties.input.$ref,
    "#/components/schemas/ReservationInput",
  );
  assert.equal(
    schemas.ReservationActorState.properties.id.$ref,
    "#/components/schemas/ReservationIdentifier",
  );
});
test("reachable descriptor artifact contains exactly its six dependencies and resolves all refs internally", () => {
  assert.deepEqual(
    Object.keys(derived.$defs).sort(),
    [
      "ReservationIdentifier",
      "ReservationRequest",
      "ReservationStep",
      "ReservationInput",
      "ReservationLimits",
      "ReservationPreset",
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
    validDescriptor(descriptor),
    true,
    JSON.stringify(validDescriptor.errors),
  );
});
test("exported descriptor preserves Java description metadata and rejects invented defaults/limits", () => {
  for (const mutate of [
    (value) => {
      value.defaultInput = baselineInput;
    },
    (value) => {
      value.limits.maxSteps = 9;
    },
    (value) => {
      value.presets[0].question = "An unsupported metadata field.";
    },
    (value) => {
      delete value.presets[0].description;
    },
    (value) => {
      value.presets[0].input.initialUnits = "1";
    },
  ]) {
    const value = structuredClone(descriptor);
    mutate(value);
    assert.equal(validDescriptor(value), false, JSON.stringify(value));
  }
});
test("exported result retains conditional observation and first-violation rules", () => {
  const unsafe = read(
    "../../contracts/examples/transactions-isolation-baseline-result.json",
  );
  const bad = structuredClone(unsafe);
  delete bad.metrics.firstViolationStepId;
  assert.equal(validResult(bad), false);
  const missingObservation = structuredClone(unsafe);
  delete missingObservation.finalState.reservations[0].observedRemaining;
  assert.equal(validResult(missingObservation), false);
  const mixed = structuredClone(unsafe);
  mixed.outcomes[0].checkedRemaining = 1;
  assert.equal(validResult(mixed), false);
});
