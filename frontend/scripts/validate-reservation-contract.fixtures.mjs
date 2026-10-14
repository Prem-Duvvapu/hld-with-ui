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
const inputSchema = read("transactions-isolation.input.schema.json");
const resultSchema = read("transactions-isolation.result.schema.json");
// Register the canonical input before resolving result input/identity references.
const validators = {
  input: ajv.compile(inputSchema),
  result: ajv.compile(resultSchema),
};
const examples = Object.fromEntries(
  ["baseline", "protected"].map((scenario) => [
    scenario,
    Object.fromEntries(
      ["input", "result"].map((kind) => [
        kind,
        read(`examples/transactions-isolation-${scenario}-${kind}.json`),
      ]),
    ),
  ]),
);
function valid(kind, value) {
  assert.equal(
    validators[kind](value),
    true,
    JSON.stringify(validators[kind].errors),
  );
}
function rejects(kind, title, mutate, keyword, scenario = "baseline") {
  test(`reservation schema rejects ${title}`, () => {
    const value = structuredClone(examples[scenario][kind]);
    mutate(value);
    assert.equal(validators[kind](value), false, title);
    if (keyword)
      assert.ok(
        validators[kind].errors.some((issue) => issue.keyword === keyword),
        JSON.stringify(validators[kind].errors),
      );
  });
}

for (const scenario of ["baseline", "protected"])
  test(`actual Java ${scenario} reservation input and full serialization satisfy canonical contracts`, () => {
    valid("input", examples[scenario].input);
    valid("result", examples[scenario].result);
    assert.deepEqual(examples[scenario].result.input, examples[scenario].input);
  });

test("unsafe completed golden remains valid above initial stock with first violating step evidence", () => {
  const { input, result } = examples.baseline;
  assert.equal(input.initialUnits, 1);
  assert.equal(result.status, "completed");
  assert.equal(result.metrics.acceptedReservations, 2);
  assert.equal(result.finalState.remainingUnits, 0);
  assert.equal(result.finalState.allocatedUnits, 2);
  assert.ok(result.finalState.allocatedUnits > input.initialUnits);
  assert.deepEqual(result.finalState.invariants, {
    remainingNonnegative: true,
    allocatedWithinCapacity: false,
    unitsConserved: false,
    accountedUnits: 2,
  });
  assert.equal(result.metrics.invariantStatus, "VIOLATED");
  assert.equal(result.metrics.firstViolationStepId, "attempt-b");
  valid("result", result);
});
test("protected rejection retains the earlier observation while reporting a current-state decision", () => {
  const result = examples.protected.result;
  const actor = result.finalState.reservations.find(
    (actor) => actor.id === "b",
  );
  const rejection = result.outcomes.find(
    (outcome) => outcome.kind === "RESERVATION_REJECTED",
  );
  assert.equal(actor.status, "REJECTED");
  assert.equal(actor.observedRemaining, 1);
  assert.equal(rejection.checkedRemaining, 0);
  assert.equal(rejection.checkSource, "CURRENT");
  assert.equal(rejection.rejectionReason, "INSUFFICIENT_STOCK");
  assert.equal(Object.hasOwn(rejection, "observedRemaining"), false);
  assert.equal(Object.hasOwn(result.metrics, "firstViolationStepId"), false);
  valid("result", result);
});
test("maximum actor/step/quantity/identifier input boundaries and zero inventory remain structurally valid", () => {
  const input = structuredClone(examples.baseline.input);
  input.initialUnits = 20;
  input.reservations = Array.from({ length: 4 }, (_, i) => ({
    id: `r${i}${"x".repeat(30)}`,
    quantity: 20,
  }));
  input.schedule = ["READ", "ATTEMPT_RESERVE"].flatMap((action, phase) =>
    input.reservations.map((actor, i) => ({
      id: `s${phase}${i}${"x".repeat(29)}`,
      reservationId: actor.id,
      action,
    })),
  );
  valid("input", input);
  valid("input", { ...input, initialUnits: 0 });
});
test("declared state bounds admit unsafe totals without pretending a structural fixture is executed Java", () => {
  // This synthetic boundary snapshot tests schema ranges only; Java owns arithmetic/history semantics.
  const state = structuredClone(examples.baseline.result.finalState);
  state.remainingUnits = 20;
  state.allocatedUnits = 80;
  state.invariants.accountedUnits = 100;
  const validateState = ajv.compile({
    $ref: `${resultSchema.$id}#/$defs/state`,
  });
  assert.equal(
    validateState(state),
    true,
    JSON.stringify(validateState.errors),
  );
});

