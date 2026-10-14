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
const inputSchema = read("transaction-atomicity.input.schema.json");
const resultSchema = read("transaction-atomicity.result.schema.json");
// Register the canonical input before resolving the result's absolute references.
const validators = {
  input: ajv.compile(inputSchema),
  result: ajv.compile(resultSchema),
};
for (const kind of ["outcome", "transactionState"])
  validators[kind] = ajv.compile({
    $ref: `${resultSchema.$id}#/$defs/${kind}`,
  });
const examples = Object.fromEntries(
  ["baseline", "protected", "conflict", "max-boundary"].map((scenario) => [
    scenario,
    Object.fromEntries(
      ["input", "result"].map((kind) => [
        kind,
        read(`examples/transaction-atomicity-${scenario}-${kind}.json`),
      ]),
    ),
  ]),
);
const samples = {
  input: examples.baseline.input,
  result: examples.baseline.result,
  outcome: examples.protected.result.outcomes[1],
  transactionState:
    examples.protected.result.outcomes[0].postState.transactions[0],
};
function valid(kind, value) {
  assert.equal(
    validators[kind](value),
    true,
    JSON.stringify(validators[kind].errors),
  );
}
function reject(kind, title, mutate, sample = samples[kind]) {
  test(`atomicity contract rejects ${title}`, () => {
    const value = structuredClone(sample);
    mutate(value);
    assert.equal(validators[kind](value), false, title);
  });
}

for (const [scenario, pair] of Object.entries(examples))
  test(`actual Java ${scenario} atomicity input and result satisfy canonical contracts`, () => {
    valid("input", pair.input);
    valid("result", pair.result);
    assert.deepEqual(pair.result.input, pair.input);
  });

test("completed split golden retains published stock loss and its first violating step", () => {
  const result = examples.baseline.result;
  assert.equal(result.status, "completed");
  assert.equal(result.finalState.remainingUnits, 0);
  assert.equal(result.finalState.transactions[0].appliedStockUnits, 1);
  assert.equal(result.finalState.transactions[0].failureReason, "USER_ABORT");
  assert.equal(result.finalState.invariants.unitsConserved, false);
  assert.equal(result.finalState.invariants.abortedEffectsAbsent, false);
  assert.equal(result.metrics.firstViolationStepId, "decrement-a");
  valid("result", result);
});
test("protected abort golden keeps shared data and removes private workspace while retaining base", () => {
  const result = examples.protected.result;
  const staged = result.outcomes[1].postState.transactions[0];
  assert.equal(staged.pendingStockUnits, 1);
  assert.equal(staged.workingRemaining, 0);
  const terminal = result.finalState.transactions[0];
  assert.equal(terminal.baseRemaining, 1);
  assert.equal(terminal.baseRevision, 0);
  assert.equal(terminal.pendingStockUnits, 0);
  assert.equal(Object.hasOwn(terminal, "workingRemaining"), false);
  assert.equal(Object.hasOwn(terminal, "pendingAllocation"), false);
  assert.equal(result.finalState.remainingUnits, 1);
  assert.equal(result.metrics.invariantStatus, "PRESERVED");
  assert.equal(Object.hasOwn(result.metrics, "firstViolationStepId"), false);
});
test("actual conflict carries paired revision evidence and preserves the winner's publication", () => {
  const result = examples.conflict.result;
  const rejection = result.outcomes.at(-1);
  assert.equal(rejection.kind, "TRANSACTION_ABORTED");
  assert.equal(rejection.reason, "REVISION_CONFLICT");
  assert.equal(rejection.expectedRevision, 0);
  assert.equal(rejection.actualRevision, 1);
  assert.deepEqual(result.finalState.allocations, [
    {
      transactionId: "a",
      quantity: 1,
      preparedAtStepId: "record-a",
      publishedAtStepId: "commit-a",
    },
  ]);
  assert.equal(result.finalState.transactions[1].baseRevision, 0);
  assert.equal(
    Object.hasOwn(result.finalState.transactions[1], "pendingAllocation"),
    false,
  );
});
test("actual maximum boundary covers three actors, twelve steps and quantity twenty", () => {
  const { input, result } = examples["max-boundary"];
  assert.equal(input.initialUnits, 20);
  assert.equal(input.transactions.length, 3);
  assert.equal(input.schedule.length, 12);
  assert.ok(
    input.transactions.every(
      (actor) => actor.quantity === 20 && actor.id.length === 32,
    ),
  );
  assert.ok(input.schedule.every((step) => step.id.length === 32));
  assert.equal(result.outcomes.length, 12);
  assert.equal(result.finalState.allocatedUnits, 20);
});
test("two-step early abort and zero initial stock are valid bounded input shapes", () => {
  const input = structuredClone(samples.input);
  input.initialUnits = 0;
  input.schedule.splice(1, 1);
  valid("input", input);
});
for (const kind of ["input", "result"])
  for (const value of [null, true, [], "input"])
    test(`atomicity ${kind} rejects root ${JSON.stringify(value)}`, () => {
      assert.equal(validators[kind](value), false);
    });

