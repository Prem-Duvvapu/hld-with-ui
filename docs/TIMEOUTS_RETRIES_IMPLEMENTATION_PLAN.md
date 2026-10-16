# Timeouts & Retries implementation plan

Prepared 2026-10-16. **HLD-18A is in verification; API, UI and publication are pending.**
The starting baseline is PR #77, squash `ff0daa1`, with required CI run `38934926502` passing.
Follow `AGENTS.md` and `CONTRIBUTING.md`; use a fresh branch for each contribution.
Actual results belong in [HLD-18A](work-items/HLD-18A.md), not in a proposed checklist.

## 1. Learning outcome and boundaries

Answer one question: **Does stopping a caller's wait stop accepted server work when a retry adds load?**

The learner should distinguish an original request, a sent attempt, accepted server work,
a caller response and a business effect. This experiment models the first four. A completed
unit of work is not evidence of a persisted payment or notification effect.

- Canonical curriculum/model ID: `timeouts-retries`; Java package: `com.hld.retries`.
- Schema `1.0`, model `1.0.0`, kind `simulation`, status `completed` only.
- Prerequisites: request-flow and the technically reviewed queues-tail-latency draft.
- One finite worker pool, one FIFO waiting queue and one retry owner per logical request.
- Virtual time and a run-local seeded generator; no threads, sleep, network or wall clock inside execution.
- No cancellation, business-effect ledger, idempotency, durable storage or multiple retry layers.
- Fixed service time per original request applies to all its attempts; response delivery takes zero time.

## 2. Input contract

All fields are required and closed. Java boxed scalars allow validation to reject null
before execution. Canonical standalone schemas and Java validation must agree on shape,
versions and bounds; Java also checks cross-field and ordered-workload rules.

| Field | Allowed values |
| --- | --- |
| `schemaVersion`, `modelVersion` | `1.0`, `1.0.0` |
| `seed` | Integer between -9007199254740991 and 9007199254740991 |
| `workers` | 1–3 |
| `queueCapacity` | 0–12 waiting attempts, excluding running work |
| `attemptTimeoutMs` | 1–1000, measured from send and including queue wait |
| `overallTimeoutMs` | 1–10000, measured from original arrival |
| `maxAttempts` | 1–5, including the original |
| `backoff` | `IMMEDIATE` or `EXPONENTIAL` |
| `baseDelayMs`, `maxDelayMs` | Immediate: both 0; exponential: base 1–1000, base ≤ cap ≤ 1000 |
| `jitter` | `NONE` or `FULL`; immediate requires `NONE` |
| `retryBudget` | 0–48 retry sends shared by the whole finite batch |
| `unavailableUntilMs` | 0–10000; equality admits normally |
| `requests` | 1–12 records in nondecreasing arrival order |

Each request has only `id`, `arrivalTimeMs` and `serviceTimeMs`. IDs are unique whole ASCII
matches of `[a-z][a-z0-9-]{0,31}`. Arrivals are 0–10000; service is 1–1000. Do not silently
sort malformed input. Originals do not consume retry budget; immediately rejected retries do.

The first exponential retry cap is the base; subsequent caps double up to `maxDelayMs`.
FULL jitter chooses an inclusive integer from 0 through that cap. Use one existing versioned
`SeededRandom(seed)` stream for the entire run, consumed in scheduler order only after
attempt and budget checks. Never reset the same seed for each logical caller. Authored
arrivals, service and outage inputs need no second random stream.

## 3. Scheduler and behavior

Order callbacks by `(time, phase, original input index, attempt number, insertion sequence)`.

| Phase | Callback |
| --- | --- |
| 0 | Complete accepted server work |
| 1 | Overall caller deadline |
| 2 | Attempt timeout |
| 3 | Original send |
| 4 | Retry send |

Admission, rejection, policy decisions and starts are synchronous inside a callback.
Immediate retries use phase 4. Positive service times prevent a newly started completion
from moving backward into the current timestamp's earlier phase.

1. Before the configured recovery instant, reject a send immediately. Otherwise start it
   on the first idle worker (`worker-1` through `worker-3`) or append it to the finite FIFO.
   A full waiting queue rejects; zero queue capacity still permits an idle start.
2. An accepted attempt gets `timeoutAtMs = sentAtMs + attemptTimeoutMs`. Rejected attempts
   have no accepted timeout or server work. Timeout callbacks are needed only for accepted work.
3. A timeout stops caller waiting and retains the attempt's queued/running work. An on-time
   completion succeeds only if that exact attempt is still the logical request's active wait.
   A late completion cannot revive the caller or cancel a newer attempt.
4. Release a worker, emit completion, emit success when applicable, then promote existing
   FIFO work before any new arrival/retry callback. Completion at either deadline wins.
5. After rejection/timeout, check maximum attempts first, then available retry budget.
   Otherwise choose a delay. A proposal at or beyond the overall deadline emits
   `RETRY_BLOCKED_BY_DEADLINE`, enters `AWAITING_DEADLINE` and schedules no retry. Fail at
   the actual deadline, not at the time the proposal was blocked.
