import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const read = (name) =>
  JSON.parse(
    readFileSync(new URL(`../../contracts/${name}`, import.meta.url), "utf8"),
  );
const inputSchema = read("timeouts-retries.input.schema.json");
const resultSchema = read("timeouts-retries.result.schema.json");
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});
const validators = {
  input: ajv.compile(inputSchema),
  result: ajv.compile(resultSchema),
};
for (const definition of [
  "state",
  "requestState",
  "attemptState",
  "workerState",
  "event",
])
  validators[definition] = ajv.compile({
    $ref: `${resultSchema.$id}#/$defs/${definition}`,
  });
const examples = Object.fromEntries(
  ["baseline", "backoff", "deadline", "jitter"].map((scenario) => [
    scenario,
    Object.fromEntries(
      ["input", "result"].map((kind) => [
        kind,
        read(`examples/timeouts-retries-${scenario}-${kind}.json`),
      ]),
    ),
  ]),
);
const results = Object.values(examples).map((example) => example.result);
const events = results.flatMap((result) => result.events);
const states = results.flatMap((result) => [
  result.initialState,
  ...result.events.map((event) => event.postState),
  result.finalState,
]);
const requests = states.flatMap((state) => state.requests);
const attempts = states.flatMap((state) => state.attempts);
const samples = {
  input: examples.baseline.input,
  result: examples.baseline.result,
  state: examples.baseline.result.initialState,
  event: events.find((event) => event.kind === "WORK_STARTED"),
  requestState: requests.find((request) => request.phase === "WAITING"),
  attemptState: attempts.find((attempt) => attempt.workState === "RUNNING"),
  workerState: states
    .flatMap((state) => state.workers)
    .find((worker) => Object.hasOwn(worker, "attemptId")),
};
function valid(kind, value) {
  assert.equal(
    validators[kind](value),
    true,
    JSON.stringify(validators[kind].errors),
  );
}
function reject(kind, title, mutate, sample = samples[kind]) {
  test(`retry standalone contract rejects ${title}`, () => {
    assert.ok(sample, `missing actual Java sample: ${title}`);
    const value = structuredClone(sample);
    mutate(value);
    assert.equal(validators[kind](value), false, title);
  });
}
function eventOf(kind) {
  const event = events.find((item) => item.kind === kind);
  assert.ok(event, `actual Java goldens must cover ${kind}`);
  return event;
}
function attemptOf(workState, callerState) {
  const attempt = attempts.find(
    (item) =>
      item.workState === workState &&
      (!callerState || item.callerState === callerState),
  );
  assert.ok(
    attempt,
    `actual Java goldens must cover ${workState}/${callerState ?? "any"}`,
  );
  return attempt;
}
function requestOf(phase) {
  const request = requests.find((item) => item.phase === phase);
  assert.ok(request, `actual Java goldens must cover ${phase}`);
  return request;
}

for (const [scenario, pair] of Object.entries(examples))
  test(`actual Java retry ${scenario} input and complete result satisfy standalone contracts`, () => {
    valid("input", pair.input);
    valid("result", pair.result);
    assert.deepEqual(pair.result.input, pair.input);
    assert.deepEqual(
      pair.result.finalState,
      pair.result.events.at(-1).postState,
    );
    assert.equal(pair.result.status, "completed");
    assert.equal(pair.result.randomAlgorithm, "SplittableRandom");
  });

