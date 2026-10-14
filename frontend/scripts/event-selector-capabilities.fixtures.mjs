import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  eventSupportsSelector,
  kindsSupportingSelectors,
} from "./event-selector-capabilities.mjs";

const read = (name) =>
  JSON.parse(
    readFileSync(new URL(`../../contracts/${name}`, import.meta.url), "utf8"),
  );
const schemas = read("openapi.json").components.schemas;
const checkpoints = read("checkpoints.schema.json");
const delivery = schemas.DeliveryEvent;

test("selector capabilities preserve required non-null legacy operation and job fields", () => {
  assert.equal(
    eventSupportsSelector(schemas.CacheAsideEvent, "cache.fill", "operation"),
    true,
  );
  assert.equal(
    eventSupportsSelector(schemas.QueueCapacityEvent, "job.started", "jobId"),
    true,
  );
  assert.equal(
    eventSupportsSelector(schemas.CacheAsideEvent, "cache.fill", "messageId"),
    false,
  );
  assert.equal(
    eventSupportsSelector(
      schemas.QueueCapacityEvent,
      "job.started",
      "attemptId",
    ),
    false,
  );
});

test("paired delivery selector kinds derive from required non-null conditional fields", () => {
  const target = checkpoints.items.properties.target.oneOf[2];
  const kinds = kindsSupportingSelectors(delivery, ["messageId", "attemptId"]);
  assert.equal(kinds.length, 10);
  assert.deepEqual(kinds, target.properties.kind.enum);
  assert.ok(kinds.includes("message.dead-lettered"));
  for (const kind of [
    "consumer.crashed",
    "consumer.recovered",
    "message.enqueued",
  ])
    assert.equal(eventSupportsSelector(delivery, kind, "attemptId"), false);
  assert.equal(
    eventSupportsSelector(delivery, "message.enqueued", "messageId"),
    true,
  );
  assert.equal(
    eventSupportsSelector(delivery, "consumer.crashed", "messageId"),
    false,
  );
});