6. A valid retry plan enters `BACKING_OFF` and emits `RETRY_SCHEDULED`. Check budget again
   at dispatch: planning reserves no token. Consume one token only when an actual retry is
   sent. A suppressed dispatch has no fabricated future attempt row.
7. Overall deadline changes only the currently waiting attempt to `DEADLINE_EXCEEDED`.
   Preserve earlier attempts' causes/timestamps and the request's historical `lastFailureCause`.
   Logical `failureReason` is separate; a later success can retain a historical failure cause.
8. Ignore stale callbacks by identity and state. Stop when every logical request is terminal
   and all accepted work has drained. Future no-op timers must not extend `finalTimeMs`.

Fixed per-request service and FIFO mean an older same-request attempt cannot complete after
that request succeeds through a newer attempt. Do not invent an unreachable fixture. Accepted
work outliving logical failure and independent requests outliving another's success are reachable.

### Complete bounded execution

At most 12 originals × 5 attempts gives 60 sends. At most 48 retry callbacks, 12 original
callbacks, 12 overall deadlines, 60 attempt timeouts and 60 completions give 192 callbacks.
The last send is before 20000 ms; even serial drainage of 60 × 1000 ms ends by 80000 ms.

For emitted events, let R be originals, A sends, Q queued, X accepted/started, T timeouts,
S retry plans and B blocked proposals. The eleven emit sites give:

`R + A + Q + X + (A-X) + T + X + S + B + R = 2R + 2A + Q + T + X + S + B ≤ 384`.

Use `MAX_CALLBACKS = 192`, `MAX_EVENTS = 384` and `MAX_VIRTUAL_TIME_MS = 80000` as internal
bug assertions. Do not truncate a trace or return fabricated completion. Measure actual
serialization bytes for a maximum-boundary fixture; do not claim it proves a universal
HTTP byte bound. Transport response budgets are an HLD-18B gate.

## 4. Output and snapshot contract

`RetryResult` contains identity/versions/kind/status, captured input, `randomAlgorithm`,
`initialState`, `events`, `finalState`, `metrics` and `assumptions`. All lists are defensively
copied. The configured JSON mapper omits inapplicable optional fields; known zero remains zero.

A state contains logical `requests`, sent `attempts`, `workers`, FIFO attempt IDs in `queue`
and `retryBudgetRemaining`. Canonical schemas define exact field names and optional rules.

| Record | Important vocabulary |
| --- | --- |
| Request phase | NOT_ARRIVED, READY, WAITING, DECIDING_RETRY, BACKING_OFF, AWAITING_DEADLINE, SUCCEEDED, FAILED |
| Logical failure | ATTEMPTS_EXHAUSTED, RETRY_BUDGET_EXHAUSTED, OVERALL_DEADLINE |
| Attempt failure cause | DEPENDENCY_UNAVAILABLE, QUEUE_FULL, ATTEMPT_TIMEOUT |
| Caller state | WAITING, REJECTED, TIMED_OUT, DEADLINE_EXCEEDED, RESPONDED |
| Server-work state | PENDING_ADMISSION, NOT_ACCEPTED, QUEUED, RUNNING, COMPLETED |

Each event has `sequence`, `timeMs`, `kind`, actual `requestId`, `explanation` and `postState`.
Attempt-scoped events reference an already sent row; request arrival/success/failure omit
`attemptId`. Attempt IDs are `<original>-a[1-5]`, at most 35 characters.

The eleven event kinds are REQUEST_ARRIVED, ATTEMPT_SENT, WORK_QUEUED, WORK_STARTED,
ATTEMPT_REJECTED, ATTEMPT_TIMED_OUT, WORK_COMPLETED, RETRY_SCHEDULED,
RETRY_BLOCKED_BY_DEADLINE, REQUEST_SUCCEEDED and REQUEST_FAILED.

- Arrival emits READY before a send. Sent emits WAITING with PENDING_ADMISSION before admission.
- Rejection/timeout clears active waiting and emits DECIDING_RETRY before the policy event.
- Scheduled retries require only `delayMs` and `retryAtMs`; blocked proposals require only
  `delayMs` and `proposedRetryAtMs`. Every other kind omits all three fields.
- Completion releases the worker and records COMPLETED before its event; a currently waiting
  caller can still be WAITING in this microstep. The following success event records RESPONDED.
- Request deadline is known from input even before arrival. Accepted timeout is retained as
  configured history. Neither timestamp claims that the caller is still waiting.
- A request has `activeAttemptId` only while WAITING; terminal requests have finish time and
  failures have a policy reason. Final queue/workers are empty and accepted work is completed.

Java metrics are `originalRequests`, `succeededRequests`, `failedRequests`, `attemptsSent`,
`retriesSent`, `rejectedAttempts`, `acceptedServerWork`, `completedServerWork`, `lateCompletions`,
`attemptTimeouts`, `retryBudgetUsed`, `peakQueueDepth`, `peakRunningWork`, `finalTimeMs`,
`attemptAmplification` and `executionAmplification`. Ratios use original requests as denominator:
sends/originals and completed work/originals. No duplicate-business-effect metric is modeled.

## 5. Canonical presets and evidence

