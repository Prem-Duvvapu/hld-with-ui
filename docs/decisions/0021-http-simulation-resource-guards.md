# Decision 0021: Bound synchronous simulation HTTP resources

## Context

The pure Java models already bound input counts and the runner's emitted events array.
Those limits do not bound raw JSON before parsing, non-event result fields, or the number
of concurrent requests across all three simulation beans. HLD-04C proves isolation for
admitted requests; it does not establish hosted capacity. Resource hardening is part of HLD-11.

## Decision

Add guards at the synchronous HTTP boundary, keeping model behavior and versions unchanged.
Use validated `hld.http` configuration with these inclusive limits:

| Property / environment variable | Default | Startup-valid range |
| --- | --- | --- |
| `max-request-bytes` / `HLD_MAX_REQUEST_BYTES` | 262,144 | 512–1,048,576 |
| `max-simulation-response-bytes` / `HLD_MAX_SIMULATION_RESPONSE_BYTES` | 4,194,304 | 512–16,777,216 |
| `max-concurrent-simulations` / `HLD_MAX_CONCURRENT_SIMULATIONS` | 2 | 1–32 |

`HttpResourceFilter` bounds every `/api/v1/` POST before parsing. Check known Content-Length,
then read at most cap + 1 raw bytes for both known and unknown/chunked lengths. Whitespace,
Unicode encodings and JSON escaping count as transmitted bytes. Reject oversized bodies
with 413 `request_too_large`; reject trailing JSON roots rather than silently ignoring them.

All simulation run paths share one process-local semaphore. Try admission before reading
the body and hold it through synchronous parsing, model execution, serialization and response
writing. No request queue is introduced. Excess runs receive 503 `simulation_busy` with
`Retry-After: 1`; the header suggests a delay, not guaranteed capacity. GET health, content
and descriptors and estimator calculations do not consume simulation permits. All acquired
permits are released in `finally`, including failures and disconnected writes.

`SimulationResponses` serializes a successful result exactly once with the application's
configured Jackson mapper into a bounded UTF-8 output buffer. Check each write before it
exceeds the cap. Return the original JSON shape as application/json bytes only after successful
serialization. Overflow produces 422 `result_too_large`, with no partial successful trace.
Other serialization failures remain internal errors. This ceiling applies to successful
simulation results; general ApiErrors, GET payloads and estimator results use their existing
bounded contracts and are not serialized through this helper.

Use the existing `ApiError` envelope. Reconcile the closed OpenAPI schema to include required
`timestamp`, which Java already emitted. React's existing error handling keeps controls and
requires explicit retry. Flow/limiter keep a labeled previous result; cache clears its result.

## Alternatives

- Model-only event limits omit raw requests, non-event fields and aggregate execution.
- A servlet form-upload limit does not bound these JSON request streams.
- Truncating serialized JSON would produce an unusable trace and hide lost outcomes.
- Serializing to an unbounded array and checking afterwards allocates excess output first.
- Response-body advice would complicate exception handling and risk a second serialization.
- A server queue or asynchronous jobs would add lifecycle and waiting policies beyond this slice.

## Consequences and migration

No model/schema versions, successful JSON shapes, dependencies, services or browser storage
formats change. Regenerate API types for the error statuses and timestamp correction.
Admitted, serializable runs retain their replay semantics; HTTP failures produce no run.
The existing cooperative wall-clock guard still makes censored results non-replayable.

The default request cap accommodates the maximum escaped cache fixture (197,360 bytes).
The largest measured response fixture is 835,283 bytes; the 4 MiB policy leaves headroom
above the runner's 2 MiB estimated events-array budget and bounded non-event fields. The
default admission count is conservative policy, not a measured throughput or heap capacity.
New/larger models must verify these budgets before publication.

This is not a total JVM heap ceiling: domain objects, Jackson buffers, growable output-buffer
capacity and the final byte-array copy use memory. Slow body reads and response writes can
hold permits. Socket/proxy deadlines, server threads, host memory sizing, cross-replica quotas
and asynchronous lifecycles need separate work. GET availability under a held permit proves
only that these paths do not acquire it; it does not prove resilience to thread exhaustion.

## Verification

[HLD-11A](../work-items/HLD-11A.md) records executed checks and measured fixture sizes.
Real random-port HTTP tests exercise exact/over-bound bodies, chunked input, accepted matrix
and encoded paths, admission across models, readable GETs, response overflow, parse/version/
validation/model failures, and subsequent recovery. Unit tests cover UTF-8/escape output
boundaries, disconnected writes, permits held through response writes and invalid startup
configuration. Browser tests validate a real Java error against OpenAPI and distinguish
mocked error/retry rendering from Java guard behavior. Tests that need subsequent admission
poll only transient busy replies for a bounded deadline: the client can finish reading before
the preceding filter releases its permit. Explicit overload assertions never retry.
