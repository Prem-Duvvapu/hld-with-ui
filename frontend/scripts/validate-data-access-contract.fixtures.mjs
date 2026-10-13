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
// The result's captured input and row identities refer to this canonical registered owner.
const validators = {
  input: ajv.compile(read("data-access.input.schema.json")),
  result: ajv.compile(read("data-access.result.schema.json")),
};
const examples = {
  input: read("examples/data-access-baseline-input.json"),
  result: read("examples/data-access-baseline-result.json"),
};
function valid(kind, value) {
  assert.equal(
    validators[kind](value),
    true,
    JSON.stringify(validators[kind].errors),
  );
}
function rejects(kind, title, mutate, keyword) {
  test(`data access schema rejects ${title}`, () => {
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
function insertResult(accepted) {
  // A structural fixture, not claimed as an executed Java experiment. The baseline above is actual Java output.
  const result = structuredClone(examples.result);
  const row = {
    id: "b5",
    tenant: "beta",
    businessKey: accepted ? "k5" : "k2",
    createdOrder: 25,
  };
  result.input.operations = [{ id: "op1", kind: "INSERT", row }];
  const work = Object.fromEntries(
    Object.keys(result.totals).map((name) => [name, 0]),
  );
  work.primaryKeyLookups = 1;
  work.businessKeyChecks = 1;
  if (accepted) {
    work.baseWrites = 1;
    work.secondaryIndexWrites = 1;
    work.businessKeyWrites = 1;
    result.finalRows.push(row);
  }
  result.totals = { ...work };
  result.outcomes = [
    {
      operationId: "op1",
      kind: "INSERT",
      accessPath: "INSERT",
      candidateIds: [],
      matchedIds: [],
      returnedIds: [],
      recordCountBefore: 12,
      recordCountAfter: accepted ? 13 : 12,
      work,
      explanation: "A structural insert fixture.",
      accepted,
      ...(accepted
        ? {}
        : { conflict: { reason: "DUPLICATE_BUSINESS_KEY", recordId: "b2" } }),
    },
  ];
  return result;
}

test("actual Java data access baseline input and full serialized result satisfy canonical contracts", () => {
  valid("input", examples.input);
  valid("result", examples.result);
});
test("all four closed operation variants, empty initial tables and disabled scoped uniqueness are structurally supported", () => {
  valid("input", {
    ...examples.input,
    rows: [],
    enforceBusinessKey: false,
    operations: [
      { id: "point", kind: "LOOKUP_ID", rowId: "missing" },
      {
        id: "tenant",
        kind: "TENANT_RANGE",
        tenant: "beta",
        fromCreatedOrder: 0,
        toCreatedOrder: 1000000,
        limit: 1,
      },
      {
        id: "global",
        kind: "ALL_RANGE",
        fromCreatedOrder: 0,
        toCreatedOrder: 1000000,
        limit: 20,
      },
      {
        id: "write",
        kind: "INSERT",
        row: { id: "b5", tenant: "beta", businessKey: "k5", createdOrder: 25 },
      },
    ],
  });
});
test("maximum authored row/operation/identifier/ordering boundaries remain valid", () => {
  const input = structuredClone(examples.input);
  input.rows = Array.from({ length: 20 }, (_, i) => ({
    id: `r${i}`,
    tenant: "t" + "x".repeat(31),
    businessKey: `k${i}`,
    createdOrder: 1000000,
  }));
  input.operations = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    kind: "ALL_RANGE",
    fromCreatedOrder: 0,
    toCreatedOrder: 1000000,
    limit: 20,
  }));
  valid("input", input);
});
test("accepted and conflicting insert structural fixtures preserve the conditional outcome shape", () => {
  valid("result", insertResult(true));
  valid("result", insertResult(false));
});
test("work totals admit ten operations rather than applying one-operation bounds", () => {
  const result = structuredClone(examples.result);
  // A schema-bound fixture only; Java semantic tests reconcile real totals with outcomes.
  Object.assign(result.totals, {
    primaryKeyLookups: 10,
    indexSeeks: 10,
    indexEntriesExamined: 300,
    baseRowsExamined: 300,
    matchedRows: 300,
    returnedRows: 200,
    baseWrites: 10,
    secondaryIndexWrites: 10,
    businessKeyChecks: 10,
    businessKeyWrites: 10,
  });
  valid("result", result);
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
  "unsupported schema version",
  (input) => {
    input.schemaVersion = "2.0";
  },
  "const",
);
rejects(
  "input",
  "unsupported model version",
  (input) => {
    input.modelVersion = "2.0.0";
  },
  "const",
);
rejects(
  "input",
  "unsupported index order",
  (input) => {
    input.indexOrder = "COVERING";
  },
  "enum",
);
rejects(
  "input",
  "coerced uniqueness flags",
  (input) => {
    input.enforceBusinessKey = "true";
  },
  "type",
);
rejects(
  "input",
  "null rows",
  (input) => {
    input.rows = null;
  },
  "type",
);
rejects(
  "input",
  "more than twenty initial rows",
  (input) => {
    input.rows = Array.from({ length: 21 }, (_, i) => ({
      ...input.rows[0],
      id: `r${i}`,
    }));
  },
  "maxItems",
);
rejects(
  "input",
  "no operations",
  (input) => {
    input.operations = [];
  },
  "minItems",
);
rejects(
  "input",
  "more than ten operations",
  (input) => {
    input.operations = Array.from({ length: 11 }, (_, i) => ({
      ...input.operations[0],
      id: `q${i}`,
    }));
  },
  "maxItems",
);
rejects(
  "input",
  "identifiers with trailing newlines",
  (input) => {
    input.rows[0].tenant += "\n";
  },
  "not",
);
rejects(
  "input",
  "identifiers longer than thirty-two characters",
  (input) => {
    input.rows[0].id = "a".repeat(33);
  },
  "maxLength",
);
rejects(
  "input",
  "unknown row fields",
  (input) => {
    input.rows[0].createdTimeMs = 10;
  },
  "additionalProperties",
);
rejects(
  "input",
  "numeric strings for ordering keys",
  (input) => {
    input.rows[0].createdOrder = "10";
  },
  "type",
);
rejects(
  "input",
  "fractional ordering keys",
  (input) => {
    input.rows[0].createdOrder = 0.5;
  },
  "type",
);
rejects(
  "input",
  "ordering keys above the declared ceiling",
  (input) => {
    input.rows[0].createdOrder = 1000001;
  },
  "maximum",
);
rejects(
  "input",
  "mixed operation fields",
  (input) => {
    input.operations[0].rowId = "b2";
  },
  "additionalProperties",
);
rejects(
  "input",
  "missing required range fields",
  (input) => {
    delete input.operations[0].tenant;
  },
  "required",
);
rejects(
  "input",
  "query limits above twenty",
  (input) => {
    input.operations[0].limit = 21;
  },
  "maximum",
);
rejects(
  "input",
  "zero query limits",
  (input) => {
    input.operations[0].limit = 0;
  },
  "minimum",
);
rejects(
  "input",
  "unknown operation kinds",
  (input) => {
    input.operations[0].kind = "DELETE";
  },
  "const",
);
rejects(
  "result",
  "invented latency metrics",
  (result) => {
    result.latencyMs = 1;
  },
  "additionalProperties",
);
rejects(
  "result",
  "unsupported result kind",
  (result) => {
    result.kind = "benchmark";
  },
  "const",
);
rejects(
  "result",
  "invented limited runs",
  (result) => {
    result.status = "limited";
  },
  "const",
);
rejects(
  "result",
  "noncanonical captured input fields",
  (result) => {
    result.input.seed = 0;
  },
  "additionalProperties",
);
rejects(
  "result",
  "more than thirty final rows",
  (result) => {
    result.finalRows = Array.from({ length: 31 }, (_, i) => ({
      ...result.finalRows[0],
      id: `r${i}`,
    }));
  },
  "maxItems",
);
rejects(
  "result",
  "duplicate candidate IDs",
  (result) => {
    result.outcomes[0].candidateIds.push(result.outcomes[0].candidateIds[0]);
  },
  "uniqueItems",
);
rejects(
  "result",
  "acceptance on a query",
  (result) => {
    result.outcomes[0].accepted = true;
  },
  "not",
);
rejects(
  "result",
  "conflict on a query",
  (result) => {
    result.outcomes[0].conflict = { reason: "DUPLICATE_ID", recordId: "b2" };
  },
  "not",
);
rejects(
  "result",
  "insert access path on a range query",
  (result) => {
    result.outcomes[0].accessPath = "INSERT";
  },
  "enum",
);
rejects(
  "result",
  "negative work",
  (result) => {
    result.outcomes[0].work.baseRowsExamined = -1;
  },
  "minimum",
);
rejects(
  "result",
  "fractional work",
  (result) => {
    result.outcomes[0].work.indexSeeks = 0.5;
  },
  "type",
);
rejects(
  "result",
  "per-operation examined counts over thirty",
  (result) => {
    result.outcomes[0].work.indexEntriesExamined = 31;
  },
  "maximum",
);
rejects(
  "result",
  "totals over the finite workload ceiling",
  (result) => {
    result.totals.baseRowsExamined = 301;
  },
  "maximum",
);
rejects(
  "result",
  "unknown work fields",
  (result) => {
    result.totals.physicalPageReads = 1;
  },
  "additionalProperties",
);
for (const [title, mutate, keyword] of [
  [
    "insert without acceptance",
    (outcome) => {
      delete outcome.accepted;
    },
    "required",
  ],
  [
    "accepted insert carrying a conflict",
    (outcome) => {
      outcome.conflict = { reason: "DUPLICATE_ID", recordId: "b2" };
    },
    "not",
  ],
  [
    "insert carrying candidate IDs",
    (outcome) => {
      outcome.candidateIds = ["b2"];
    },
    "maxItems",
  ],
]) {
  test(`data access schema rejects ${title}`, () => {
    const value = insertResult(true);
    mutate(value.outcomes[0]);
    assert.equal(validators.result(value), false);
    assert.ok(
      validators.result.errors.some((issue) => issue.keyword === keyword),
      JSON.stringify(validators.result.errors),
    );
  });
}
test("data access schema rejects a rejected insert without its conflict reason", () => {
  const value = insertResult(false);
  delete value.outcomes[0].conflict;
  assert.equal(validators.result(value), false);
  assert.ok(
    validators.result.errors.some((issue) => issue.keyword === "required"),
  );
});
