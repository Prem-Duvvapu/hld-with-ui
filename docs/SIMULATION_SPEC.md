# Simulation authoring and correctness contract

Status: authoring contract with an implemented subset. The machine-readable contracts in [`contracts/openapi.json`](../contracts/openapi.json) are authoritative for what the API returns today. Sections below label **implemented** behavior separately from **proposed** extensions; a proposed field or interface is not available until its schema, Java model, and renderer ship together. The first load-balancing module is the reference implementation; later models must not bypass its execution and validation boundaries.

### Implemented baseline (checked 2026-10-12)

| Model                               | Accepted `modelVersion`                                                | Shared runner                                      | Result `status` values |
| ----------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------- | ---------------------- |
| `request-flow`                      | `1.0.0` (no failure schedule) and `1.1.1` (current, failure schedules) | `SimulationContext`                                | `completed`, `limited` |
| `cache-aside`                       | `1.0.1` only                                                           | `SimulationContext`                                | `completed`, `limited` |
| `queues-tail-latency` (draft topic) | `1.0.0` only                                                           | `SimulationContext` with typed queue collector     | `completed`, `limited` |
| `distributed-rate-limiter`          | `1.0.0` only                                                           | none; bounded by its own `maxRequests` input limit | `completed`            |

Rejected versions (`request-flow` `1.1.0`, `cache-aside` `1.0.0`) and their reasons are recorded in [decision 0004](decisions/0004-simulation-causality-corrections.md). The estimator `capacity-estimation` is not an event simulation and has no trace.

### Registered draft queue-capacity model

`queues-tail-latency` now has a pure Java domain model (schema `1.0`, model `1.0.0`) with
finite workers, one FIFO waiting queue, per-job service times and typed post-event snapshots.
Its descriptor/run API supports the direct draft learning route, not published discovery. Its queue-local collector
admits events before state mutation and charges bounded structured state against the same
default `SimulationBudget`; cooperative deadline checks remain external guards. It uses no
random choices. Canonical standalone schemas/examples export into OpenAPI and generated React types. The
UI selects returned snapshots and separates scheduled completion from actual outcomes.
Eight Guided checkpoints select events by stable job ID, kind and occurrence; cache targets
retain their operation selector. Exactly one supported selector is required, and Java tests
reconcile every queue preset/target with authored numbers. The shared guided flow owns no
model execution logic; see [decision 0025](decisions/0025-shared-guided-simulation.md). See
[decision 0024](decisions/0024-draft-queue-experience.md) and [HLD-13B](work-items/HLD-13B.md).

## 1. What an experiment promises

An experiment computes state transitions from inputs. A guided animation may replay those transitions, but cannot fabricate them. Every model declares what it represents, what it omits, input bounds, failure behavior, and metric definitions.

Distinguish three modes in the UI: **simulation** (modeled behavior), **estimator** (assumptions and formulas), and **lab** (observed behavior of actual software). Results must retain this distinction in exports.

## 2. Deterministic execution

- Use an explicit deterministic order at each virtual time. Request flow/cache use a discrete-event queue with stable insertion order; queue capacity completes due workers, dispatches FIFO waiters, then admits arrivals in input order. **Implemented models use integer virtual milliseconds** (`timeMs`, `lastVirtualTimeMs`, `…Ms` inputs). A finer unit such as microseconds is a possible future envelope change, not a current contract; introducing it requires a schema and model version change. Guard overflow in every time calculation.
- Same model version, normalized inputs, seed, and scheduled actions produce the same semantic trace. Exclude correlation IDs and wall-time metadata from equality.
- Distinguish internal scheduling order from the sequence in the returned trace. Queue capacity assigns emitted sequence numbers when an event is admitted, after the event/byte checks. Equal-time tie rules must be documented and tested for each model.
- Use a versioned seeded PRNG abstraction; do not depend on unspecified iteration order. Separate workload randomness from failure randomness so a comparison can retain the same arrivals.
- Models are request-local. Two simultaneous runs must not affect each other. Java thread scheduling must not decide simulated behavior.
- Nodes have finite workers, queues, service times, and explicit failure/recovery rules when those mechanisms are relevant. Merely coloring a node red is not failure simulation.
- Failure schedules refer to stable entity IDs and virtual timestamps. Specify whether in-flight work fails, pauses, or completes for each modeled failure.
- Every run stops on completion or a declared budget. No infinite retry or zero-time event loop.
- **Execution guards (implemented).** `SimulationBudget` defaults are 10,000 events, 60,000 ms of virtual time, 2 MiB of estimated trace bytes, and a 10,000 ms wall-clock deadline. The event, virtual-time, and byte budgets are part of modeled, replayable behavior. The wall-clock deadline is an **external execution guard** checked cooperatively: a result stopped with `wall_time_limit` is censored, and where it stops can differ across machines and load. Replay equivalence is promised only for runs not stopped by that guard. The byte budget covers the emitted events array, including structured cache snapshots, rather than the entire response. Initial state, assumptions, outcomes and metrics are outside that modeled budget and remain bounded by model input limits. HLD-11A separately caps the complete serialized HTTP simulation response at 4 MiB by default; this external guard returns a 422 error without a trace when exceeded. Byte accounting is a conservative estimate and can stop earlier than exact serialization would ([decision 0004](decisions/0004-simulation-causality-corrections.md)).