test("actual Java retry goldens expose all eleven semantic event kinds", () => {
  assert.deepEqual(
    [...new Set(events.map((event) => event.kind))].sort(),
    [...resultSchema.$defs.event.properties.kind.enum].sort(),
  );
  for (const event of events) valid("event", event);
});
test("actual Java retry microsteps preserve READY, admission, retry decision and completion evidence", () => {
  for (const phase of [
    "NOT_ARRIVED",
    "READY",
    "WAITING",
    "DECIDING_RETRY",
    "BACKING_OFF",
    "AWAITING_DEADLINE",
    "SUCCEEDED",
    "FAILED",
  ])
    valid("requestState", requestOf(phase));
  const pending = attemptOf("PENDING_ADMISSION", "WAITING");
  valid("attemptState", pending);
  assert.equal(Object.hasOwn(pending, "timeoutAtMs"), false);
  const completedWaiting = attemptOf("COMPLETED", "WAITING");
  valid("attemptState", completedWaiting);
  assert.equal(Object.hasOwn(completedWaiting, "callerFinishedAtMs"), false);
  assert.ok(Object.hasOwn(completedWaiting, "timeoutAtMs"));
});
test("Java deadline-blocked retry exposes a proposal, no actual retry or phantom attempt", () => {
  const result = examples.deadline.result;
  const blocked = result.events.find(
    (event) => event.kind === "RETRY_BLOCKED_BY_DEADLINE",
  );
  assert.ok(blocked);
  valid("event", blocked);
  assert.equal(
    blocked.postState.requests.find(
      (request) => request.id === blocked.requestId,
    ).phase,
    "AWAITING_DEADLINE",
  );
  assert.ok(
    blocked.proposedRetryAtMs >=
      blocked.postState.requests.find(
        (request) => request.id === blocked.requestId,
      ).overallDeadlineAtMs,
  );
  assert.equal(Object.hasOwn(blocked, "retryAtMs"), false);
  assert.ok(
    blocked.postState.attempts.some(
      (attempt) => attempt.id === blocked.attemptId,
    ),
  );
  assert.equal(result.finalState.attempts.length, 2);
  assert.equal(result.metrics.finalTimeMs, 100);
});
test("actual retry zero values remain known and inapplicable fields are omitted", () => {
  const arrival = eventOf("REQUEST_ARRIVED");
  assert.equal(arrival.timeMs, 0);
  assert.equal(arrival.postState.requests[0].attemptsSent, 0);
  assert.equal(Object.hasOwn(arrival, "attemptId"), false);
  assert.equal(Object.hasOwn(arrival, "delayMs"), false);
  assert.equal(examples.deadline.result.metrics.completedServerWork, 0);
  assert.equal(examples.baseline.result.initialState.queue.length, 0);
});

for (const [field, below, above] of [
  ["workers", 0, 4],
  ["queueCapacity", -1, 13],
  ["attemptTimeoutMs", 0, 1001],
  ["overallTimeoutMs", 0, 10001],
  ["maxAttempts", 0, 6],
  ["retryBudget", -1, 49],
  ["unavailableUntilMs", -1, 10001],
  ["seed", -9007199254740992, 9007199254740992],
]) {
  reject("input", `${field} below its bound`, (input) => {
    input[field] = below;
  });
  reject("input", `${field} above its bound`, (input) => {
    input[field] = above;
  });
}
for (const [name, value] of [
  ["string integer", "1"],
  ["fractional integer", 1.5],
  ["null integer", null],
  ["boolean integer", true],
])
  reject("input", name, (input) => {
    input.workers = value;
  });
for (const field of Object.keys(inputSchema.properties))
  reject("input", `missing required ${field}`, (input) => {
    delete input[field];
  });
reject("input", "unknown top-level control", (input) => {
  input.cancelServerWork = true;
});
reject("input", "unknown schema version", (input) => {
  input.schemaVersion = "2.0";
});
reject("input", "unknown model version", (input) => {
  input.modelVersion = "1.1.0";
});
reject("input", "unknown backoff policy", (input) => {
  input.backoff = "LINEAR";
});
reject("input", "unknown jitter policy", (input) => {
  input.jitter = "EQUAL";
});
reject("input", "IMMEDIATE with a hidden positive base delay", (input) => {
  input.baseDelayMs = 1;
});
reject("input", "IMMEDIATE with a hidden positive cap", (input) => {
  input.maxDelayMs = 1;
});
reject("input", "IMMEDIATE with FULL jitter", (input) => {
  input.jitter = "FULL";
});
reject(
  "input",
  "EXPONENTIAL with a zero base",
  (input) => {
    input.baseDelayMs = 0;
  },
  examples.backoff.input,
);
reject(
  "input",
  "EXPONENTIAL with an excessive cap",
  (input) => {
    input.maxDelayMs = 1001;
  },
  examples.backoff.input,
);
reject("input", "no original requests", (input) => {
  input.requests = [];
});
reject("input", "thirteen original requests", (input) => {
  input.requests = Array.from({ length: 13 }, (_, index) => ({
    ...input.requests[0],
    id: `request-${index}`,
  }));
});
reject("input", "null original request", (input) => {
  input.requests[0] = null;
});
reject("input", "unknown original request field", (input) => {
  input.requests[0].retry = true;
});
for (const id of ["", "Upper", "1request", "a\n", "a b", "é", "a".repeat(33)])
  reject(
    "input",
    `malformed original identity ${JSON.stringify(id)}`,
    (input) => {
      input.requests[0].id = id;
    },
  );
for (const [field, value] of [
  ["arrivalTimeMs", -1],
  ["arrivalTimeMs", 10001],
  ["serviceTimeMs", 0],
  ["serviceTimeMs", 1001],
])
  reject("input", `request ${field}=${value}`, (input) => {
    input.requests[0][field] = value;
  });