for (const [title, field, value] of [
  ["unknown control", "retry", true],
  ["null mode", "mode", null],
  ["unknown mode", "mode", "SERIALIZABLE"],
  ["wrong schema version", "schemaVersion", "2.0"],
  ["wrong model version", "modelVersion", "2.0.0"],
  ["coerced stock", "initialUnits", "1"],
  ["fractional stock", "initialUnits", 0.5],
  ["negative stock", "initialUnits", -1],
  ["stock above twenty", "initialUnits", 21],
  ["null transactions", "transactions", null],
  ["null schedule", "schedule", null],
])
  reject("input", title, (v) => {
    v[field] = value;
  });
for (const field of Object.keys(samples.input))
  reject("input", `missing ${field}`, (v) => {
    delete v[field];
  });
for (const value of [0, 21, 1.5, "1", null])
  reject("input", `invalid quantity ${JSON.stringify(value)}`, (v) => {
    v.transactions[0].quantity = value;
  });
for (const value of ["A", "a\n", "a\r\n", "a ", "é", "a".repeat(33), "", null])
  reject("input", `invalid ASCII actor ID ${JSON.stringify(value)}`, (v) => {
    v.transactions[0].id = value;
  });
reject("input", "empty actors", (v) => {
  v.transactions = [];
});
reject("input", "four actors", (v) => {
  v.transactions = Array(4).fill(v.transactions[0]);
});
reject("input", "one-step schedule", (v) => {
  v.schedule = [v.schedule[0]];
});
reject("input", "thirteen-step schedule", (v) => {
  v.schedule = Array(13).fill(v.schedule[0]);
});
reject("input", "null actor", (v) => {
  v.transactions[0] = null;
});
reject("input", "null step", (v) => {
  v.schedule[0] = null;
});
reject("input", "extra actor field", (v) => {
  v.transactions[0].priority = 1;
});
reject("input", "extra step field", (v) => {
  v.schedule[0].time = 0;
});
reject("input", "missing step reference", (v) => {
  delete v.schedule[0].transactionId;
});
reject("input", "step reference trailing newline", (v) => {
  v.schedule[0].transactionId = "a\n";
});
reject("input", "step ID trailing newline", (v) => {
  v.schedule[0].id += "\n";
});
reject("input", "undeclared action", (v) => {
  v.schedule[0].action = "RETRY";
});

for (const [field, value] of [
  ["simulationId", "transactions-isolation"],
  ["schemaVersion", "2.0"],
  ["modelVersion", "2.0.0"],
  ["kind", "simulation"],
  ["status", "failed"],
])
  reject("result", `incorrect envelope ${field}`, (v) => {
    v[field] = value;
  });
reject("result", "extra result event stream", (v) => {
  v.events = [];
});
reject("result", "extra captured input controls", (v) => {
  v.input.seed = 1;
});
reject("result", "null outcome", (v) => {
  v.outcomes[0] = null;
});
reject("result", "thirteen outcomes", (v) => {
  v.outcomes = Array(13).fill(v.outcomes[0]);
});
reject("result", "empty outcomes", (v) => {
  v.outcomes = [];
});
reject("result", "nonterminal final state", (v) => {
  v.finalState = structuredClone(v.outcomes[0].postState);
});
reject("result", "prepopulated initial state", (v) => {
  v.initialState.revision = 1;
});
reject("result", "initial broken invariant", (v) => {
  v.initialState.invariants.unitsConserved = false;
});
reject("result", "missing first violation evidence", (v) => {
  delete v.metrics.firstViolationStepId;
});
reject(
  "result",
  "violation evidence on preserved history",
  (v) => {
    v.metrics.firstViolationStepId = "begin-a";
  },
  examples.protected.result,
);
reject("result", "unknown metrics field", (v) => {
  v.metrics.latencyMs = 1;
});
reject("result", "counter above actor bound", (v) => {
  v.metrics.abortedTransactions = 4;
});
reject("result", "allocated total above twenty", (v) => {
  v.finalState.allocatedUnits = 21;
});
reject("result", "accounted total above twenty", (v) => {
  v.finalState.invariants.accountedUnits = 21;
});
reject("result", "revision above six", (v) => {
  v.finalState.revision = 7;
});
reject("result", "nonboolean invariant", (v) => {
  v.finalState.invariants.abortedEffectsAbsent = "false";
});
reject("result", "thirteen assumptions", (v) => {
  v.assumptions = Array(13).fill("Model limit");
});
reject(
  "result",
  "unknown visible allocation field",
  (v) => {
    v.finalState.allocations[0].durable = true;
  },
  examples.conflict.result,
);
reject(
  "result",
  "visible allocation reference trailing newline",
  (v) => {
    v.finalState.allocations[0].publishedAtStepId += "\n";
  },
  examples.conflict.result,
);