Defaults: seed 42, one worker, queue 2, attempt timeout 50, overall timeout 500, two attempts,
immediate retry, no jitter, budget 48, no outage, one request `a` arriving at 0 with service 80.
`RetryPresets.all()` owns eight inputs; `RetryPresets.baseline()` returns late-work.

| Preset | Change and required evidence |
| --- | --- |
| `late-work` | Defaults: original times out at 50; retry queues; completions at 80 and 160 are late; logical failure at 100; two sends/two work units |
| `healthy-timeout` | Attempt timeout 100: one send succeeds at 80; no ghost deadline extends the result |
| `queue-full` | Queue 0: retry rejects at 50; original work still completes late at 80 |
| `immediate-outage` | Unavailable until 60, service 20, three attempts, overall 200: three sends/rejections at 0 and failure at 0 |
| `backoff-recovery` | Previous workload with exponential base 40/cap 80: sends at 0, 40, 120; succeeds at 140 |
| `deadline-before-retry` | Previous workload with overall 100: sends at 0 and 40; blocked proposal at 40; actual failure at 100; no accepted work |
| `retry-budget` | Two originals at 0, outage/backoff above, budget 1: both plan at 40; only `a` sends a retry; both fail at 40; no `b-a2` row |
| `jittered-recovery` | Two originals, outage 60, service 20, five attempts, overall 300, exponential 40/80, FULL jitter, budget 8; capture actual Java choices without a success/spread promise |

Commit only four Java-serialized golden pairs: baseline, backoff, deadline and jitter. They
cover all eleven event kinds. Keep maximum-boundary stress output in memory/logs rather than
a giant checked-in trace. Other presets have independent exact JUnit expectations.

Root alone authors these pairs with `-Dtest=RetrySerializationTest -Dhld.writeRetryGoldens=true`;
ordinary verification compares without rewriting. Never rewrite an existing model's goldens.

Tests must cover exact scenarios; separate attempt and overall equality/+1 boundaries;
FIFO, worker and original-before-retry order; queued timeout drainage; late sibling responses;
planning/dispatch budget checks; seed replay/change; malformed and maximum input; defensive
ownership, concurrency, configured mapper round trips and strict standalone Node validation.

## 6. Delivery sequence

### HLD-18A — Java foundation and standalone contracts

Deliver pure input/validator/simulator/result/presets, canonical schemas, actual four golden
pairs, semantic/ownership/serialization/Node tests, ADR and honest roadmap evidence. Run local
gates and required final-head CI, then squash merge, delete the owned branch and update main.
Do not register an API, catalog topic, renderer or advertised capability in this contribution.

### HLD-18B — Strict API and runnable draft

After 18A merges, create a fresh branch. Deliver descriptor/run APIs with Java-derived limits
and all eight presets. Preserve transport 400/413/422/503 semantics, exact JSON tokens and
unknown/null/coerced/duplicate/trailing rejection. Valid modeled rejection or caller failure
is a completed 200 result, distinct from HTTP failure. Export canonical OpenAPI/types and a
reachable lazy descriptor validator. Register a draft route only with actual teaching views.

Build Playground, Study and eight Practice questions. Group advanced controls behind the
initial question. Allow real edits to arrivals/service, workers/queue and caller policy.
Capture input before asynchronous work, label old results stale after edits/failure and
require explicit Run/retry. Show Java caller states separately from queued/running/completed
work; distinguish known zero, configured deadline, chosen proposal and actual retry plan.

Label ratios with denominators and the exclusion of business effects. Add a worked example,
original primary-source explanations, teach-back and interview guidance. Check transport guards,
meaningful inputs, failure/retry, playback/history, keyboard/focus, both themes, responsive
widths, reduced motion, native zoom and copied-runtime baselines. Keep discovery unpublished.

### HLD-18C — Guided and authored design views

Use a fresh branch after runnable delivery. Add eight Java-resolved checkpoints, inspectable
Architecture and three manual causal paths with complete text equivalents. Select actual
request/attempt identities and kinds using the smallest honest selector extension. Do not
reuse broker-message terminology for caller attempts just to avoid a contract change.

Preserve shared Guided storage/reset/version behavior. Reading, selecting a preset/checkpoint,
changing tabs/history and reload must not trigger automatic POSTs. Verify selected prefixes,
saved answers, pending state, reset and explicit retry. Technical six-view completeness does
not satisfy human, hosted, prerequisite or publication gates.

## 7. Sources and next dependencies

Reopened on 2026-10-16:

- [AWS: Timeouts, retries and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/) supports reasoning about caller waits, retry load and effect safety; service-specific advice is not a universal guarantee.
- [Google SRE: Handling overload](https://sre.google/sre-book/handling-overload/) supports reasoning about overload and bounded retry policies.

Phases, bounds, presets, timings and the finite batch budget are original illustrative
model decisions. This does not emulate a vendor SDK or cancellation protocol. The budget
is not a token bucket or rolling retry ratio. Idempotency is the next separate effect/result
correctness boundary before Notification composition. Replication/partitioning and the
remaining requested cases stay in the canonical roadmap; this contribution does not finish
the full project.