reject("result", "a fabricated partial result status", (result) => {
  result.status = "limited";
});
reject("result", "an unknown result field", (result) => {
  result.truncationReason = "event_limit";
});
reject("result", "an unknown random algorithm", (result) => {
  result.randomAlgorithm = "Math.random";
});
reject("result", "more than384 emitted events", (result) => {
  result.events = Array(385).fill(result.events[0]);
});
reject("result", "an empty event history", (result) => {
  result.events = [];
});
reject("result", "an uncaptured input control", (result) => {
  result.input.retryBudget = null;
});
reject("state", "unknown snapshot field", (state) => {
  state.serverCancelled = true;
});
reject("state", "negative remaining budget", (state) => {
  state.retryBudgetRemaining = -1;
});
reject("state", "duplicate queued attempt IDs", (state) => {
  state.queue = ["a-a1", "a-a1"];
});
reject("state", "more than60 attempt records", (state) => {
  state.attempts = Array(61).fill(samples.attemptState);
});
reject("state", "more than12 waiting jobs", (state) => {
  state.queue = Array.from({ length: 13 }, (_, index) => `q${index}-a1`);
});
reject("workerState", "worker index outside the declared pool", (worker) => {
  worker.id = "worker-4";
});
reject("workerState", "trailing whitespace on worker identity", (worker) => {
  worker.id = "worker-1\n";
});
reject("workerState", "explicit null idle assignment", (worker) => {
  worker.attemptId = null;
});
for (const field of [
  "activeAttemptId",
  "nextRetryAtMs",
  "finishedAtMs",
  "failureReason",
  "lastFailureCause",
])
  reject("requestState", `explicit null optional ${field}`, (request) => {
    request[field] = null;
  });
reject("requestState", "WAITING without an active attempt", (request) => {
  delete request.activeAttemptId;
});
reject(
  "requestState",
  "READY with an already sent attempt",
  (request) => {
    request.attemptsSent = 1;
  },
  requestOf("READY"),
);
reject(
  "requestState",
  "DECIDING_RETRY with a live active caller",
  (request) => {
    request.activeAttemptId = "a-a1";
  },
  requestOf("DECIDING_RETRY"),
);
reject(
  "requestState",
  "BACKING_OFF without an actual scheduled retry",
  (request) => {
    delete request.nextRetryAtMs;
  },
  requestOf("BACKING_OFF"),
);
reject(
  "requestState",
  "AWAITING_DEADLINE pretending a retry is scheduled",
  (request) => {
    request.nextRetryAtMs = 120;
  },
  requestOf("AWAITING_DEADLINE"),
);
reject(
  "requestState",
  "SUCCEEDED with a logical failure reason",
  (request) => {
    request.failureReason = "ATTEMPTS_EXHAUSTED";
  },
  requestOf("SUCCEEDED"),
);
reject(
  "requestState",
  "FAILED without its actual failure time",
  (request) => {
    delete request.finishedAtMs;
  },
  requestOf("FAILED"),
);
reject(
  "requestState",
  "FAILED without a policy reason",
  (request) => {
    delete request.failureReason;
  },
  requestOf("FAILED"),
);
reject("requestState", "a fabricated request phase", (request) => {
  request.phase = "CANCELLED";
});
for (const [name, mutate] of [
  [
    "unknown work state",
    (attempt) => {
      attempt.workState = "CANCELLED";
    },
  ],
  [
    "unknown caller state",
    (attempt) => {
      attempt.callerState = "ACKED";
    },
  ],
  [
    "malformed attempt identity",
    (attempt) => {
      attempt.id = "a-a6";
    },
  ],
  [
    "attempt identity with trailing newline",
    (attempt) => {
      attempt.id += "\n";
    },
  ],
  [
    "unknown attempt field",
    (attempt) => {
      attempt.effectCommitted = true;
    },
  ],
  [
    "RUNNING without a start time",
    (attempt) => {
      delete attempt.startedAtMs;
    },
  ],
  [
    "accepted work without its configured timeout",
    (attempt) => {
      delete attempt.timeoutAtMs;
    },
  ],
  [
    "RUNNING with a future completion presented as actual",
    (attempt) => {
      attempt.completedAtMs = 999;
    },
  ],
  [
    "WAITING with an actual caller finish",
    (attempt) => {
      attempt.callerFinishedAtMs = 0;
    },
  ],
])
  reject("attemptState", name, mutate);