const outcomeSamples = Object.fromEntries(
  Object.values(examples)
    .flatMap(({ result }) => result.outcomes)
    .map((outcome) => [outcome.kind, outcome]),
);
// These local variants exercise schema alternatives not present in the four goldens.
// They are not claimed to be Java executions; Java tests cover failure semantics.
outcomeSamples.ALLOCATION_APPLIED = {
  ...structuredClone(outcomeSamples.ALLOCATION_STAGED),
  kind: "ALLOCATION_APPLIED",
};
outcomeSamples.STOCK_REJECTED = {
  ...structuredClone(outcomeSamples.STOCK_STAGED),
  kind: "STOCK_REJECTED",
  reason: "INSUFFICIENT_STOCK",
};
outcomeSamples.WORK_SKIPPED = {
  ...structuredClone(outcomeSamples.ALLOCATION_STAGED),
  kind: "WORK_SKIPPED",
  reason: "INSUFFICIENT_STOCK",
};
for (const [kind, sample] of Object.entries(outcomeSamples)) {
  test(`atomicity local closed ${kind} evidence shape is valid`, () =>
    valid("outcome", sample));
  reject(
    "outcome",
    `${kind} with wrong action`,
    (v) => {
      v.action = v.action === "BEGIN" ? "COMMIT" : "BEGIN";
    },
    sample,
  );
  reject(
    "outcome",
    `${kind} with unrelated fields`,
    (v) => {
      v.attemptId = "a";
    },
    sample,
  );
}
for (const kind of ["STOCK_APPLIED", "STOCK_STAGED", "STOCK_REJECTED"])
  for (const field of ["checkedRemaining", "checkSource"])
    reject(
      "outcome",
      `${kind} missing ${field}`,
      (v) => {
        delete v[field];
      },
      outcomeSamples[kind],
    );
for (const kind of [
  "TRANSACTION_STARTED",
  "ALLOCATION_APPLIED",
  "ALLOCATION_STAGED",
  "WORK_SKIPPED",
  "TRANSACTION_COMMITTED",
  "TRANSACTION_ABORTED",
])
  reject(
    "outcome",
    `${kind} with irrelevant stock evidence`,
    (v) => {
      v.checkedRemaining = 1;
      v.checkSource = "CURRENT";
    },
    outcomeSamples[kind],
  );
for (const kind of ["STOCK_REJECTED", "WORK_SKIPPED", "TRANSACTION_ABORTED"])
  reject(
    "outcome",
    `${kind} without reason`,
    (v) => {
      delete v.reason;
    },
    outcomeSamples[kind],
  );
