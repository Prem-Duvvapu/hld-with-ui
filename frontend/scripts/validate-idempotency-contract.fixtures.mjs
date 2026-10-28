import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const read = (name) =>
  JSON.parse(
    readFileSync(new URL(`../../contracts/${name}`, import.meta.url), "utf8"),
  );
const inputSchema = read("idempotency.input.schema.json");
const resultSchema = read("idempotency.result.schema.json");
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
const validators = {
  input: ajv.compile(inputSchema),
  result: ajv.compile(resultSchema),
};
for (const name of ["call", "step"])
  validators[name] = ajv.compile({ $ref: `${inputSchema.$id}#/$defs/${name}` });
for (const name of [
  "state",
  "callState",
  "effect",
  "receipt",
  "keyRecord",
  "outcome",
  "metrics",
])
  validators[name] = ajv.compile({
    $ref: `${resultSchema.$id}#/$defs/${name}`,
  });

const scenarios = [
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
const examples = Object.fromEntries(
  scenarios.map((id) => [
    id,
    Object.fromEntries(
      ["input", "result"].map((kind) => [
        kind,
        read(`examples/idempotency-${id}-${kind}.json`),
      ]),
    ),
  ]),
);
const results = Object.values(examples).map((pair) => pair.result);
const outcomes = results.flatMap((run) => run.outcomes);
const states = results.flatMap((run) => [
  run.initialState,
  ...run.outcomes.map((outcome) => outcome.postState),
  run.finalState,
]);
const calls = states.flatMap((state) => state.calls);
const sampleOf = (predicate) => {
  const value = calls.find(predicate);
  assert.ok(
    value,
    "actual Java examples must contain the requested call-state category",
  );
  return value;
};
const outcomeOf = (kind) => {
  const value = outcomes.find((outcome) => outcome.kind === kind);
  assert.ok(value, `actual Java examples must contain outcome ${kind}`);
  return value;
};
const samples = {
  input: examples["unprotected-response-loss"].input,
  result: examples["atomic-response-loss"].result,
  call: examples["unprotected-response-loss"].input.calls[0],
  step: examples["unprotected-response-loss"].input.schedule[0],
  state: examples["atomic-response-loss"].result.initialState,
  callState: sampleOf(
    (call) => call.phase === "RESULT_READY" && call.resolution === "EXECUTED",
  ),
  effect: states.flatMap((state) => state.effects)[0],
  receipt: calls.find((call) => call.receipt)?.receipt,
  keyRecord: states.flatMap((state) => state.keyRecords)[0],
  outcome: outcomeOf("ATOMIC_COMMITTED"),
  metrics: examples["atomic-response-loss"].result.metrics,
};
function valid(kind, value) {
  assert.equal(
    validators[kind](value),
    true,
    JSON.stringify(validators[kind].errors),
  );
}
function reject(kind, title, mutate, sample = samples[kind]) {
  test(`idempotency standalone contract rejects ${title}`, () => {
    assert.ok(sample, `missing actual Java sample for ${title}`);
    const value = structuredClone(sample);
    mutate(value);
    assert.equal(validators[kind](value), false, title);
  });
}

for (const [id, pair] of Object.entries(examples))
  test(`actual Java idempotency ${id} input and result satisfy standalone contracts`, () => {
    valid("input", pair.input);
    valid("result", pair.result);
    assert.deepEqual(pair.result.input, pair.input);
    assert.equal(pair.result.outcomes.length, pair.input.schedule.length);
    assert.deepEqual(
      pair.result.finalState,
      pair.result.outcomes.at(-1).postState,
    );
    assert.deepEqual(
      pair.result.outcomes.map((outcome) => ({
        id: outcome.stepId,
        callId: outcome.callId,
        timeMs: outcome.timeMs,
        action: outcome.action,
      })),
      pair.input.schedule,
    );
    assert.equal(Object.hasOwn(pair.result, "seed"), false);
    assert.equal(Object.hasOwn(pair.result, "randomAlgorithm"), false);
  });

test("actual Java idempotency examples cover all sixteen declared outcome kinds and all call phases", () => {
  assert.deepEqual(
    [...new Set(outcomes.map((value) => value.kind))].sort(),
    [...resultSchema.$defs.outcome.properties.kind.enum].sort(),
  );
  assert.deepEqual(
    [...new Set(calls.map((call) => call.phase))].sort(),
    [...resultSchema.$defs.callState.properties.phase.enum].sort(),
  );
  for (const outcome of outcomes) valid("outcome", outcome);
  for (const state of states) valid("state", state);
});

test("actual Java retained-key replay preserves the original receipt and later expiry does not erase its historical reference", () => {
  const replay = examples["atomic-response-loss"].result.finalState.calls;
  assert.deepEqual(replay[1].receipt, replay[0].receipt);
  assert.equal(replay[1].publishedEffectId, undefined);
  const boundary = examples["retention-boundary"].result.finalState;
  const expired = boundary.keyRecords.find(
    (record) => record.status === "EXPIRED",
  );
  assert.ok(expired);
  const historicalReplay = boundary.calls.find(
    (call) => call.resolution === "REPLAYED",
  );
  assert.equal(historicalReplay.resolvedRecordId, expired.id);
  assert.deepEqual(historicalReplay.receipt, expired.receipt);
  valid("callState", historicalReplay);
  valid("result", examples["retention-boundary"].result);
});

test("actual Java private preparation and late save conflict remain separate from public effects and received receipts", () => {
  const prepared = sampleOf(
    (call) => call.phase === "WORK_DONE" && call.pendingUnits > 0,
  );
  assert.equal(prepared.publishedEffectId, undefined);
  assert.equal(prepared.receipt, undefined);
  valid("callState", prepared);
  const conflict = sampleOf(
    (call) => call.resolution === "RESULT_SAVE_CONFLICT",
  );
  assert.ok(conflict.publishedEffectId);
  assert.ok(conflict.resolvedRecordId);
  assert.equal(conflict.receipt, undefined);
  valid("callState", conflict);
});

test("crash state shape permits retained execution/replay history while requiring private work and cached receipts to be cleared", () => {
  // These are local field-capability checks, not invented execution results. Java semantic
  // tests separately execute crashes after publication and after a remembered replay.
  for (const resolution of ["EXECUTED", "REPLAYED"]) {
    const history = structuredClone(
      sampleOf(
        (call) =>
          call.resolution === resolution && call.phase === "RESULT_READY",
      ),
    );
    history.phase = "CRASHED";
    delete history.receipt;
    valid("callState", history);
  }
});

for (const [kind, schema] of [
  ["input", inputSchema],
  ["call", inputSchema.$defs.call],
  ["step", inputSchema.$defs.step],
  ["result", resultSchema],
  ...[
    "state",
    "callState",
    "effect",
    "receipt",
    "keyRecord",
    "outcome",
    "metrics",
  ].map((kind) => [kind, resultSchema.$defs[kind]]),
]) {
  reject(kind, `unknown ${kind} field`, (value) => {
    value.unmodeled = true;
  });
  for (const field of schema.required ?? []) {
    reject(kind, `missing ${kind}.${field}`, (value) => {
      delete value[field];
    });
    reject(kind, `null ${kind}.${field}`, (value) => {
      value[field] = null;
    });
  }
}

for (const name of ["schemaVersion", "modelVersion"])
  reject("input", `unsupported input ${name}`, (value) => {
    value[name] = "9.9";
  });
for (const name of [
  "simulationId",
  "schemaVersion",
  "modelVersion",
  "kind",
  "status",
])
  reject("result", `unsupported result ${name}`, (value) => {
    value[name] = "unsupported";
  });
for (const value of [0, -1, 10001, 1.5, "1", true])
  reject(
    "input",
    `retention bound or type ${JSON.stringify(value)}`,
    (input) => {
      input.retentionMs = value;
    },
  );
for (const value of ["none", "UNKNOWN", true])
  reject("input", `unknown mode ${JSON.stringify(value)}`, (input) => {
    input.mode = value;
  });
for (const field of ["calls", "schedule"])
  reject("input", `nonarray input ${field}`, (input) => {
    input[field] = {};
  });
for (const size of [0, 13])
  reject("input", `input calls size ${size}`, (input) => {
    input.calls = Array(size).fill(input.calls[0]);
  });
for (const size of [0, 1, 49])
  reject("input", `input schedule size ${size}`, (input) => {
    input.schedule = Array(size).fill(input.schedule[0]);
  });
for (const value of [0, -1, 1001, 1.5, "1", true])
  reject(
    "call",
    `call units bound or type ${JSON.stringify(value)}`,
    (call) => {
      call.units = value;
    },
  );
for (const value of [-1, 10001, 0.5, "0", true])
  reject("step", `step time bound or type ${JSON.stringify(value)}`, (step) => {
    step.timeMs = value;
  });
for (const value of ["lookup", "UNKNOWN", "BEGIN", true])
  reject("step", `step action ${JSON.stringify(value)}`, (step) => {
    step.action = value;
  });

for (const [kind, field] of [
  ["call", "id"],
  ["call", "operationId"],
  ["call", "tenantId"],
  ["call", "key"],
  ["step", "id"],
  ["step", "callId"],
])
  for (const value of [
    "",
    "A",
    "1a",
    "a\n",
    " a",
    "a ",
    "é",
    "a".repeat(33),
    true,
    1,
  ])
    reject(
      kind,
      `invalid ${kind}.${field} ${JSON.stringify(value)}`,
      (item) => {
        item[field] = value;
      },
    );

for (const field of [
  "lookupDisposition",
  "observedRecordId",
  "resolvedRecordId",
  "publishedEffectId",
  "receipt",
  "resolution",
])
  reject("callState", `explicit null optional call ${field}`, (call) => {
    call[field] = null;
  });
reject("callState", "unknown call phase", (call) => {
  call.phase = "OPEN";
});
reject("callState", "unknown lookup disposition", (call) => {
  call.lookupDisposition = "FOUND";
});
reject("callState", "unknown resolution", (call) => {
  call.resolution = "SUCCESS";
});
for (const field of [
  "lookupDisposition",
  "observedRecordId",
  "resolvedRecordId",
  "publishedEffectId",
  "receipt",
  "resolution",
])
  reject(
    "callState",
    `fabricated initial call ${field}`,
    (call) => {
      call[field] = samples.callState[field] ?? "record-a";
    },
    samples.state.calls[0],
  );
reject(
  "callState",
  "initial private units",
  (call) => {
    call.pendingUnits = 1;
  },
  samples.state.calls[0],
);
reject("callState", "started call without lookup evidence", (call) => {
  delete call.lookupDisposition;
});
reject(
  "callState",
  "missing-key observation with fabricated observed record",
  (call) => {
    call.observedRecordId = "record-a";
  },
  sampleOf((call) => call.lookupDisposition === "MISSING"),
);
for (const field of [
  "observedRecordId",
  "resolvedRecordId",
  "receipt",
  "resolution",
])
  reject(
    "callState",
    `matched lookup missing ${field}`,
    (call) => {
      delete call[field];
    },
    sampleOf(
      (call) =>
        call.phase === "LOOKED_UP" && call.lookupDisposition === "MATCHED",
    ),
  );
reject(
  "callState",
  "lookup miss inventing a result",
  (call) => {
    call.receipt = samples.receipt;
  },
  sampleOf(
    (call) =>
      call.phase === "LOOKED_UP" && call.lookupDisposition === "MISSING",
  ),
);
reject(
  "callState",
  "lookup publishing an effect",
  (call) => {
    call.publishedEffectId = "effect-a";
  },
  sampleOf((call) => call.phase === "LOOKED_UP"),
);
reject(
  "callState",
  "prepared work claiming a public effect too",
  (call) => {
    call.publishedEffectId = "effect-a";
  },
  sampleOf((call) => call.pendingUnits > 0),
);
reject(
  "callState",
  "private preparation losing both pending units and published effect",
  (call) => {
    call.pendingUnits = 0;
  },
  sampleOf((call) => call.pendingUnits > 0),
);
reject(
  "callState",
  "public work losing its effect identity",
  (call) => {
    delete call.publishedEffectId;
  },
  sampleOf((call) => call.phase === "WORK_DONE" && call.publishedEffectId),
);
reject(
  "callState",
  "replay inventing its own published effect",
  (call) => {
    call.publishedEffectId = "effect-b";
  },
  sampleOf((call) => call.resolution === "REPLAYED"),
);
reject(
  "callState",
  "payload conflict inventing a receipt",
  (call) => {
    call.receipt = samples.receipt;
  },
  sampleOf((call) => call.resolution === "PAYLOAD_CONFLICT"),
);
reject(
  "callState",
  "save conflict losing its earlier effect",
  (call) => {
    delete call.publishedEffectId;
  },
  sampleOf((call) => call.resolution === "RESULT_SAVE_CONFLICT"),
);
reject(
  "callState",
  "save conflict claiming receipt success",
  (call) => {
    call.receipt = samples.receipt;
  },
  sampleOf((call) => call.resolution === "RESULT_SAVE_CONFLICT"),
);
reject(
  "callState",
  "crashed call keeping private units",
  (call) => {
    call.pendingUnits = 1;
  },
  sampleOf((call) => call.phase === "CRASHED"),
);
reject(
  "callState",
  "crashed call keeping a cached receipt",
  (call) => {
    call.receipt = samples.receipt;
  },
  sampleOf((call) => call.phase === "CRASHED"),
);
for (const phase of ["RESULT_READY", "RESPONDED", "RESPONSE_LOST"])
  reject(
    "callState",
    `${phase} losing its ready resolution`,
    (call) => {
      delete call.resolution;
    },
    sampleOf((call) => call.phase === phase),
  );
for (const field of ["receipt", "publishedEffectId"])
  reject("callState", `uncrashed executed call missing ${field}`, (call) => {
    delete call[field];
  });

for (const field of ["effectId", "units"])
  reject(
    "receipt",
    `receipt inventing current call identity through ${field}`,
    (receipt) => {
      receipt[field] = field === "effectId" ? "a" : 0;
    },
  );
reject("receipt", "receipt including a changing call ID", (receipt) => {
  receipt.callId = "b";
});
for (const value of ["a", "effect-", "effect-a\n", `effect-${"a".repeat(33)}`])
  reject(
    "effect",
    `invalid derived effect identity ${JSON.stringify(value)}`,
    (effect) => {
      effect.id = value;
    },
  );
for (const value of ["a", "record-", "record-a\n", `record-${"a".repeat(33)}`])
  reject(
    "keyRecord",
    `invalid derived record identity ${JSON.stringify(value)}`,
    (record) => {
      record.id = value;
    },
  );
for (const value of [0, -1, 20001, 0.5, "100"])
  reject(
    "keyRecord",
    `record expiry bound or type ${JSON.stringify(value)}`,
    (record) => {
      record.expiresAtMs = value;
    },
  );
reject("keyRecord", "unknown retained-record status", (record) => {
  record.status = "DELETED";
});

for (const kind of resultSchema.$defs.outcome.properties.kind.enum)
  reject(
    "outcome",
    `${kind} with incompatible action`,
    (outcome) => {
      outcome.action = outcome.action === "LOOKUP" ? "RESPOND" : "LOOKUP";
    },
    outcomeOf(kind),
  );
for (const value of [0, 49, 1.5, "1"])
  reject(
    "outcome",
    `outcome sequence bound or type ${JSON.stringify(value)}`,
    (outcome) => {
      outcome.sequence = value;
    },
  );
reject("outcome", "unknown outcome kind", (outcome) => {
  outcome.kind = "EFFECT_COMMITTED";
});
for (const field of ["calls", "effects", "keyRecords"])
  reject("state", `state ${field} exceeds maximum`, (state) => {
    state[field] = Array(13).fill(
      samples[
        field === "calls"
          ? "callState"
          : field === "effects"
            ? "effect"
            : "keyRecord"
      ],
    );
  });
reject("state", "state missing every call", (state) => {
  state.calls = [];
});
for (const field of ["activeKeyCount", "expiredKeyCount"])
  reject("state", `state ${field} exceeds maximum`, (state) => {
    state[field] = 13;
  });
reject("state", "state units exceed maximum", (state) => {
  state.publishedUnits = 12001;
});
for (const name of Object.keys(resultSchema.$defs.metrics.properties))
  for (const value of [-1, 1.5, "1"])
    reject(
      "metrics",
      `metrics ${name} invalid ${JSON.stringify(value)}`,
      (metrics) => {
        metrics[name] = value;
      },
    );

reject("result", "initial state containing an already started call", (run) => {
  run.initialState.calls[0] = structuredClone(samples.callState);
});
reject("result", "initial state containing published work", (run) => {
  run.initialState.effects = [structuredClone(samples.effect)];
});
reject("result", "final state containing a live call", (run) => {
  run.finalState.calls[0] = structuredClone(run.initialState.calls[0]);
});
for (const size of [0, 1, 49])
  reject("result", `outcome count ${size}`, (run) => {
    run.outcomes = Array(size).fill(run.outcomes[0]);
  });
for (const mode of ["NO_DEDUP", "SPLIT_EFFECT_RECORD"])
  reject("result", `captured ${mode} mode borrowing atomic outcomes`, (run) => {
    run.input.mode = mode;
  });
reject(
  "result",
  "unprotected mode inventing retained key evidence",
  (run) => {
    run.outcomes[0].postState.keyRecords = [structuredClone(samples.keyRecord)];
  },
  examples["unprotected-response-loss"].result,
);
reject(
  "result",
  "split mode claiming private preparation",
  (run) => {
    run.outcomes.find((outcome) => outcome.kind === "EFFECT_PUBLISHED").kind =
      "EFFECT_PREPARED";
  },
  examples["split-race"].result,
);
reject("result", "atomic mode claiming split public-write outcome", (run) => {
  run.outcomes.find((outcome) => outcome.kind === "EFFECT_PREPARED").kind =
    "EFFECT_PUBLISHED";
});
for (const [scenario, kind] of [
  ["atomic-response-loss", "ATOMIC_COMMITTED"],
  ["split-race", "RESULT_STORED"],
])
  reject(
    "result",
    `${kind} losing its saved-record identity`,
    (run) => {
      const outcome = run.outcomes.find((item) => item.kind === kind);
      const call = outcome.postState.calls.find(
        (item) => item.id === outcome.callId,
      );
      delete call.resolvedRecordId;
    },
    examples[scenario].result,
  );

const splitCrash = examples["split-crash-gap"].result.finalState.calls.find(
  (call) => call.phase === "CRASHED",
);
reject(
  "result",
  "atomic crash claiming a public effect without commit history",
  (run) => {
    assert.ok(splitCrash.publishedEffectId);
    assert.equal(splitCrash.resolution, undefined);
    assert.equal(splitCrash.resolvedRecordId, undefined);
    run.finalState.calls[0] = structuredClone(splitCrash);
  },
);

test("mode-specific crash shape keeps split effects and atomic commit history without cached receipts", () => {
  valid("result", examples["split-crash-gap"].result);
  // Local capability validation only: Java tests separately execute this crash. The
  // published effect and saved record remain historical facts after receipt loss.
  for (const scenario of ["atomic-response-loss", "split-race"]) {
    const run = structuredClone(examples[scenario].result);
    const call = run.finalState.calls.find(
      (item) => item.resolution === "EXECUTED",
    );
    call.phase = "CRASHED";
    delete call.receipt;
    valid("result", run);
    const withoutRecord = structuredClone(run);
    delete withoutRecord.finalState.calls.find((item) => item.id === call.id)
      .resolvedRecordId;
    assert.equal(validators.result(withoutRecord), false);
  }
});