## 3. Proposed Java interface

**Proposed, not implemented.** Current models are concrete simulator classes (for example `RequestFlowSimulator`, `CacheAsideSimulator`) called by their controllers with a request-local `SimulationContext` ([decision 0003](decisions/0003-simulation-context.md)). No shared `SimulationModel` interface, descriptor base type, or model registry exists yet. Introduce one only when a concrete additional model needs it:

```java
public interface SimulationModel<I> {
    ModelDescriptor descriptor();
    I validateAndNormalize(JsonNode input);
    SimulationResult run(I input, SimulationContext context);
}
```

The context supplies virtual scheduler, seeded randomness, bounded event emission, and budget checks. The model owns its typed domain state. HTTP parsing and Spring dependencies stay outside the model. Descriptors include renderer kind, schema/model versions, defaults, presets, assumptions, and limits. Use an explicit registry with duplicate-ID detection.

## 4. Trace shape and playback

**Implemented envelope.** Every current trace event has exactly these fields; OpenAPI defines one event schema per model (`SimulationEvent`, `RateLimitEvent`, `CacheAsideEvent`) with its own closed `kind` enum:

| Field       | Meaning                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sequence`  | Strictly increasing within a trace, starting at 1                                                                                                             |
| `timeMs`    | Nondecreasing integer virtual time in milliseconds                                                                                                            |
| `kind`      | Closed, versioned event type such as `request.queued` or `cache.fill`                                                                                         |
| `requestId` | Logical request or operation identity (`cache-aside` uses `Operation N`, numbered in input order). The cache key is not a structured event field yet (HLD-04) |
| `nodeId`    | The node, cache, or origin the event applies to                                                                                                               |
| `message`   | English narration for display only. Never parse it to reconstruct state                                                                                       |

Implemented results contain versions, seed, `status`, assumptions, events, per-request outcomes, and metrics; `limited` results add `truncationReason`, `lastVirtualTimeMs`, and incomplete counts. `cache-aside` additionally returns `initialState`, and each of its events carries `operation`, `key`, and that key's post-event `cacheEntry`/`originValue`; applying them in order reconstructs the full state at any event ([decision 0006](decisions/0006-cache-event-key-state.md)). Request flow and the rate limiter do not carry state snapshots yet.

**Proposed target envelope** for structured playback (not implemented; see HLD-04 in [the implementation plan](IMPLEMENTATION_PLAN.md#6-detailed-first-release-work)):

| Field                                | Meaning                                                        |
| ------------------------------------ | -------------------------------------------------------------- |
| `sequence`                           | Strictly increasing emitted event number                       |
| `timeMs`                             | Nondecreasing virtual timestamp                                |
| `kind`                               | Closed, versioned event type such as `request.queued`          |
| `entityId`                           | A node, queue, cache, replica, or other defined entity         |
| `requestId`                          | Optional logical request identity; attempts have a separate ID |
| `causedBySequence`                   | Optional earlier event that explains this event                |
| `payload`                            | Typed state change or bounded snapshot                         |
| `explanationKey` / `explanationArgs` | Rule and actual values used for narration                      |

A target result contains initial state, events, final state, summary metrics, completion status, and model assumptions. Only `completed` and `limited` are implemented statuses; an internal failure is an HTTP error, not a `failed` result. `limited` results carry `truncationReason`, last virtual time, and incomplete-request counts. Internal failures return an explicit error; do not present corrupted partial output as a successful lesson.

Use bounded snapshots for the first slice. Introduce deltas/checkpoints only after measurement warrants them and replay equivalence is tested. Backwards navigation restores prior state from trace data; it does not call a simulator in reverse. Playback speed changes rendering delay only. Java owns state/metric semantics, while TypeScript applies the schema-defined projection for display.

An unknown event or renderer fails visibly with an unsupported-version message. Do not silently skip state-changing events. Scenario exports include schema and model versions plus parameters/seed; import rejects incompatible versions with a useful explanation.

## 5. Metrics contract

Every metric declares its unit, population, observation interval, and empty/partial behavior.

- Request latency: terminal timestamp minus arrival timestamp, including queueing. Show successful-request latency separately from failure/timeout durations.
- Percentiles: use a declared method (initially nearest rank), show sample count, and return unavailable for no completed samples. Small samples are labeled; do not imply stable p99 estimates from a handful of requests.
- Throughput: successful logical completions divided by the stated observation window in seconds. Attempts and logical requests are separate counters.
- Errors/timeouts: explicit terminal outcomes divided by eligible logical requests. Outstanding work remains visible rather than being counted as success.
- Queue depth: actual state over virtual time. Average depth/utilization, when present, use time weighting rather than averaging event samples.
- Cache hit ratio: hits divided by eligible lookups; classify bypass/error separately and state how they affect the denominator.
- Stale reads and replica lag: specify the modeled version or time criterion; do not invent a generic consistency score.
- Limits: censored/outstanding requests and incomplete intervals are visible; never compare a truncated run to a complete run without marking it.

Two-policy comparisons use the same workload and failure schedule. Display all changed assumptions. Calculators show arithmetic with units; Little's Law uses steady-state averages and is not a tail-latency formula.

## 6. Reference first slice: request flow

### Model

Topology: one client workload, one balancer, and two or more service nodes. Each service node has a FIFO queue and a configured number of identical workers. A request has arrival time, service duration, and target eligibility. Initially model balancer/network overhead as a declared constant; do not claim full DNS/TCP emulation.

Round-robin cycles over eligible nodes. Least-outstanding chooses the node with the fewest queued plus executing requests; ties follow stable node ID order. Name it accurately instead of calling it least-connections without modeling connections.

**Implemented failure semantics (v1.1.1).** A failure schedule marks a node unavailable at an exact virtual time, and new arrivals avoid it immediately: **health-check detection delay and retries are not modeled**. Each schedule entry chooses in-flight behavior. `FAIL` fails the node's running and queued requests at the failure time, including a queued start at that instant; a completion exactly at the failure time succeeds. `COMPLETE` lets already assigned work finish and preserves worker occupancy through recovery, so recovery never creates extra capacity. A later `FAIL` still drops previously assigned work ([decision 0004](decisions/0004-simulation-causality-corrections.md)). Detection delay or retries would be a separate, versioned feature with its own presets.

### Hand-checkable fixture

Two healthy nodes A and B, one worker each, six requests arriving at time zero in ID order, each needing 100 ms, round-robin, zero overhead, no failures:

- A receives 1, 3, 5; B receives 2, 4, 6.
- Completion latencies are 100, 100, 200, 200, 300, 300 ms.
- Mean latency is 200 ms; nearest-rank p95 is 300 ms.
- Queue waits are 0, 0, 100, 100, 200, 200 ms.
- Six completions over the 0–300 ms observation window give 20 requests/s. Label this finite batch measurement.

Required contrasting presets: a staggered workload with one slow node where the policies diverge; a node failure (implemented without detection delay, see above); overload with a finite queue and rejected requests. Each preset needs a predictive question and a trace-backed explanation.

### Acceptance checks

1. The fixture above matches state, assignment order, latency, queue waits, and throughput.
2. Doubling service duration doubles completion times in the zero-overhead fixture.
3. A selected slow-node fixture produces a documented behavioral difference between policies; do not assert one policy always wins.
4. Every logical request has exactly one terminal outcome or remains explicitly outstanding at truncation.
5. Requests are neither routed to ineligible nodes nor completed twice after failure.
6. Seeded replay is identical; concurrent HTTP runs have isolated state.
7. Backward/forward seek reconstructs the same node queues and metrics.
8. Invalid inputs, unknown model IDs, unsupported versions, and exhausted budgets are visible and tested.

## 7. Required evidence for every later model

Provide a tiny manually calculable fixture, a materially different input, an adversarial/failure input, determinism evidence, state invariants, metric reconciliation, and one browser journey connecting input → transition → explanation. Tests that only check a nonempty trace are insufficient.

Examples of load-bearing assertions: token bucket cannot spend unavailable tokens; duplicate delivery increments attempts without repeating a deduplicated effect; a replica cannot return a version it never received; a stale fencing token is rejected by the protected resource; changing a cache TTL changes the declared expiry boundary.

Consensus simulations additionally require protocol-specific safety tests, not just a plausible election animation. Document simplifications against the primary paper before publishing.

### Serialization and isolation evidence (2026-10-09)

[HLD-04C](work-items/HLD-04C.md) tests actual application JSON serialization with maximum-count/key/value cache input and Unicode/JSON escapes under 512, 4,096, 32,768 and 2,097,152-byte event-array budgets. A two-byte budget emits `[]` while the response still includes initial state/assumptions/metrics, demonstrating the declared boundary. A real random-port HTTP test compares 26 concurrent calls across shared cache, request-flow and limiter beans (including rejected input) with isolated and subsequent results. This establishes deterministic isolation for admitted fixtures, not a throughput benchmark. HLD-11A explicitly raises admission to 32 in this isolation test so it continues to test state independence separately from overload. Production defaults to 2 admitted synchronous runs per process.

### HTTP resource guards (2026-10-10)

[HLD-11A](work-items/HLD-11A.md) caps raw API POST bodies (including chunked/unknown-length streams) and complete serialized simulation JSON independently of the events-array budget. The HTTP filter rejects excess simultaneous runs with 503 before parsing; controller serialization rejects oversized results with 422 before writing success bytes; oversized bodies return 413. Error timestamps are external metadata. These failures return no simulation result, and React requires an explicit retry with the retained inputs. They do not change virtual-time behavior, model/schema versions, or replay for admitted runs not censored by the cooperative wall-clock guard. Hosted network/thread/heap budgets and human release review remain separate gates.

### Delivery transition batches

The standalone `queues-delivery` model now implements explicit effect/expiry/ACK/crash/recovery
and dispatch phases. ACK send/disposition, expiry/requeue-or-dead-letter and crash/cancellations
are admitted as complete batches before any durable or scheduler mutation. Events contain typed
post-event changes; playback reconstruction must apply every preceding delta. Each changed entity is its complete post-event record: replace it by stable
ID rather than shallow-merging. With the configured omitted-null JSON representation, an absent
nullable field clears its former value; it must not preserve an earlier processing pointer. The local guarded
collector preserves partial-prefix populations and reports `no_future_progress` only after all
valid pending actions drain. HLD-14B adds strict draft descriptor/run endpoints and real HTTP guard/isolation evidence
without changing this model, its versions or scheduler. The canonical schemas are validated
lazily in React before presentation; state projection applies all prior deltas by full replacement. See
[HLD-14A](work-items/HLD-14A.md) and [decision 0026](decisions/0026-atomic-delivery-transition-batches.md)
for independent state axes, input/tie policies and actual checks.

### Delivery Guided evidence

HLD-14C targets a returned event by the paired semantic `messageId`/`attemptId`, kind and
1-based occurrence. It reconstructs every preceding full replacement and emitted ledger record.
Canonical validation checks the selected kind actually supports both non-null identities;
consumer-only and enqueue events cannot claim an attempt pair. Java fixtures verify all eight
checkpoint facts and three authored sequence timelines. Model/schema remain 1.0.0/1.0;
illustration selection is not a simulation run. See [decision 0028](decisions/0028-delivery-guided-message-attempt-targets.md).

## Draft finite access analysis

The `data-access-models` model (`1.0.0`, schema `1.0`) executes a bounded sequential list of
ID lookups, tenant ranges, all-tenant ranges and inserts. It has no scheduler, seed or timing.
`createdOrder` is an ordering key, never elapsed milliseconds. Immutable captured inputs and
ordered outcomes reproduce exactly within this version. Initial records are bounded to twenty,
operations to ten, final records to thirty and returned query records to twenty.

The optional ordered-list secondary path groups `(tenant, createdOrder, id)` or
`(createdOrder, tenant, id)`. A single candidate interval is examined, index-covered residual
filters run before base-record fetch, and all matches are fetched before the result limit.
No optimizer, skip scan, covering index or physical pages are modeled. Returned records sort
by creation order then ID regardless of access traversal order. A full traversal still has
one abstract path-opening count; this does not imply an efficient bounded seek.

Primary IDs always stay unique. Optional `(tenant, businessKey)` uniqueness is a separate
sequential write rule. Duplicate ID takes precedence over business-key conflict; rejection
changes no records or indexes. Successful inserts append a base record and count one logical
entry maintained per configured structure. These counters are not physical disk writes.
Counts separately describe entries examined, base records examined, matched/returned records
and maintained entries. No latency or generic efficiency score is computed.

This analysis has no concurrency, crash, durable transaction, retained idempotency result or
exactly-once effect model. The HTTP result remains subject to the existing complete-response
ceiling. [Decision 0029](decisions/0029-finite-data-access-analysis.md) records its boundaries;
[HLD-15A](work-items/HLD-15A.md) records actual semantic and integration evidence.

HLD-15B selects an actual outcome by stable `operationId`, operation `kind` and occurrence
one. Eight checkpoints reuse seven presets; the final insert/query checkpoints reuse the
same immutable Java result. Guided shows only selected-operation counts, captured operation
and before/after populations. Whole-workload totals and later outcomes are not presented as
selected state. Authored Architecture/Operation sequence views are explicit untimed
illustrations and send no Java run. See [decision 0030](decisions/0030-guided-data-access-outcome-targets.md).

## Pure reservation analysis

`transactions-isolation` schema/model 1.0/1.0.0 uses at most four reservations and eight
caller-ordered actions. Every reservation reads once and attempts once after reading. The
unsafe algorithm checks its observed count and assigns observed minus quantity; the protected
algorithm checks current stock and indivisibly decrements it plus records the allocation.

Each complete snapshot reports remaining and allocated units, per-reservation observations
and status, acceptance-ordered allocations and Java-owned nonnegative/capacity/conservation
flags. History-level correctness and the first violating step are separate from completed
execution. Rejections change reservation status without changing stock/allocations.

No database isolation mode, elapsed time, seed, real thread schedule, retries, rollback,
crash durability or idempotency is implied. [HLD-16B](work-items/HLD-16B.md) exposes this unchanged model through strict descriptor/run
APIs and the direct draft route. Presets are selected by semantic ID; Run is explicit.
Playground selects initial/post-step snapshots without manufacturing outcomes; whole-schedule
metrics remain separately labelled. Invalid ordering is rejected without automatic repair. See [decision 0031](decisions/0031-reservation-interleavings-and-invariants.md)
and [HLD-16A](work-items/HLD-16A.md).

## Guided reservation steps

HTTP 1.8 adds the closed stepId/kind/occurrence1 checkpoint family. Select a unique actual
returned outcome and show its complete postState; reject missing/wrong-kind/duplicate matches.
Eight Guided checkpoints use five unchanged presets and all three outcome kinds. The unsafe
first acceptance is a preserved prefix; the empty-stock first attempt shows one rejected actor
and one remaining read observation of zero. Later metrics never become these selected facts.
Manual Architecture and unsafe/conditional/serial sequences are authored illustrations.
[HLD-16C](work-items/HLD-16C.md) records actual verification and remaining curriculum gates.

## Pure transaction atomicity foundation

[HLD-17A](work-items/HLD-17A.md) implements standalone `transaction-atomicity`
schema 1.0 / model 1.0.0 as a pure bounded analysis. The input/result schemas are separate
canonical artifacts; no HTTP/OpenAPI path, Spring registration, catalog simulation ID,
frontend view or Guided target is introduced in this foundation slice. Existing reservation
model 1.0.0 evidence remains unchanged. Actual checks are recorded only in the work item.

### Complete input programs

Input fields are exactly schemaVersion, modelVersion, mode, initialUnits, transactions and
schedule. Mode is `SPLIT_WRITES` or `STAGED_VERSION_CHECK`; initialUnits is an integer from 0..20.
One through three transaction records have id and quantity integer 1..20. Two through twelve schedule steps
have id, transactionId and action. IDs follow whole ASCII `[a-z][a-z0-9-]{0,31}` without
whitespace and are unique within their respective collections. References name known actors.
Each actor follows exactly one of these programs, though actor programs may interleave:

```text
BEGIN → ABORT
BEGIN → DECREMENT_STOCK → ABORT
BEGIN → DECREMENT_STOCK → RECORD_ALLOCATION → ABORT
BEGIN → DECREMENT_STOCK → RECORD_ALLOCATION → COMMIT
```

Reject null/default/coerced values, unsupported versions/variants, malformed/bounded IDs,
unknown references and incomplete/repeated/reversed/post-terminal programs before execution.
Defensive input copies retain null elements for explicit validation. One outcome is returned
for every valid input step; there is no omitted action, partial/limited result, random seed,
timer, real model thread or network call.

### Published and private state

BEGIN captures current remainingUnits and visible-data revision. Split DECREMENT checks
CURRENT stock, publishes its subtraction and records appliedStockUnits; split RECORD publishes
its allocation. Each mutation increments revision once. Split COMMIT changes actor status
only, and split ABORT leaves prior published effects intact.

Staged DECREMENT checks the BEGIN-captured WORKING_COPY and prepares private stock;
staged RECORD prepares pendingAllocation. A nonblocked staged COMMIT compares expectedRevision
with actualRevision before publishing workingRemaining plus its allocation in one action,
incrementing revision once. A mismatch aborts with REVISION_CONFLICT even when current stock
would fit. Every terminal action clears workingRemaining, pendingStockUnits and pendingAllocation
but retains baseRemaining/baseRevision. Discard only that actor's workspace; never restore
the shared BEGIN snapshot over someone else's work.

Insufficient stock produces STOCK_REJECTED, phase BLOCKED and failureReason INSUFFICIENT_STOCK,
with no mutation. A declared later record action returns WORK_SKIPPED. Terminal COMMIT or
ABORT becomes ABORTED retaining the earlier failure. Otherwise explicit ABORT uses USER_ABORT.
Status changes, staging, skipped/rejected work and aborts do not change shared revision.

### Complete Java evidence

State contains remainingUnits, allocatedUnits, revision, transactions, allocations and
invariants. Published remaining/allocated/accounted values are 0..20; revision is 0..6.
There are at most three transaction/visible allocation records and twelve outcomes.
TransactionState preserves id, quantity, phase NOT_STARTED/OPEN/BLOCKED/COMMITTED/ABORTED,
appliedStockUnits and pendingStockUnits. Base history exists after BEGIN; workingRemaining
exists only for staged OPEN/BLOCKED actors, and pendingAllocation only for staged OPEN
prepared records. failureReason is required for BLOCKED/ABORTED and absent otherwise.
Absent work/history is omitted, not null or a fabricated zero.

Visible Allocation contains transactionId, quantity, preparedAtStepId and publishedAtStepId.
Split preparation/publication both name the RECORD action; staged preparation names RECORD
and publication names COMMIT. PendingAllocation contains transactionId, quantity and stepId.
Count every visible allocation, including one belonging to a later-aborted split actor.

Each outcome contains sequence, stepId, transactionId, action, kind, postState and explanation.
Its kind is one of TRANSACTION_STARTED, STOCK_APPLIED, STOCK_STAGED, STOCK_REJECTED,
ALLOCATION_APPLIED, ALLOCATION_STAGED, WORK_SKIPPED, TRANSACTION_COMMITTED or TRANSACTION_ABORTED.
checkedRemaining/checkSource occur only on successful/rejected DECREMENT; expectedRevision/
actualRevision occur only on nonblocked staged COMMIT, success or conflict. reason is required
only on STOCK_REJECTED, WORK_SKIPPED and TRANSACTION_ABORTED. Omit all inapplicable fields.

Java reports remainingNonnegative, allocatedWithinCapacity, unitsConserved, abortedEffectsAbsent
and accountedUnits. The aborted-effects flag fails when an ABORTED actor has applied stock
or a visible allocation. Private preparation is excluded from published totals/flags.
Metrics distinguish committed/aborted/conflicted transactions and abortedTransactionsWithEffects,
final unit counts and history invariantStatus. firstViolationStepId is present exactly for
VIOLATED history, even when final flags recover. Initial flags are all true; finalState equals
the last outcome's postState. `completed` means the complete schedule was evaluated, not
that all transactions committed or every invariant passed.

This original local publication/discard protocol emulates no SQL isolation level, durable
database commit, crash recovery, acknowledgement/lost-response protocol, retry, idempotency or
external effect. [Decision 0034](decisions/0034-transaction-atomicity-model.md) explains the
boundary; a later strict API/runnable experiment needs its own integration and release gates.

## Atomicity HTTP and learning integration

[HLD-17B](work-items/HLD-17B.md) exposes GET `/api/v1/simulations/transaction-atomicity`
and POST `/api/v1/simulations/transaction-atomicity/runs`, using AtomicityDescriptor and the
unchanged canonical input/result contracts. HTTP 1.9 adds these paths; schema/model replay
versions remain 1.0 / 1.0.0. Descriptor limits are maxInitialUnits 20, minTransactions 1,
maxTransactions 3, maxQuantity 20, minSteps 2, maxSteps 12 and maxIdLength 32, derived in Java.

Transport validates exact fields, tokens, duplicate/trailing JSON and complete programs before
model execution. Unknown/null/coerced input is 400; request budget is 413, whole-result budget
422 and shared occupied admission 503. A valid program that aborts is 200 completed analysis.
No partial trace is returned as a replacement for a rejected whole response.

The draft Playground choice `?experiment=atomicity` loads independent descriptor/renderer
state and starts no POST automatically. Explicit edits define what Java runs. Playback selects
returned initial/post-state snapshots only. Private preparation is excluded from published
counts; known zero and absent work have distinct labels. Java history includes every prefix
regardless of the selected state. Study and eight added Practice questions cover this model;
existing reservation Guided/design targets are unchanged and explicitly scoped.

The copied-runtime smoke requires named baseline/protected-baseline/protected-conflict presets
and compares their entire inputs/results with configured Java baseline/protected/conflict
goldens. The maximum-boundary golden remains standalone stress evidence, not a ninth preset.
Actual HTTP/UI/accessibility checks and publication limits are recorded in HLD-17B.

## Guided atomicity steps

[HLD-17C](work-items/HLD-17C.md) adds eight selected-prefix checkpoints without changing
model/schema replay versions or goldens. HTTP1.10 extends the existing stepId/kind/occurrence1
family with the nine actual AtomicityOutcome kinds. Content validates the kind against its
simulationId's canonical outcome capabilities; reservation and atomicity kinds cannot cross.
Java executes every authored target and checks published counts/revision, private workspace,
retained base, reason and all four flags. React selects the returned outcome, without
computing model transitions or a whole-history verdict. Atomicity and reservation Guided
adapters have independent preset caches and distinct saved activities under one topic.
Three authored manual paths explain split abort, staged publication and conservative conflict;
they are labeled illustrations and introduce no simulated time or automatic Java requests.

## Timeouts and retries foundation

[HLD-18A](work-items/HLD-18A.md) implements pure `timeouts-retries` model 1.0.0 / schema 1.0,
with canonical standalone input/result schemas and four actual Java golden pairs. It is not
registered or exposed over HTTP yet. The [retry handoff](TIMEOUTS_RETRIES_IMPLEMENTATION_PLAN.md)
freezes exact fields, eight presets, callback phases, bounds and subsequent API/UI gates.

At most 12 ordered originals and five attempts per original feed one finite worker/FIFO
queue. Timeout begins at send, including queue wait. Caller timeout/overall deadline leave
accepted work alive. Only the current waiting attempt can succeed; completion at either
deadline wins. Originals precede same-time retries and completed work promotes FIFO before
new sends. Retry policy checks attempts, shared finite budget, then delay/deadline eligibility;
budget is rechecked and consumed only at actual retry dispatch.

Snapshots include READY, PENDING_ADMISSION, DECIDING_RETRY and completion-before-response
microsteps. RETRY_SCHEDULED reports a real plan; RETRY_BLOCKED_BY_DEADLINE reports only a
proposal while awaiting the actual deadline. All identities reference sent rows. Historical
causes/timestamps persist; selected snapshots do not borrow whole-result metrics. Java ratios
are sends/originals and completed work/originals, not persisted effects or production latency.

Complete drainage is bounded by 60 sends, 192 callbacks, 384 events and 80000 virtual ms;
internal bug assertions replace silent truncation. No-op timers cannot extend final time.
Jitter uses one run-local recorded seeded generator, and ordinary golden checks never rewrite.
Maximum-boundary in-memory serialization is evidence for that fixture only; HTTP byte/token/
admission guards and real UI accessibility checks require HLD-18B. Cancellation, idempotency,
multiple retry layers, actual networking and durability are outside this model.
