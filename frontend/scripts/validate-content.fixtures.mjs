import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import "./validate-delivery-contract.fixtures.mjs";
import "./validate-data-access-contract.fixtures.mjs";
import "./validate-reservation-contract.fixtures.mjs";
import "./validate-reservation-http-contract.fixtures.mjs";
import "./validate-content-atomicity.fixtures.mjs";
import "./validate-retries-contract.fixtures.mjs";
import "./validate-atomicity-http-contract.fixtures.mjs";
import "./event-selector-capabilities.fixtures.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workshopPath = "content/case-studies/url-shortener/workshop.json";

function checkChange(
  change,
  expected,
  changePaths = () => {},
  changeContracts = () => {},
  expectedStatus = 1,
) {
  const fixture = mkdtempSync(join(tmpdir(), "hld-content-"));
  try {
    for (const directory of ["content", "contracts"])
      cpSync(join(root, directory), join(fixture, directory), {
        recursive: true,
      });
    changeContracts(fixture);
    mkdirSync(join(fixture, "frontend/scripts"), { recursive: true });
    for (const script of [
      "validate-content.mjs",
      "event-selector-capabilities.mjs",
    ])
      cpSync(
        join(root, `frontend/scripts/${script}`),
        join(fixture, `frontend/scripts/${script}`),
      );
    symlinkSync(
      join(root, "frontend/node_modules"),
      join(fixture, "frontend/node_modules"),
      "dir",
    );
    const catalog = JSON.parse(
      readFileSync(join(fixture, "content/catalog.json"), "utf8"),
    );
    const workshop = JSON.parse(
      readFileSync(join(fixture, workshopPath), "utf8"),
    );
    const pathsFile = join(fixture, "content/learning-paths.json");
    const paths = JSON.parse(readFileSync(pathsFile, "utf8"));
    changePaths(paths);
    writeFileSync(pathsFile, JSON.stringify(paths));
    change(catalog, workshop);
    writeFileSync(
      join(fixture, "content/catalog.json"),
      JSON.stringify(catalog),
    );
    writeFileSync(join(fixture, workshopPath), JSON.stringify(workshop));
    const result = spawnSync(
      process.execPath,
      [join(fixture, "frontend/scripts/validate-content.mjs")],
      { encoding: "utf8" },
    );
    assert.equal(result.status, expectedStatus, result.stdout + result.stderr);
    assert.match(
      expectedStatus === 0 ? result.stdout : result.stderr,
      expected,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

function rejectChange(...args) {
  checkChange(...args);
}

for (const [variant, kind, mutate] of [
  [
    "protected",
    "input",
    (input) => {
      input.transactions[0].id += "\n";
    },
  ],
  [
    "conflict",
    "result",
    (result) => {
      delete result.outcomes.at(-1).actualRevision;
    },
  ],
])
  test(`canonical checker rejects malformed actual atomicity ${variant} ${kind} evidence`, () => {
    rejectChange(
      () => {},
      new RegExp(`transaction-atomicity-${variant}-${kind}`),
      () => {},
      (fixture) => {
        const path = join(
          fixture,
          `contracts/examples/transaction-atomicity-${variant}-${kind}.json`,
        );
        const example = JSON.parse(readFileSync(path, "utf8"));
        mutate(example);
        writeFileSync(path, JSON.stringify(example));
      },
    );
  });

function rejectQueueExample(kind, change, expected) {
  rejectChange(
    () => {},
    expected,
    () => {},
    (fixture) => {
      const path = join(
        fixture,
        `contracts/examples/queue-capacity-baseline-${kind}.json`,
      );
      const example = JSON.parse(readFileSync(path, "utf8"));
      change(example);
      writeFileSync(path, JSON.stringify(example));
    },
  );
}

test("reject unknown queue model controls", () => {
  rejectQueueExample(
    "input",
    (input) => {
      input.hiddenRetry = true;
    },
    /queue-capacity-baseline-input.*additional properties/,
  );
});

test("reject queue job IDs ending in a newline", () => {
  rejectQueueExample(
    "input",
    (input) => {
      input.jobs[0].id = "job\n";
    },
    /queue-capacity-baseline-input.*must NOT be valid/,
  );
});

test("reject queue worker IDs ending in a newline", () => {
  rejectQueueExample(
    "result",
    (result) => {
      result.initialState.workers[0].id = "worker-1\n";
    },
    /queue-capacity-baseline-result.*must NOT be valid/,
  );
});

test("reject queue service duration with the wrong type", () => {
  rejectQueueExample(
    "input",
    (input) => {
      input.jobs[0].serviceTimeMs = "10";
    },
    /queue-capacity-baseline-input.*must be integer/,
  );
});

test("reject unsupported queue model version", () => {
  rejectQueueExample(
    "input",
    (input) => {
      input.modelVersion = "2.0.0";
    },
    /queue-capacity-baseline-input.*constant/,
  );
});

test("reject an unsafe queue seed before future JavaScript round trips", () => {
  rejectQueueExample(
    "input",
    (input) => {
      input.seed = Number.MAX_SAFE_INTEGER + 1;
    },
    /queue-capacity-baseline-input.*must be <=/,
  );
});

test("reject unrecognized queue trace transitions", () => {
  rejectQueueExample(
    "result",
    (result) => {
      result.events[0].kind = "job.fabricated";
    },
    /queue-capacity-baseline-result.*allowed values/,
  );
});

test("reject queue events without authoritative state", () => {
  rejectQueueExample(
    "result",
    (result) => {
      delete result.events[0].state;
    },
    /queue-capacity-baseline-result.*required property 'state'/,
  );
});

test("reject completed queue outcomes without observed latency", () => {
  rejectQueueExample(
    "result",
    (result) => {
      delete result.outcomes[0].latencyMs;
    },
    /queue-capacity-baseline-result.*required property 'latencyMs'/,
  );
});

test("reject active queue workers without scheduled completion", () => {
  rejectQueueExample(
    "result",
    (result) => {
      delete result.events[0].state.workers[0].scheduledCompletionAtMs;
    },
    /queue-capacity-baseline-result.*required property 'scheduledCompletionAtMs'/,
  );
});

test("reject a waiting queue job assigned to a worker", () => {
  rejectQueueExample(
    "result",
    (result) => {
      result.events.find((event) => event.kind === "job.queued").workerId =
        "worker-1";
    },
    /queue-capacity-baseline-result.*must be null/,
  );
});

test("reject limited queue results without a stopping reason", () => {
  rejectQueueExample(
    "result",
    (result) => {
      result.status = "limited";
      delete result.truncationReason;
    },
    /queue-capacity-baseline-result.*required property 'truncationReason'/,
  );
});

test("reject publication before the full design journey exists", () => {
  rejectChange((catalog, workshop) => {
    catalog.find((entry) => entry.id === "url-shortener").status = "published";
    workshop.stages = workshop.stages.filter((stage) => stage.id !== "defense");
  }, /published workshop missing stage defense/);
});

test("reject mismatched content version", () => {
  rejectChange((_, workshop) => {
    workshop.contentVersion = "2.0.0";
  }, /workshop identity\/version differs/);
});

test("reject unresolved primary source references", () => {
  rejectChange((_, workshop) => {
    workshop.stages[0].sourceIds.push("missing-source");
  }, /unknown source missing-source/);
});

test("reject an unavailable experiment instead of advertising a dead link", () => {
  rejectChange((_, workshop) => {
    workshop.stages[0].experimentLinks[0].topicId = "url-shortener";
  }, /unavailable experiment url-shortener/);
});

test("reject duplicate stage IDs", () => {
  rejectChange((_, workshop) => {
    workshop.stages.push(structuredClone(workshop.stages[0]));
  }, /stages: duplicate requirements/);
});

test("reject derived answer IDs outside storage bounds", () => {
  rejectChange((_, workshop) => {
    workshop.stages[0].rubric[0].id = "a".repeat(100);
  }, /saved activity identity exceeds local answer bounds/);
});

test("reject unsupported workshop fields", () => {
  rejectChange((_, workshop) => {
    workshop.stages[0].simulated = true;
  }, /additional properties/);
});

test("reject cross-case resource paths", () => {
  rejectChange((catalog) => {
    catalog.find((entry) => entry.id === "url-shortener").workshopPath =
      "case-studies/another-case/workshop.json";
  }, /workshopPath must belong to this case study/);
});

test("reject an unresolved source in a later API stage", () => {
  rejectChange((_, workshop) => {
    workshop.stages
      .find((stage) => stage.id === "api")
      .sourceIds.push("missing-api-source");
  }, /unknown source missing-api-source/);
});

test("reject estimates linked to a draft case instead of a working estimator", () => {
  rejectChange((_, workshop) => {
    workshop.stages.find(
      (stage) => stage.id === "estimates",
    ).experimentLinks[0].topicId = "url-shortener";
  }, /unavailable experiment url-shortener/);
});

function baselineDiagram(workshop) {
  return workshop.stages.find((stage) => stage.id === "baseline")
    .walkthroughs[0];
}

test("reject a walkthrough endpoint that does not name a participant", () => {
  rejectChange((_, workshop) => {
    baselineDiagram(workshop).steps[0].to = "missing-participant";
  }, /unknown walkthrough node/);
});

test("reject duplicate walkthrough participants", () => {
  rejectChange((_, workshop) => {
    const diagram = baselineDiagram(workshop);
    diagram.nodes.push(structuredClone(diagram.nodes[0]));
  }, /nodes: duplicate client/);
});

test("reject duplicate walkthrough step identities", () => {
  rejectChange((_, workshop) => {
    const diagram = baselineDiagram(workshop);
    diagram.steps.push(structuredClone(diagram.steps[0]));
  }, /steps: duplicate request/);
});

test("reject executable-looking unsupported walkthrough fields", () => {
  rejectChange((_, workshop) => {
    baselineDiagram(workshop).steps[0].latencyMs = 10;
  }, /additional properties/);
});

test("reject empty walkthroughs and excessive causal steps", () => {
  for (const count of [0, 21])
    rejectChange((_, workshop) => {
      const diagram = baselineDiagram(workshop);
      diagram.steps = Array.from({ length: count }, (_, i) => ({
        ...diagram.steps[0],
        id: `step-${i}`,
      }));
    }, /(?:fewer than 1|more than 20) items/);
});

test("reject a dangling prerequisite before publishing a learning path", () => {
  rejectChange((catalog) => {
    catalog.find((entry) => entry.id === "capacity-estimation").prerequisites =
      ["missing-foundation"];
  }, /unknown prerequisite missing-foundation/);
});

test("reject published entries whose prerequisite is unfinished", () => {
  rejectChange((catalog) => {
    catalog.find((entry) => entry.id === "request-flow").status = "draft";
  }, /published entry requires unpublished request-flow/);
});

test("reject an indirect prerequisite cycle", () => {
  rejectChange((catalog) => {
    catalog.find((entry) => entry.id === "request-flow").prerequisites = [
      "capacity-estimation",
    ];
  }, /prerequisite cycle/);
});

for (const [name, change, expected] of [
  [
    "unknown module",
    (paths) => {
      paths[0].steps[0].moduleId = "missing";
    },
    /unknown path module missing/,
  ],
  [
    "duplicate step",
    (paths) => {
      paths[0].steps.push(paths[0].steps[0]);
    },
    /duplicate path module request-flow/,
  ],
  [
    "reordered prerequisite",
    (paths) => {
      paths[0].steps.reverse();
    },
    /prerequisites must appear before/,
  ],
  [
    "optional duplicate",
    (paths) => {
      paths[0].optionalModuleIds.push("cache-aside");
    },
    /duplicate path module cache-aside/,
  ],
  [
    "duplicate path",
    (paths) => {
      paths.push(paths[0]);
    },
    /learning paths: duplicate/,
  ],
  [
    "unsupported version",
    (paths) => {
      paths[0].schemaVersion = 2;
    },
    /must be equal to constant/,
  ],
  [
    "empty path",
    (paths) => {
      paths[0].steps = [];
    },
    /fewer than 1 items/,
  ],
  [
    "extra field",
    (paths) => {
      paths[0].steps[0].href = "/made-up";
    },
    /additional properties/,
  ],
]) {
  test(`reject learning path ${name}`, () =>
    rejectChange(() => {}, expected, change));
}

function rejectCheckpointTarget(topic, target, expected) {
  rejectChange(
    () => {},
    expected,
    () => {},
    (fixture) => {
      const path = join(fixture, `content/topics/${topic}/checkpoints.json`);
      const checkpoints = JSON.parse(readFileSync(path, "utf8"));
      checkpoints[0].target = target;
      writeFileSync(path, JSON.stringify(checkpoints));
    },
  );
}

test("reject mixed operation and job selectors", () => {
  rejectCheckpointTarget(
    "queues-tail-latency",
    { operation: 1, jobId: "job-1", kind: "job.started", occurrence: 1 },
    /must NOT have additional properties/,
  );
});

const deliveryTarget = {
  messageId: "m1",
  attemptId: "m1-a1",
  kind: "effect.committed",
  occurrence: 1,
};
for (const [name, target, expected] of [
  [
    "mixed operation and delivery selectors",
    { ...deliveryTarget, operation: 1 },
    /additional properties/,
  ],
  [
    "mixed job and delivery selectors",
    { ...deliveryTarget, jobId: "job-1" },
    /additional properties/,
  ],
  [
    "delivery target missing its attempt",
    { messageId: "m1", kind: "effect.committed", occurrence: 1 },
    /required property 'attemptId'/,
  ],
  [
    "delivery target missing its message",
    { attemptId: "m1-a1", kind: "effect.committed", occurrence: 1 },
    /required property 'messageId'/,
  ],
  [
    "delivery message ID with a newline",
    { ...deliveryTarget, messageId: "m1\n" },
    /must NOT be valid/,
  ],
  [
    "delivery attempt ID with a newline",
    { ...deliveryTarget, attemptId: "m1-a1\n" },
    /must NOT be valid/,
  ],
  [
    "mismatched delivery message and attempt",
    { ...deliveryTarget, attemptId: "other-a1" },
    /attemptId must belong to the selected messageId/,
  ],
  [
    "delivery attempt above the modeled maximum",
    { ...deliveryTarget, attemptId: "m1-a6" },
    /must match pattern/,
  ],
  [
    "delivery occurrence below one",
    { ...deliveryTarget, occurrence: 0 },
    /must be >= 1/,
  ],
  [
    "delivery occurrence beyond trace ceiling",
    { ...deliveryTarget, occurrence: 10001 },
    /must be <= 10000/,
  ],
  [
    "unsupported delivery event kind",
    { ...deliveryTarget, kind: "message.fabricated" },
    /never emits message.fabricated/,
  ],
  [
    "message enqueue used as an attempt target",
    { ...deliveryTarget, kind: "message.enqueued" },
    /events do not support target selector attemptId/,
  ],
  [
    "consumer crash used as a paired message target",
    { ...deliveryTarget, kind: "consumer.crashed" },
    /events do not support target selector messageId/,
  ],
  [
    "consumer recovery used as a paired message target",
    { ...deliveryTarget, kind: "consumer.recovered" },
    /events do not support target selector messageId/,
  ],
  [
    "delivery target using a cache operation",
    { operation: 1, kind: "ack.accepted", occurrence: 1 },
    /events do not support target selector operation/,
  ],
  [
    "delivery target using a capacity job",
    { jobId: "job-1", kind: "ack.accepted", occurrence: 1 },
    /events do not support target selector jobId/,
  ],
]) {
  test(`reject checkpoint ${name}`, () =>
    rejectCheckpointTarget("queues-delivery", target, expected));
}

test("reject a cache checkpoint with paired delivery identities", () => {
  rejectCheckpointTarget(
    "cache-aside",
    deliveryTarget,
    /cache-aside events do not support target selector messageId/,
  );
});
test("reject a capacity checkpoint with paired delivery identities", () => {
  rejectCheckpointTarget(
    "queues-tail-latency",
    deliveryTarget,
    /queues-tail-latency events do not support target selector messageId/,
  );
});
test("accept a paired dead-letter checkpoint kind without widening legacy grammars", () => {
  checkChange(
    () => {},
    /Validated/,
    () => {},
    (fixture) => {
      const path = join(
        fixture,
        "content/topics/queues-delivery/checkpoints.json",
      );
      const checkpoints = JSON.parse(readFileSync(path, "utf8"));
      checkpoints[0].presetId = "overlapping-attempts";
      checkpoints[0].target = {
        ...deliveryTarget,
        attemptId: "m1-a2",
        kind: "message.dead-lettered",
      };
      writeFileSync(path, JSON.stringify(checkpoints));
    },
    0,
  );
});
test("reject a queue checkpoint with an operation selector", () => {
  rejectCheckpointTarget(
    "queues-tail-latency",
    { operation: 1, kind: "job.started", occurrence: 1 },
    /queues-tail-latency events do not support target selector operation/,
  );
});
test("reject a cache checkpoint with a job selector", () => {
  rejectCheckpointTarget(
    "cache-aside",
    { jobId: "job-1", kind: "cache.fill", occurrence: 1 },
    /cache-aside events do not support target selector jobId/,
  );
});
test("reject a checkpoint without a semantic selector", () => {
  rejectCheckpointTarget(
    "queues-tail-latency",
    { kind: "job.started", occurrence: 1 },
    /must match exactly one schema in oneOf/,
  );
});
test("reject a checkpoint job selector ending in a newline", () => {
  rejectCheckpointTarget(
    "queues-tail-latency",
    { jobId: "job-1\n", kind: "job.started", occurrence: 1 },
    /must NOT be valid/,
  );
});

const dataTarget = { operationId: "q1", kind: "TENANT_RANGE", occurrence: 1 };
for (const [name, target, expected] of [
  [
    "data target mixed with a cache operation",
    { ...dataTarget, operation: 1 },
    /additional properties/,
  ],
  [
    "data target mixed with a queue job",
    { ...dataTarget, jobId: "job-1" },
    /additional properties/,
  ],
  [
    "data target mixed with a delivery pair",
    { ...dataTarget, messageId: "m1", attemptId: "m1-a1" },
    /additional properties/,
  ],
  [
    "data target with repeated occurrence",
    { ...dataTarget, occurrence: 2 },
    /must be equal to constant/,
  ],
  [
    "data operation identity with trailing newline",
    { ...dataTarget, operationId: "q1\n" },
    /must NOT be valid/,
  ],
  [
    "data target with an event kind",
    { ...dataTarget, kind: "cache.fill" },
    /never returns outcome kind cache.fill/,
  ],
  [
    "data target without an identity",
    { kind: "TENANT_RANGE", occurrence: 1 },
    /required property 'operationId'/,
  ],
  [
    "data target with a null identity",
    { ...dataTarget, operationId: null },
    /must be string/,
  ],
]) {
  test(`reject checkpoint ${name}`, () =>
    rejectCheckpointTarget("data-access-models", target, expected));
}
for (const topic of ["cache-aside", "queues-tail-latency", "queues-delivery"]) {
  test(`reject outcome identity attached to ${topic} without outcome capability`, () => {
    rejectCheckpointTarget(
      topic,
      dataTarget,
      /outcomes do not support target selector operationId/,
    );
  });
}
test("reject an event selector attached to the untimed data-access model", () => {
  rejectCheckpointTarget(
    "data-access-models",
    { operation: 1, kind: "cache.fill", occurrence: 1 },
    /data-access-models events do not support target selector operation/,
  );
});
test("accept actual operation outcomes without fabricating events or widening legacy target rules", () => {
  checkChange(
    () => {},
    /Validated/,
    () => {},
    () => {},
    0,
  );
});
test("reject an unresolved operation-identity schema reference rather than trusting field presence", () => {
  rejectChange(
    () => {},
    /outcomes do not support target selector operationId/,
    () => {},
    (fixture) => {
      const path = join(fixture, "contracts/openapi.json");
      const api = JSON.parse(readFileSync(path, "utf8"));
      api.components.schemas.DataAccessOutcome.properties.operationId.$ref =
        "#/components/schemas/MissingOperationIdentity";
      writeFileSync(path, JSON.stringify(api));
    },
  );
});

const reservationTarget = {
  stepId: "attempt-b",
  kind: "RESERVATION_REJECTED",
  occurrence: 1,
};
for (const [name, target, expected] of [
  [
    "reservation target mixed with cache operation",
    { ...reservationTarget, operation: 1 },
    /additional properties/,
  ],
  [
    "reservation target mixed with queue job",
    { ...reservationTarget, jobId: "job-1" },
    /additional properties/,
  ],
  [
    "reservation target mixed with delivery pair",
    { ...reservationTarget, messageId: "m1", attemptId: "m1-a1" },
    /additional properties/,
  ],
  [
    "reservation target mixed with access operation",
    { ...reservationTarget, operationId: "q1" },
    /additional properties/,
  ],
  [
    "reservation target occurrence two",
    { ...reservationTarget, occurrence: 2 },
    /must be equal to constant/,
  ],
  [
    "reservation step identity with trailing newline",
    { ...reservationTarget, stepId: "attempt-b\n" },
    /must NOT be valid/,
  ],
  [
    "reservation target missing identity",
    { kind: "RESERVATION_REJECTED", occurrence: 1 },
    /required property 'stepId'/,
  ],
  [
    "reservation target null identity",
    { ...reservationTarget, stepId: null },
    /must be string/,
  ],
  [
    "reservation target unsupported kind",
    { ...reservationTarget, kind: "TRANSACTION_COMMITTED" },
    /never returns outcome kind TRANSACTION_COMMITTED/,
  ],
])
  test(`reject checkpoint ${name}`, () =>
    rejectCheckpointTarget("transactions-isolation", target, expected));
for (const topic of [
  "cache-aside",
  "queues-tail-latency",
  "queues-delivery",
  "data-access-models",
])
  test(`reject reservation step target on ${topic} without its outcome capability`, () =>
    rejectCheckpointTarget(
      topic,
      reservationTarget,
      /outcomes do not support target selector stepId/,
    ));
test("reject a data-access operation target on reservation outcomes without widening either kind family", () => {
  rejectCheckpointTarget(
    "transactions-isolation",
    { operationId: "q1", kind: "TENANT_RANGE", occurrence: 1 },
    /outcomes do not support target selector operationId/,
  );
});
test("reject an event selector attached to the untimed reservation result", () => {
  rejectCheckpointTarget(
    "transactions-isolation",
    { operation: 1, kind: "cache.fill", occurrence: 1 },
    /transactions-isolation events do not support target selector operation/,
  );
});
test("accept actual reservation step checkpoints without adding a fabricated event collection", () => {
  checkChange(
    () => {},
    /Validated/,
    () => {},
    () => {},
    0,
  );
});
test("reject an unresolved reservation step-identity schema reference", () => {
  rejectChange(
    () => {},
    /outcomes do not support target selector stepId/,
    () => {},
    (fixture) => {
      const path = join(fixture, "contracts/openapi.json");
      const api = JSON.parse(readFileSync(path, "utf8"));
      api.components.schemas.ReservationOutcome.properties.stepId.$ref =
        "#/components/schemas/MissingStepIdentity";
      writeFileSync(path, JSON.stringify(api));
    },
  );
});

function checkAtomicityTarget(
  target,
  expected,
  expectedStatus = 1,
  mutateApi = () => {},
) {
  checkChange(
    () => {},
    expected,
    () => {},
    (fixture) => {
      const path = join(
        fixture,
        "content/topics/transactions-isolation/checkpoints.json",
      );
      const checkpoints = JSON.parse(readFileSync(path, "utf8"));
      checkpoints[0].simulationId = "transaction-atomicity";
      checkpoints[0].presetId = "protected-baseline";
      checkpoints[0].target = target;
      writeFileSync(path, JSON.stringify(checkpoints));
      const apiPath = join(fixture, "contracts/openapi.json");
      const api = JSON.parse(readFileSync(apiPath, "utf8"));
      mutateApi(api);
      writeFileSync(apiPath, JSON.stringify(api));
    },
    expectedStatus,
  );
}

const atomicityTarget = {
  stepId: "abort-a",
  kind: "TRANSACTION_ABORTED",
  occurrence: 1,
};

test("accept atomicity's actual step outcome selector without introducing another identity family", () => {
  checkAtomicityTarget(atomicityTarget, /Validated/, 0);
});

for (const [name, target, expected] of [
  [
    "reservation outcome kind on the atomicity model",
    { ...atomicityTarget, kind: "READ_OBSERVED" },
    /transaction-atomicity never returns outcome kind READ_OBSERVED/,
  ],
  [
    "unknown atomicity outcome kind",
    { ...atomicityTarget, kind: "TRANSACTION_RECOVERED" },
    /transaction-atomicity never returns outcome kind TRANSACTION_RECOVERED/,
  ],
  [
    "atomicity with a data-access selector",
    { operationId: "q1", kind: "TRANSACTION_ABORTED", occurrence: 1 },
    /transaction-atomicity outcomes do not support target selector operationId/,
  ],
  [
    "atomicity with a cache event selector",
    { operation: 1, kind: "cache.fill", occurrence: 1 },
    /transaction-atomicity events do not support target selector operation/,
  ],
  [
    "atomicity with a queue job selector",
    { jobId: "job-1", kind: "job.started", occurrence: 1 },
    /transaction-atomicity events do not support target selector jobId/,
  ],
  [
    "atomicity with delivery attempt selectors",
    { messageId: "m1", attemptId: "m1-a1", kind: "ack.stale", occurrence: 1 },
    /transaction-atomicity events do not support target selector messageId/,
  ],
  [
    "atomicity mixed with an access-operation identity",
    { ...atomicityTarget, operationId: "q1" },
    /additional properties/,
  ],
  [
    "atomicity repeat occurrence despite unique step IDs",
    { ...atomicityTarget, occurrence: 2 },
    /must be equal to constant/,
  ],
])
  test(`reject checkpoint ${name}`, () =>
    checkAtomicityTarget(target, expected));

test("reject an unresolved atomicity step identity schema reference", () => {
  checkAtomicityTarget(
    atomicityTarget,
    /transaction-atomicity outcomes do not support target selector stepId/,
    1,
    (api) => {
      api.components.schemas.AtomicityOutcome.properties.stepId.$ref =
        "#/components/schemas/MissingAtomicityStepIdentity";
    },
  );
});

test("reject an optional atomicity step identity even when its property still exists", () => {
  checkAtomicityTarget(
    atomicityTarget,
    /transaction-atomicity outcomes do not support target selector stepId/,
    1,
    (api) => {
      const outcome = api.components.schemas.AtomicityOutcome;
      outcome.required = outcome.required.filter((field) => field !== "stepId");
    },
  );
});

test("reject a nullable atomicity identity owner instead of guessing selector support", () => {
  checkAtomicityTarget(
    atomicityTarget,
    /transaction-atomicity outcomes do not support target selector stepId/,
    1,
    (api) => {
      api.components.schemas.AtomicityIdentifier.type = ["string", "null"];
    },
  );
});
