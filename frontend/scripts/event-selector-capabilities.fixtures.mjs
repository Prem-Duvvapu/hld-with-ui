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