reject(
  "attemptState",
  "pending admission with an accepted timeout",
  (attempt) => {
    attempt.timeoutAtMs = 50;
  },
  attemptOf("PENDING_ADMISSION"),
);
reject(
  "attemptState",
  "rejected attempt with accepted work",
  (attempt) => {
    attempt.workState = "QUEUED";
    attempt.timeoutAtMs = 50;
  },
  attemptOf("NOT_ACCEPTED", "REJECTED"),
);
reject(
  "attemptState",
  "rejected attempt with an attempt-timeout cause",
  (attempt) => {
    attempt.failureCause = "ATTEMPT_TIMEOUT";
  },
  attemptOf("NOT_ACCEPTED", "REJECTED"),
);
reject(
  "attemptState",
  "timed-out work without caller finish",
  (attempt) => {
    delete attempt.callerFinishedAtMs;
  },
  attemptOf("RUNNING", "TIMED_OUT"),
);
reject(
  "attemptState",
  "completed work without completion time",
  (attempt) => {
    delete attempt.completedAtMs;
  },
  attemptOf("COMPLETED"),
);
reject(
  "attemptState",
  "responded caller on incomplete work",
  (attempt) => {
    attempt.workState = "RUNNING";
    delete attempt.completedAtMs;
  },
  attemptOf("COMPLETED", "RESPONDED"),
);
reject("attemptState", "explicit null absent field", (attempt) => {
  attempt.failureCause = null;
});

for (const kind of ["REQUEST_ARRIVED", "REQUEST_SUCCEEDED", "REQUEST_FAILED"])
  reject(
    "event",
    `${kind} with an attempt-level identity`,
    (event) => {
      event.attemptId = "a-a1";
    },
    eventOf(kind),
  );
for (const kind of [
  "ATTEMPT_SENT",
  "WORK_QUEUED",
  "WORK_STARTED",
  "ATTEMPT_REJECTED",
  "ATTEMPT_TIMED_OUT",
  "WORK_COMPLETED",
  "RETRY_SCHEDULED",
  "RETRY_BLOCKED_BY_DEADLINE",
])
  reject(
    "event",
    `${kind} missing actual attempt identity`,
    (event) => {
      delete event.attemptId;
    },
    eventOf(kind),
  );
reject("event", "unknown event kind", (event) => {
  event.kind = "SERVER_CANCELLED";
});
reject("event", "out-of-range event sequence", (event) => {
  event.sequence = 385;
});
reject("event", "fractional virtual time", (event) => {
  event.timeMs = 0.5;
});
reject("event", "virtual time beyond the proved drain bound", (event) => {
  event.timeMs = 80001;
});
for (const field of ["delayMs", "retryAtMs", "proposedRetryAtMs"])
  reject("event", `non-retry event with ${field}`, (event) => {
    event[field] = 0;
  });
for (const field of ["delayMs", "retryAtMs"])
  reject(
    "event",
    `scheduled retry missing ${field}`,
    (event) => {
      delete event[field];
    },
    eventOf("RETRY_SCHEDULED"),
  );
reject(
  "event",
  "scheduled retry with a blocked proposal field",
  (event) => {
    event.proposedRetryAtMs = event.retryAtMs;
  },
  eventOf("RETRY_SCHEDULED"),
);
for (const field of ["delayMs", "proposedRetryAtMs"])
  reject(
    "event",
    `blocked retry missing ${field}`,
    (event) => {
      delete event[field];
    },
    eventOf("RETRY_BLOCKED_BY_DEADLINE"),
  );
reject(
  "event",
  "blocked retry claiming an actual retry send time",
  (event) => {
    event.retryAtMs = event.proposedRetryAtMs;
  },
  eventOf("RETRY_BLOCKED_BY_DEADLINE"),
);
reject(
  "event",
  "null scheduled retry delay",
  (event) => {
    event.delayMs = null;
  },
  eventOf("RETRY_SCHEDULED"),
);
reject("result", "a final live queue", (result) => {
  result.finalState.queue = ["a-a1"];
});
reject("result", "a final occupied worker", (result) => {
  result.finalState.workers[0].attemptId = "a-a1";
});
reject("result", "a final nonterminal logical request", (result) => {
  result.finalState.requests[0] = samples.requestState;
});
reject("result", "a final pending attempt", (result) => {
  result.finalState.attempts[0] = attemptOf("PENDING_ADMISSION");
});
reject("result", "an initial sent attempt", (result) => {
  result.initialState.attempts = [samples.attemptState];
});
for (const [field, value] of [
  ["originalRequests", 0],
  ["attemptsSent", 61],
  ["retriesSent", 49],
  ["finalTimeMs", 80001],
  ["attemptAmplification", 0],
  ["attemptAmplification", 5.01],
  ["executionAmplification", -1],
  ["executionAmplification", 5.01],
])
  reject("result", `out-of-bound ${field}`, (result) => {
    result.metrics[field] = value;
  });
reject("result", "an unknown duplicate-effect metric", (result) => {
  result.metrics.duplicateEffects = 1;
});
