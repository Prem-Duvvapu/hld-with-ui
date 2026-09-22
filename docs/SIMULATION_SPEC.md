# Simulation authoring and correctness contract

Status: proposed contract. `P0-02` implements its machine-readable schemas. The first load-balancing module is the reference implementation; later models must not bypass its execution and validation boundaries.

## 1. What an experiment promises

An experiment computes state transitions from inputs. A guided animation may replay those transitions, but cannot fabricate them. Every model declares what it represents, what it omits, input bounds, failure behavior, and metric definitions.

Distinguish three modes in the UI: **simulation** (modeled behavior), **estimator** (assumptions and formulas), and **lab** (observed behavior of actual software). Results must retain this distinction in exports.

## 2. Deterministic execution

- Run a discrete-event queue ordered by `(virtualTimeMicros, insertionSequence)`. Time is an integer; use documented unit conversions and guard overflow.
- Same model version, normalized inputs, seed, and scheduled actions produce the same semantic trace. Exclude correlation IDs and wall-time metadata from equality.
- Assign the sequence when scheduling. Events may schedule additional events at the same time; all tie rules are documented and tested.
- Use a versioned seeded PRNG abstraction; do not depend on unspecified iteration order. Separate workload randomness from failure randomness so a comparison can retain the same arrivals.
- Models are request-local. Two simultaneous runs must not affect each other. Java thread scheduling must not decide simulated behavior.
- Nodes have finite workers, queues, service times, and explicit failure/recovery rules when those mechanisms are relevant. Merely coloring a node red is not failure simulation.
- Failure schedules refer to stable entity IDs and virtual timestamps. Specify whether in-flight work fails, pauses, or completes for each modeled failure.
- Every run stops on completion or a declared budget. No infinite retry or zero-time event loop.

## 3. Proposed Java interface

Illustrative API, to finalize with the first slice:

```java
public interface SimulationModel<I> {
    ModelDescriptor descriptor();
    I validateAndNormalize(JsonNode input);
    SimulationResult run(I input, SimulationContext context);
}
```

The context supplies virtual scheduler, seeded randomness, bounded event emission, and budget checks. The model owns its typed domain state. HTTP parsing and Spring dependencies stay outside the model. Descriptors include renderer kind, schema/model versions, defaults, presets, assumptions, and limits. Use an explicit registry with duplicate-ID detection.

## 4. Trace shape and playback

Required event envelope:

| Field | Meaning |
| --- | --- |
| `sequence` | Strictly increasing emitted event number |
| `timeMicros` | Nondecreasing virtual timestamp |
| `kind` | Closed, versioned event type such as `request.queued` |
| `entityId` | A node, queue, cache, replica, or other defined entity |
| `requestId` | Optional logical request identity; attempts have a separate ID |
| `causedBySequence` | Optional earlier event that explains this event |
| `payload` | Typed state change or bounded snapshot |
| `explanationKey` / `explanationArgs` | Rule and actual values used for narration |

A result contains initial state, events, final state, summary metrics, completion status (`completed`, `limited`, `failed`), and model assumptions. `limited` results carry `truncationReason`, last virtual time, and incomplete-request counts. Internal failures return an explicit error; do not present corrupted partial output as a successful lesson.

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

Round-robin cycles over eligible nodes. Least-outstanding chooses the node with the fewest queued plus executing requests; ties follow stable node ID order. Name it accurately instead of calling it least-connections without modeling connections. Health eligibility changes according to the configured detection delay.

For initial node-failure behavior, fail in-flight/queued work on that node explicitly; leave retries disabled until their model exists. Recovery restores empty workers. A later implementation may add alternative failure semantics with its own version/preset.

### Hand-checkable fixture

Two healthy nodes A and B, one worker each, six requests arriving at time zero in ID order, each needing 100 ms, round-robin, zero overhead, no failures:

- A receives 1, 3, 5; B receives 2, 4, 6.
- Completion latencies are 100, 100, 200, 200, 300, 300 ms.
- Mean latency is 200 ms; nearest-rank p95 is 300 ms.
- Queue waits are 0, 0, 100, 100, 200, 200 ms.
- Six completions over the 0–300 ms observation window give 20 requests/s. Label this finite batch measurement.

Required contrasting presets: a staggered workload with one slow node where the policies diverge; a node failure with detection delay; overload with a finite queue and rejected requests. Each preset needs a predictive question and a trace-backed explanation.

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