rejects(
  "input",
  "unknown root controls",
  (input) => {
    input.seed = 42;
  },
  "additionalProperties",
);
rejects(
  "input",
  "unsupported schema versions",
  (input) => {
    input.schemaVersion = "2.0";
  },
  "const",
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
  "named database isolation levels instead of supported strategies",
  (input) => {
    input.strategy = "SERIALIZABLE";
  },
  "enum",
);
rejects(
  "input",
  "null initial inventory",
  (input) => {
    input.initialUnits = null;
  },
  "type",
);
rejects(
  "input",
  "numeric strings for initial inventory",
  (input) => {
    input.initialUnits = "1";
  },
  "type",
);
rejects(
  "input",
  "fractional inventory",
  (input) => {
    input.initialUnits = 0.5;
  },
  "type",
);
rejects(
  "input",
  "inventory below zero",
  (input) => {
    input.initialUnits = -1;
  },
  "minimum",
);
rejects(
  "input",
  "inventory above twenty",
  (input) => {
    input.initialUnits = 21;
  },
  "maximum",
);
rejects(
  "input",
  "null reservation collections",
  (input) => {
    input.reservations = null;
  },
  "type",
);
rejects(
  "input",
  "fewer than two reservation actors",
  (input) => {
    input.reservations.pop();
  },
  "minItems",
);
rejects(
  "input",
  "more than four reservation actors",
  (input) => {
    input.reservations = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`,
      quantity: 1,
    }));
  },
  "maxItems",
);
rejects(
  "input",
  "unknown reservation fields",
  (input) => {
    input.reservations[0].tenant = "alpha";
  },
  "additionalProperties",
);
rejects(
  "input",
  "zero requested quantity",
  (input) => {
    input.reservations[0].quantity = 0;
  },
  "minimum",
);
rejects(
  "input",
  "quantity above twenty",
  (input) => {
    input.reservations[0].quantity = 21;
  },
  "maximum",
);
rejects(
  "input",
  "boolean requested quantity",
  (input) => {
    input.reservations[0].quantity = true;
  },
  "type",
);
rejects(
  "input",
  "reservation identities with trailing newlines",
  (input) => {
    input.reservations[0].id += "\n";
  },
  "not",
);
rejects(
  "input",
  "identities longer than thirty-two characters",
  (input) => {
    input.reservations[0].id = "a".repeat(33);
  },
  "maxLength",
);
rejects(
  "input",
  "uppercase schedule identities",
  (input) => {
    input.schedule[0].id = "READ-A";
  },
  "pattern",
);
rejects(
  "input",
  "malformed referenced identities",
  (input) => {
    input.schedule[0].reservationId = "a ";
  },
  "not",
);
rejects(
  "input",
  "a null schedule",
  (input) => {
    input.schedule = null;
  },
  "type",
);
rejects(
  "input",
  "fewer than four scheduled actions",
  (input) => {
    input.schedule.pop();
  },
  "minItems",
);
rejects(
  "input",
  "more than eight scheduled actions",
  (input) => {
    input.schedule = Array.from({ length: 9 }, (_, i) => ({
      id: `s${i}`,
      reservationId: "a",
      action: "READ",
    }));
  },
  "maxItems",
);
rejects(
  "input",
  "unknown schedule actions",
  (input) => {
    input.schedule[0].action = "COMMIT";
  },
  "enum",
);
rejects(
  "input",
  "fabricated schedule timestamps",
  (input) => {
    input.schedule[0].timeMs = 0;
  },
  "additionalProperties",
);
rejects(
  "input",
  "missing schedule subject",
  (input) => {
    delete input.schedule[0].reservationId;
  },
  "required",
);
rejects(
  "result",
  "an unsupported result kind",
  (result) => {
    result.kind = "benchmark";
  },
  "const",
);
rejects(
  "result",
  "invented limited prefixes",
  (result) => {
    result.status = "limited";
  },
  "const",
);
rejects(
  "result",
  "a mismatched simulation identity",
  (result) => {
    result.simulationId = "data-access-models";
  },
  "const",
);
rejects(
  "result",
  "fabricated elapsed time",
  (result) => {
    result.lastVirtualTimeMs = 4;
  },
  "additionalProperties",
);
rejects(
  "result",
  "unknown captured-input fields through the canonical owner reference",
  (result) => {
    result.input.seed = 42;
  },
  "additionalProperties",
);
rejects(
  "result",
  "coerced captured-input inventory",
  (result) => {
    result.input.initialUnits = "1";
  },
  "type",
);
rejects(
  "result",
  "unknown outcome kinds",
  (result) => {
    result.outcomes[0].kind = "TRANSACTION_COMMITTED";
  },
  "enum",
);
rejects(
  "result",
  "a READ outcome missing its observed count",
  (result) => {
    delete result.outcomes[0].observedRemaining;
  },
  "required",
);
rejects(
  "result",
  "attempt decision fields attached to READ",
  (result) => {
    result.outcomes[0].checkedRemaining = 1;
  },
  "not",
);
rejects(
  "result",
  "an attempt action claimed by a READ outcome",
  (result) => {
    result.outcomes[0].action = "ATTEMPT_RESERVE";
  },
  "const",
);
rejects(
  "result",
  "per-outcome observed count attached to acceptance",
  (result) => {
    result.outcomes[2].observedRemaining = 1;
  },
  "not",
);
rejects(
  "result",
  "acceptance missing its checked count",
  (result) => {
    delete result.outcomes[2].checkedRemaining;
  },
  "required",
);
rejects(
  "result",
  "acceptance missing its decision source",
  (result) => {
    delete result.outcomes[2].checkSource;
  },
  "required",
);
rejects(
  "result",
  "acceptance missing requested quantity",
  (result) => {
    delete result.outcomes[2].quantity;
  },
  "required",
);
rejects(
  "result",
  "unsupported decision sources",
  (result) => {
    result.outcomes[2].checkSource = "REPLICA";
  },
  "enum",
);
rejects(
  "result",
  "a rejection reason attached to acceptance",
  (result) => {
    result.outcomes[2].rejectionReason = "INSUFFICIENT_STOCK";
  },
  "not",
);
rejects(
  "result",
  "rejection missing its business reason",
  (result) => {
    delete result.outcomes[3].rejectionReason;
  },
  "required",
  "protected",
);
rejects(
  "result",
  "an unknown rejection reason",
  (result) => {
    result.outcomes[3].rejectionReason = "NETWORK_TIMEOUT";
  },
  "const",
  "protected",
);
rejects(
  "result",
  "the loss of an accepted actor's retained observation",
  (result) => {
    delete result.finalState.reservations[0].observedRemaining;
  },
  "required",
);
rejects(
  "result",
  "the loss of a rejected actor's retained observation",
  (result) => {
    delete result.finalState.reservations[1].observedRemaining;
  },
  "required",
  "protected",
);
rejects(
  "result",
  "the loss of a READ actor's retained observation",
  (result) => {
    delete result.outcomes[0].postState.reservations[0].observedRemaining;
  },
  "required",
);
rejects(
  "result",
  "an unread actor supplied with an invented observation",
  (result) => {
    result.initialState.reservations[0].observedRemaining = 0;
  },
  "not",
);
rejects(
  "result",
  "null observation fields instead of omission",
  (result) => {
    result.finalState.reservations[0].observedRemaining = null;
  },
  "type",
);
rejects(
  "result",
  "an incomplete final reservation actor",
  (result) => {
    result.finalState.reservations[0].status = "READ_OBSERVED";
  },
  "enum",
);
rejects(
  "result",
  "an initially accepted actor",
  (result) => {
    result.initialState.reservations[0].status = "ACCEPTED";
    result.initialState.reservations[0].observedRemaining = 1;
  },
  "const",
);
rejects(
  "result",
  "negative remaining stock",
  (result) => {
    result.outcomes[2].postState.remainingUnits = -1;
  },
  "minimum",
);
rejects(
  "result",
  "allocated units beyond the bounded four actors",
  (result) => {
    result.finalState.allocatedUnits = 81;
  },
  "maximum",
);
rejects(
  "result",
  "accounted units beyond the conservative bound",
  (result) => {
    result.finalState.invariants.accountedUnits = 101;
  },
  "maximum",
);
rejects(
  "result",
  "coerced invariant flags",
  (result) => {
    result.finalState.invariants.unitsConserved = "false";
  },
  "type",
);
rejects(
  "result",
  "unknown snapshot fields",
  (result) => {
    result.finalState.lockOwner = "a";
  },
  "additionalProperties",
);
rejects(
  "result",
  "malformed allocation identities through canonical references",
  (result) => {
    result.finalState.allocations[0].reservationId = "a\n";
  },
  "not",
);
rejects(
  "result",
  "an allocation missing its originating step",
  (result) => {
    delete result.finalState.allocations[0].stepId;
  },
  "required",
);
rejects(
  "result",
  "a zero allocation quantity",
  (result) => {
    result.finalState.allocations[0].quantity = 0;
  },
  "minimum",
);
rejects(
  "result",
  "zero outcome sequence",
  (result) => {
    result.outcomes[0].sequence = 0;
  },
  "minimum",
);
rejects(
  "result",
  "outcome sequence beyond eight",
  (result) => {
    result.outcomes[0].sequence = 9;
  },
  "maximum",
);
rejects(
  "result",
  "fewer than four returned outcomes",
  (result) => {
    result.outcomes.pop();
  },
  "minItems",
);
rejects(
  "result",
  "more than eight returned outcomes",
  (result) => {
    result.outcomes = Array.from({ length: 9 }, () =>
      structuredClone(result.outcomes[0]),
    );
  },
  "maxItems",
);
rejects(
  "result",
  "violated metrics without first-step evidence",
  (result) => {
    delete result.metrics.firstViolationStepId;
  },
  "required",
);
rejects(
  "result",
  "preserved metrics carrying invented first-violation evidence",
  (result) => {
    result.metrics.firstViolationStepId = "attempt-b";
  },
  "not",
  "protected",
);
rejects(
  "result",
  "null first-violation evidence",
  (result) => {
    result.metrics.firstViolationStepId = null;
  },
  "type",
);
rejects(
  "result",
  "unknown metric fields",
  (result) => {
    result.metrics.latencyMs = 1;
  },
  "additionalProperties",
);
rejects(
  "result",
  "accepted reservation count above four",
  (result) => {
    result.metrics.acceptedReservations = 5;
  },
  "maximum",
);
rejects(
  "result",
  "unbounded explanations",
  (result) => {
    result.outcomes[0].explanation = "x".repeat(601);
  },
  "maxLength",
);
rejects(
  "result",
  "unbounded assumptions",
  (result) => {
    result.assumptions = Array(13).fill("A bounded model assumption.");
  },
  "maxItems",
);
