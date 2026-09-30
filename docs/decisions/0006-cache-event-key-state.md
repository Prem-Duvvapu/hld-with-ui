# 0006: Cache-aside events carry their key's state

Status: accepted — 2026-09-30

## Context

Cache playback (HLD-05) must show the cache and origin at any selected event. Cache events carried only `requestId` ("Operation N"), `nodeId`, and English narration, so a renderer could only learn the key, values, versions, or expiry by parsing `message`, which the simulation rules forbid.

## Decision

- Each `CacheAsideEvent` adds `operation` (1-based input position), `key`, and the key's state **after** the event: `cacheEntry` (value, version, `filledAtMs`, `expiresAtMs`; absent when the cache holds no entry) and `originValue` (value, version; absent when the origin has no such key).
- `CacheAsideResult` adds `initialState`: availability flags and the origin keys before the first event (the cache always starts empty).
- The state at event *i* is `initialState` with each event's key state applied in order up to *i*. Each event changes at most its own key, so this is exact.
- The simulator applies `origin.update` and `cache.fill` state changes before emitting their events, so the carried state is post-event. Recording an event has no effect on outcomes, so this reorder changes no result.
- The key state is charged to the trace byte budget via `EventEmitter.emit(event, extraBytes)`, using the same conservative string estimate as the rest of the event.

## Alternatives

- **Full snapshot of every key on every event.** Rejected: with 100 keys and 256-character values, one event could approach 200 KB, so realistic inputs would stop at the 2 MiB budget.
- **Untyped deltas, or parsing narration.** Rejected by the simulation rules.
- **Shared `SimulationEvent` gains optional state fields.** Rejected: request flow would carry cache-shaped fields it never uses.

## Consequences and migration

Additive envelope change: result `schemaVersion` stays `1.0` and `modelVersion` stays `1.0.1`. No results are stored or exported anywhere yet (HLD-08), so no serialized result can be misread. Model semantics are unchanged: event order, times, kinds, outcomes, and metrics are identical, and all existing simulator tests pass unmodified apart from type names. The larger per-event byte estimate could in principle move a trace-size boundary. A test runs the largest valid trace (100 GETs, TTL 0, 256-character values; 300 events) and it still completes under the default budget, so no valid input's result changes.

## Verification

- `baselineEventsCarryTheStateTheLessonExplains`: fill at 22 ms stores v1/version 1 until 122; after the update at 40 the origin is v2/version 2 while the cache is version 1; the hit at 72 serves the older version; the refill at 142 stores v2 until 242.
- `coldBurstShowsNoCacheEntryBeforeTheFirstFill`: every reconstructed state before the first fill has an empty cache.
- `structuredTraceIsDeterministicAndHitStateMatchesOutcomes`: repeated runs give equal typed traces; hit state matches returned value and staleness.
- `largestValidTraceStaysWithinTheDefaultByteBudget`.
