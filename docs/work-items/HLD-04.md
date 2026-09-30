# Work item: HLD-04 slice A — one source for cache-aside input limits

## Objective

The playground's input rules come from the Java model that enforces them, so the two cannot drift. This is the "contract bounds" part of HLD-04 and a precondition for adding cache controls.

## Preconditions

- Roadmap dependencies and their evidence: HLD-01 (#22, #23) and the HLD-03 browser harness (#25–#27) merged.
- Relevant documents: [implementation plan §6 HLD-04](../IMPLEMENTATION_PLAN.md#6-detailed-first-release-work), step 5; plan §2 gap 4.
- Current repository state: clean `main` at `5550a67`.

## Scope

- Added: `CacheAsideLimits` (Java record and constants); `limits` on `CacheAsideDescriptor`; `CacheAsideLimits` schema in OpenAPI, required on the descriptor; regenerated types and a `CacheAsideLimits` alias.
- Changed: `CacheAsideInput` annotations and `CacheAsideSimulator.validate` use the same constants; the playground's field attributes and validation messages read `descriptor.limits`.
- Stable IDs/contracts touched: the cache descriptor response gains a required `limits` object. Accepted inputs and `modelVersion` 1.0.1 are unchanged, because no bound value or behavior changed.
- Explicit exclusions (remaining HLD-04): structured cache/origin state per event, the operation key as a structured field, snapshot byte accounting, response-schema validation of HTTP results, a version decision record, and a runtime check for unsupported versions in the frontend.

## Design

Before this change each bound existed in three places: `@Max`/`@Size` annotations, the simulator's own checks, and hard-coded numbers in the React playground. The Java constants now back all three, and the descriptor publishes them:

| Limit | Value |
| --- | --- |
| `maxLatencyMs` (lookup and origin read) | 10,000 |
| `maxTtlMs` | 60,000 |
| `maxOperations` | 100 |
| `maxOperationTimeMs` | 60,000 |
| `maxKeyLength` | 64 |
| `maxValueLength` | 256 |

Error messages keep their previous wording; only their numbers now come from the limits.

## Acceptance

- [x] `GET /api/v1/simulations/cache-aside` returns `limits` equal to the values validation enforces.
- [x] At the limit (TTL 60,000; 64-character key) a run is accepted; one past the limit (TTL 60,001; 65-character key) returns 400 `invalid_input`.
- [x] Changing the published limits changes the playground's `max` attributes and validation without code changes.
- [x] Generated types match OpenAPI; model version unchanged.

## Verification evidence

| Check actually run | Result | Artifact or reproduction |
| --- | --- | --- |
| `./mvnw -B verify` | pass | New `ApplicationApiTest.publishesTheCacheLimitsItEnforces` |
| Cache playground and page tests | 25/25 pass | New test with a descriptor declaring `maxTtlMs` 500 and `maxOperations` 2: TTL 501 and three operations are rejected with those numbers, and no request is sent |
| Full frontend gate and CI | see PR | Recorded in the pull request |

## Slice B — structured event state

[Decision 0006](../decisions/0006-cache-event-key-state.md): each cache event carries `operation`, `key`, and the key's post-event `cacheEntry`/`originValue`; results carry `initialState`; the extra state is charged to the trace byte budget. Contract additive; `schemaVersion` 1.0 and `modelVersion` 1.0.1 unchanged, with a test showing the largest valid trace still completes.

| Check actually run | Result | Artifact or reproduction |
| --- | --- | --- |
| `./mvnw -B verify` | pass | Four new `CacheAsideSimulatorTest` cases (baseline state at 22/40/72/142 ms, cold burst never shows an entry before the fill, deterministic typed trace with hit state matching outcomes, largest valid trace within budget); existing timing, version, and budget tests unchanged |
| Frontend typecheck and 43/43 Vitest | pass | Fixtures updated to the new required fields; typecheck now rejects fixtures that omit them |

## Handoff

The review follow-up adds OpenAPI validation of real HTTP descriptor/results (all presets, missing keys, Unicode/multiple keys, and virtual-time-limited runs). The frontend rejects unsupported cache model/schema versions, preset versions, unknown event kinds, and missing initial state with a recoverable error. This is a scoped compatibility gate, not full runtime JSON Schema validation. Browser tests cover rejection and successful retry. HLD-05 (cache diagram and playback) is next; it can render `initialState` and each event's key state without parsing narration.

Verification results for this follow-up are recorded in its pull request. Manual zoom and screen-reader review remain separate release gates.
