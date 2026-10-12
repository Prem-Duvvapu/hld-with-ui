import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const read = (name) =>
  JSON.parse(
    readFileSync(new URL(`../../contracts/${name}`, import.meta.url), "utf8"),
  );
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
const validators = Object.fromEntries(
  ["input", "result"].map((kind) => [
    kind,
    ajv.compile(read(`queue-delivery.${kind}.schema.json`)),
  ]),
);
const examples = Object.fromEntries(
  ["input", "result"].map((kind) => [
    kind,
    read(`examples/queue-delivery-baseline-${kind}.json`),
  ]),
);

function rejects(kind, title, mutate, keyword) {
  test(`delivery schema rejects ${title}`, () => {
    const value = structuredClone(examples[kind]);
    mutate(value);
    assert.equal(validators[kind](value), false, title);
    if (keyword)
      assert.ok(
        validators[kind].errors.some((issue) => issue.keyword === keyword),
        JSON.stringify(validators[kind].errors),
      );
  });
}

test("actual Java delivery baseline input and serialized result satisfy standalone contracts", () => {
  for (const kind of ["input", "result"])
    assert.equal(
      validators[kind](examples[kind]),
      true,
      JSON.stringify(validators[kind].errors),
    );
});

test("delivery input preserves both signed JavaScript-safe seed boundaries", () => {
  for (const seed of [-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER])
    assert.equal(validators.input({ ...examples.input, seed }), true);
});

rejects(
  "input",
  "unknown root controls",
  (input) => {
    input.deduplicate = true;
  },
  "additionalProperties",
);
rejects(
  "input",
  "unknown message fields",
  (input) => {
    input.messages[0].payload = "invented";
  },
  "additionalProperties",
);
rejects(
  "input",
  "message IDs with trailing newlines",
  (input) => {
    input.messages[0].id = "m1\n";
  },
  "not",
);
rejects(
  "input",
  "consumer IDs with trailing newlines",
  (input) => {
    input.consumers[0].id = "c1\n";
  },
  "not",
);
rejects(
  "input",
  "numeric strings for ACK delays",
  (input) => {
    input.acknowledgmentDelayMs = "5";
  },
  "type",
);
rejects(
  "input",
  "null fault schedules",
  (input) => {
    input.failures = null;
  },
  "type",
);
rejects(
  "input",
  "unsupported model versions",
  (input) => {
    input.modelVersion = "2.0.0";
  },
  "const",
);
rejects(
  "input",
  "unsupported ACK policy",
  (input) => {
    input.acknowledgmentPolicy = "EXACTLY_ONCE";
  },
  "enum",
);
rejects(
  "input",
  "more than eight total failure actions",
  (input) => {
    input.failures = Array.from({ length: 9 }, (_, timeMs) => ({
      consumerId: "c1",
      action: timeMs % 2 ? "RECOVER" : "CRASH",
      timeMs,
    }));
  },
  "maxItems",
);
rejects(
  "input",
  "out-of-range lost ACK attempts",
  (input) => {
    input.lostAcknowledgments = [{ messageId: "m1", attempt: 6 }];
  },
  "maximum",
);
rejects(
  "input",
  "unsafe seeds",
  (input) => {
    input.seed = Number.MAX_SAFE_INTEGER + 1;
  },
  "maximum",
);

const event = (result, kind) => {
  const found = result.events.find((candidate) => candidate.kind === kind);
  assert.ok(found, `actual baseline must emit ${kind}`);
  return found;
};
rejects(
  "result",
  "unknown result fields",
  (result) => {
    result.providerDelivered = true;
  },
  "additionalProperties",
);
rejects(
  "result",
  "unsupported event vocabulary",
  (result) => {
    result.events[0].kind = "effect.exactly-once";
  },
  "enum",
);
rejects(
  "result",
  "an attempt identity on message enqueue",
  (result) => {
    event(result, "message.enqueued").attemptId = "m1-a1";
  },
  "type",
);
rejects(
  "result",
  "delivery without its consumer identity",
  (result) => {
    delete event(result, "delivery.started").consumerId;
  },
  "required",
);
rejects(
  "result",
  "effect commit without its ledger append",
  (result) => {
    delete event(result, "effect.committed").ledgerEntry;
  },
  "required",
);
rejects(
  "result",
  "ledger append on an ACK event",
  (result) => {
    event(result, "ack.sent").ledgerEntry = result.ledger[0];
  },
  "type",
);
rejects(
  "result",
  "an ACK without typed post-event attempt changes",
  (result) => {
    event(result, "ack.sent").changes.attempts = [];
  },
  "minItems",
);
rejects(
  "result",
  "unknown state-delta fields",
  (result) => {
    result.events[0].changes.deletedAttempts = [];
  },
  "additionalProperties",
);
rejects(
  "result",
  "attempt IDs with trailing newlines",
  (result) => {
    event(result, "delivery.started").attemptId = "m1-a1\n";
  },
  "not",
);
rejects(
  "result",
  "committed attempt without its effect timestamp",
  (result) => {
    delete result.attemptOutcomes[0].effectCommittedAtMs;
  },
  "required",
);
rejects(
  "result",
  "accepted ACK without a receipt timestamp",
  (result) => {
    delete result.attemptOutcomes[0].ackResolvedAtMs;
  },
  "required",
);
rejects(
  "result",
  "ACKed message without an observed ACK time",
  (result) => {
    delete result.messageOutcomes[0].acknowledgedAtMs;
  },
  "required",
);
rejects(
  "result",
  "zero-sample ACK latency presented as measured zero",
  (result) => {
    result.metrics.ackLatencySamples = 0;
    result.metrics.meanAckLatencyMs = 0;
  },
  "type",
);
rejects(
  "result",
  "nonempty effect samples without p95",
  (result) => {
    delete result.metrics.p95FirstEffectLatencyMs;
  },
  "required",
);
rejects(
  "result",
  "limited result without its stop reason",
  (result) => {
    result.status = "limited";
    delete result.truncationReason;
  },
  "required",
);
rejects(
  "result",
  "confirmed ACK-without-effect count on a limited prefix",
  (result) => {
    result.status = "limited";
    result.truncationReason = "event_limit";
    result.metrics.acknowledgedWithoutEffect = 0;
  },
  "type",
);
rejects(
  "result",
  "settled result with unknown ACK-without-effect count",
  (result) => {
    delete result.metrics.acknowledgedWithoutEffect;
  },
  "required",
);
rejects(
  "result",
  "completed result claiming unfinished processing",
  (result) => {
    result.metrics.runningEffects = 1;
  },
  "const",
);

test("limited structural contract leaves ACK-without-effect unavailable rather than implying settled loss", () => {
  // Derived schema fixture only: this is not claimed as an executed limited Java run.
  const value = structuredClone(examples.result);
  value.status = "limited";
  value.truncationReason = "event_limit";
  delete value.metrics.acknowledgedWithoutEffect;
  assert.equal(
    validators.result(value),
    true,
    JSON.stringify(validators.result.errors),
  );
  value.metrics.acknowledgedWithoutEffect = null;
  assert.equal(
    validators.result(value),
    true,
    JSON.stringify(validators.result.errors),
  );
});