reject(
  "outcome",
  "applied stock checks working copy",
  (v) => {
    v.checkSource = "WORKING_COPY";
  },
  outcomeSamples.STOCK_APPLIED,
);
reject("outcome", "staged stock checks current state", (v) => {
  v.checkSource = "CURRENT";
});
reject("outcome", "reason on successful stock", (v) => {
  v.reason = "USER_ABORT";
});
reject("outcome", "null checked stock", (v) => {
  v.checkedRemaining = null;
});
reject("outcome", "fractional checked stock", (v) => {
  v.checkedRemaining = 0.5;
});
reject("outcome", "unknown kind", (v) => {
  v.kind = "RETRY";
});
reject("outcome", "sequence outside trace bound", (v) => {
  v.sequence = 13;
});
reject("outcome", "overlong explanation", (v) => {
  v.explanation = "x".repeat(601);
});
reject(
  "outcome",
  "missing actual revision",
  (v) => {
    delete v.actualRevision;
  },
  outcomeSamples.TRANSACTION_COMMITTED,
);
reject(
  "outcome",
  "missing expected revision",
  (v) => {
    delete v.expectedRevision;
  },
  outcomeSamples.TRANSACTION_COMMITTED,
);
reject("outcome", "revision evidence on preparation", (v) => {
  v.expectedRevision = 0;
  v.actualRevision = 0;
});
reject(
  "outcome",
  "revision conflict without pair",
  (v) => {
    delete v.expectedRevision;
    delete v.actualRevision;
  },
  outcomeSamples.TRANSACTION_ABORTED,
);
reject(
  "outcome",
  "revision conflict on explicit abort",
  (v) => {
    v.action = "ABORT";
  },
  outcomeSamples.TRANSACTION_ABORTED,
);
reject(
  "outcome",
  "user abort on commit",
  (v) => {
    v.action = "COMMIT";
  },
  examples.protected.result.outcomes.at(-1),
);
reject(
  "outcome",
  "user abort with revision evidence",
  (v) => {
    v.expectedRevision = 0;
    v.actualRevision = 0;
  },
  examples.protected.result.outcomes.at(-1),
);
for (const action of ["COMMIT", "ABORT"])
  test(`blocked terminal ${action} retains insufficient-stock reason without revision evidence`, () => {
    const terminal = structuredClone(examples.protected.result.outcomes.at(-1));
    terminal.action = action;
    terminal.reason = "INSUFFICIENT_STOCK";
    terminal.postState.transactions[0].failureReason = "INSUFFICIENT_STOCK";
    valid("outcome", terminal);
  });

const initialActor = examples.baseline.result.initialState.transactions[0];
const terminalActor = examples.protected.result.finalState.transactions[0];
const pendingActor =
  examples.conflict.result.outcomes[4].postState.transactions[0];
const blockedActor = {
  ...structuredClone(samples.transactionState),
  phase: "BLOCKED",
  failureReason: "INSUFFICIENT_STOCK",
};
test("local blocked actor shape retains observation without applied or pending effects", () =>
  valid("transactionState", blockedActor));
for (const field of ["baseRemaining", "baseRevision"])
  reject("transactionState", `started actor missing ${field}`, (v) => {
    delete v[field];
  });
for (const field of [
  "baseRemaining",
  "baseRevision",
  "workingRemaining",
  "failureReason",
  "pendingAllocation",
])
  reject(
    "transactionState",
    `not-started actor has ${field}`,
    (v) => {
      v[field] =
        field === "failureReason"
          ? "USER_ABORT"
          : field === "pendingAllocation"
            ? pendingActor.pendingAllocation
            : 0;
    },
    initialActor,
  );
reject("transactionState", "open actor failure reason", (v) => {
  v.failureReason = "USER_ABORT";
});
reject("transactionState", "private actor already published stock", (v) => {
  v.appliedStockUnits = 1;
});
reject(
  "transactionState",
  "blocked actor without reason",
  (v) => {
    delete v.failureReason;
  },
  blockedActor,
);
reject(
  "transactionState",
  "blocked actor wrong reason",
  (v) => {
    v.failureReason = "USER_ABORT";
  },
  blockedActor,
);
reject(
  "transactionState",
  "blocked actor pending stock",
  (v) => {
    v.pendingStockUnits = 1;
  },
  blockedActor,
);
reject(
  "transactionState",
  "blocked actor visible effects",
  (v) => {
    v.appliedStockUnits = 1;
  },
  blockedActor,
);
reject(
  "transactionState",
  "blocked actor pending allocation",
  (v) => {
    v.pendingAllocation = pendingActor.pendingAllocation;
  },
  blockedActor,
);
reject(
  "transactionState",
  "terminal actor missing reason",
  (v) => {
    delete v.failureReason;
  },
  terminalActor,
);
reject(
  "transactionState",
  "terminal working copy",
  (v) => {
    v.workingRemaining = 0;
  },
  terminalActor,
);
reject(
  "transactionState",
  "terminal pending stock",
  (v) => {
    v.pendingStockUnits = 1;
  },
  terminalActor,
);
reject(
  "transactionState",
  "terminal pending allocation",
  (v) => {
    v.pendingAllocation = pendingActor.pendingAllocation;
  },
  terminalActor,
);
reject(
  "transactionState",
  "pending allocation without working copy",
  (v) => {
    delete v.workingRemaining;
  },
  pendingActor,
);
reject(
  "transactionState",
  "pending allocation without stock preparation",
  (v) => {
    v.pendingStockUnits = 0;
  },
  pendingActor,
);
reject(
  "transactionState",
  "unknown pending allocation field",
  (v) => {
    v.pendingAllocation.visible = true;
  },
  pendingActor,
);
reject(
  "transactionState",
  "null retained base",
  (v) => {
    v.baseRemaining = null;
  },
  terminalActor,
);