test("nullable property presence cannot invent selector capability", () => {
  const nullable = {
    properties: {
      kind: { enum: ["ack.accepted"] },
      messageId: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
  };
  assert.equal(
    eventSupportsSelector(nullable, "ack.accepted", "messageId"),
    false,
  );
  const requiredButNullable = { ...nullable, required: ["messageId"] };
  assert.equal(
    eventSupportsSelector(requiredButNullable, "ack.accepted", "messageId"),
    false,
  );
  const conditional = {
    ...nullable,
    allOf: [
      {
        if: {
          properties: { kind: { const: "ack.accepted" } },
          required: ["kind"],
        },
        then: {
          required: ["messageId"],
          properties: { messageId: { type: "string" } },
        },
      },
    ],
  };
  assert.equal(
    eventSupportsSelector(conditional, "ack.accepted", "messageId"),
    true,
  );
  conditional.allOf[0].then.properties.messageId.type = "null";
  assert.equal(
    eventSupportsSelector(conditional, "ack.accepted", "messageId"),
    false,
  );
});

test("unfamiliar selector condition fails closed instead of guessing", () => {
  const schema = {
    properties: {
      kind: { enum: ["ack.accepted"] },
      messageId: { type: "string" },
    },
    allOf: [
      {
        if: {
          properties: { kind: { const: "ack.accepted" } },
          required: ["kind", "unmodeledField"],
        },
        then: { required: ["messageId"] },
      },
    ],
  };
  assert.equal(
    eventSupportsSelector(schema, "ack.accepted", "messageId"),
    false,
  );
});

test("checkpoint schema accepts delivery dead-letter hyphen while preserving legacy grammar and ranges", () => {
  const ajv = new Ajv2020({ strict: true, strictRequired: false });
  const validatesTarget = ajv.compile(checkpoints.items.properties.target);
  assert.equal(
    validatesTarget({
      messageId: "m1",
      attemptId: "m1-a2",
      kind: "message.dead-lettered",
      occurrence: 1,
    }),
    true,
  );
  assert.equal(
    validatesTarget({ operation: 1, kind: "cache.fill", occurrence: 10001 }),
    true,
  );
  assert.equal(
    validatesTarget({ jobId: "job-1", kind: "job.started", occurrence: 10001 }),
    true,
  );
  assert.equal(
    validatesTarget({
      operation: 1,
      kind: "cache.dead-lettered",
      occurrence: 1,
    }),
    false,
  );
  assert.equal(
    validatesTarget({
      jobId: "job-1",
      kind: "job.dead-lettered",
      occurrence: 1,
    }),
    false,
  );
});

test("data-access kinds derive from required non-null canonical outcome operation identities", () => {
  const target = checkpoints.items.properties.target.oneOf.find((branch) =>
    branch.required.includes("operationId"),
  );
  const references = {
    "#/components/schemas/DataAccessIdentifier": schemas.DataAccessIdentifier,
  };
  assert.deepEqual(
    kindsSupportingSelectors(
      schemas.DataAccessOutcome,
      ["operationId"],
      references,
    ),
    target.properties.kind.enum,
  );
  assert.equal(target.properties.kind.enum.length, 4);
  assert.equal(
    eventSupportsSelector(
      schemas.DataAccessOutcome,
      "TENANT_RANGE",
      "operationId",
    ),
    false,
  );
  assert.equal(
    eventSupportsSelector(
      schemas.DataAccessOutcome,
      "TENANT_RANGE",
      "operationId",
      references,
    ),
    true,
  );
  assert.equal(
    eventSupportsSelector(
      schemas.DataAccessOutcome,
      "INSERT",
      "messageId",
      references,
    ),
    false,
  );
  const optional = structuredClone(schemas.DataAccessOutcome);
  optional.required = optional.required.filter(
    (field) => field !== "operationId",
  );
  assert.equal(
    eventSupportsSelector(optional, "INSERT", "operationId", references),
    false,
  );
});

test("unsupported reference chains, nullable owners, remote references and ref siblings fail closed", () => {
  const evidence = {
    required: ["operationId"],
    properties: {
      kind: { enum: ["INSERT"] },
      operationId: { $ref: "#/$defs/identifier" },
    },
  };
  assert.equal(
    eventSupportsSelector(evidence, "INSERT", "operationId", {
      "#/$defs/identifier": { type: "string" },
    }),
    true,
  );
  for (const owner of [
    { $ref: "#/$defs/second" },
    { type: ["string", "null"] },
    { anyOf: [{ type: "string" }, { type: "null" }] },
    { type: "string", allOf: [{ type: "null" }] },
    { type: "object" },
    null,
  ])
    assert.equal(
      eventSupportsSelector(evidence, "INSERT", "operationId", {
        "#/$defs/identifier": owner,
        "#/$defs/second": { type: "string" },
      }),
      false,
    );
  const unknown = structuredClone(evidence);
  unknown.properties.operationId.$ref =
    "https://unregistered.invalid/identifier";
  assert.equal(
    eventSupportsSelector(unknown, "INSERT", "operationId", {}),
    false,
  );
  const intersection = structuredClone(evidence);
  intersection.properties.operationId.type = "null";
  assert.equal(
    eventSupportsSelector(intersection, "INSERT", "operationId", {
      "#/$defs/identifier": { type: "string" },
    }),
    false,
  );
});

test("data-access target requires its closed operation family and exactly one outcome occurrence", () => {
  const ajv = new Ajv2020({ strict: true, strictRequired: false });
  const validatesTarget = ajv.compile(checkpoints.items.properties.target);
  for (const kind of ["LOOKUP_ID", "TENANT_RANGE", "ALL_RANGE", "INSERT"])
    assert.equal(
      validatesTarget({ operationId: "q1", kind, occurrence: 1 }),
      true,
    );
  for (const value of [
    null,
    [],
    true,
    "q1",
    { operationId: "q1", kind: "TENANT_RANGE", occurrence: 2 },
    { operationId: "q1", kind: "TENANT_RANGE", occurrence: 0 },
    { operationId: "q1", kind: "TENANT_RANGE", occurrence: 1.5 },
    { operationId: "q1", kind: "TENANT_RANGE" },
    { operationId: "q1", kind: "cache.fill", occurrence: 1 },
    { operationId: "q1\n", kind: "TENANT_RANGE", occurrence: 1 },
    { operationId: "a".repeat(33), kind: "TENANT_RANGE", occurrence: 1 },
    { operationId: null, kind: "TENANT_RANGE", occurrence: 1 },
    { operationId: "q1", operation: 1, kind: "TENANT_RANGE", occurrence: 1 },
    { operationId: "q1", jobId: "job-1", kind: "TENANT_RANGE", occurrence: 1 },
    {
      operationId: "q1",
      messageId: "m1",
      attemptId: "m1-a1",
      kind: "TENANT_RANGE",
      occurrence: 1,
    },
    { operationId: "q1", extra: true, kind: "TENANT_RANGE", occurrence: 1 },
  ])
    assert.equal(validatesTarget(value), false, JSON.stringify(value));
});

test("reservation step target kinds derive from its actual required canonical outcome identities", () => {
  const target = checkpoints.items.properties.target.oneOf.find((branch) =>
    branch.required.includes("stepId"),
  );
  const references = {
    "#/components/schemas/ReservationIdentifier": schemas.ReservationIdentifier,
  };
  assert.deepEqual(
    kindsSupportingSelectors(
      schemas.ReservationOutcome,
      ["stepId"],
      references,
    ),
    target.properties.kind.enum,
  );
  assert.equal(target.properties.kind.enum.length, 3);
  for (const kind of target.properties.kind.enum)
    assert.equal(
      eventSupportsSelector(
        schemas.ReservationOutcome,
        kind,
        "stepId",
        references,
      ),
      true,
    );
  assert.equal(
    eventSupportsSelector(
      schemas.ReservationOutcome,
      "READ_OBSERVED",
      "stepId",
    ),
    false,
  );
  assert.equal(
    eventSupportsSelector(
      schemas.ReservationOutcome,
      "READ_OBSERVED",
      "operationId",
      references,
    ),
    false,
  );
  const optional = structuredClone(schemas.ReservationOutcome);
  optional.required = optional.required.filter((field) => field !== "stepId");
  assert.equal(
    eventSupportsSelector(optional, "READ_OBSERVED", "stepId", references),
    false,
  );
  for (const owner of [
    null,
    { type: ["string", "null"] },
    { $ref: "#/components/schemas/ReservationIdentifier" },
  ])
    assert.equal(
      eventSupportsSelector(
        schemas.ReservationOutcome,
        "READ_OBSERVED",
        "stepId",
        {
          "#/components/schemas/ReservationIdentifier": owner,
        },
      ),
      false,
    );
});
test("reservation step target stays closed, unique and separate from every legacy family", () => {
  const ajv = new Ajv2020({ strict: true, strictRequired: false });
  const validatesTarget = ajv.compile(checkpoints.items.properties.target);
  const base = {
    stepId: "attempt-b",
    kind: "RESERVATION_REJECTED",
    occurrence: 1,
  };
  for (const kind of [
    "READ_OBSERVED",
    "RESERVATION_ACCEPTED",
    "RESERVATION_REJECTED",
  ])
    assert.equal(validatesTarget({ ...base, kind }), true);
  assert.equal(validatesTarget({ ...base, stepId: "s".repeat(32) }), true);
  for (const value of [
    null,
    [],
    true,
    "attempt-b",
    {},
    { ...base, occurrence: 0 },
    { ...base, occurrence: 2 },
    { ...base, occurrence: 1.5 },
    { ...base, occurrence: "1" },
    { ...base, stepId: null },
    { ...base, stepId: "attempt-b\n" },
    { ...base, stepId: "s".repeat(33) },
    { ...base, kind: "TENANT_RANGE" },
    { ...base, kind: "reservation.accepted" },
    { ...base, operation: 1 },
    { ...base, jobId: "job-1" },
    { ...base, messageId: "m1", attemptId: "m1-a1" },
    { ...base, operationId: "q1" },
    { ...base, extra: true },
  ])
    assert.equal(validatesTarget(value), false, JSON.stringify(value));
});
