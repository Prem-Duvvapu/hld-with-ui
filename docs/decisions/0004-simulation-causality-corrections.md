# 0004: Correct simulation causality and version the changed behavior

## Context

Review of changes after PR #12 found cache fills applied before their timestamps, queued requests starting on failed nodes, and COMPLETE recovery clearing occupied workers. Cache traces bypassed the shared execution budgets. These behaviors teach incorrect concurrency and failure outcomes.

## Decision

Cache v1.0.1 uses a request-local queue ordered by virtual milliseconds and insertion sequence. Input arrivals are scheduled first; lookups and origin responses are scheduled as arrivals execute. Origin values are sampled at read completion. Version counters detect stale entries, including same-value updates. Missing keys are not cached. All event/time/byte/deadline guards apply. Partial results expose incomplete GETs, observed counts, and a stopping reason.

Request-flow v1.1.1 fails running and queued assignments on FAIL, including a queued start at failure time. A completion exactly at failure time succeeds. COMPLETE preserves all assigned work and worker occupancy through recovery; new arrivals avoid the unavailable node. A later FAIL still drops previously assigned work.

Trace-byte accounting uses a conservative escaped UTF-16 bound plus structural/numeric overhead and array brackets. It may stop earlier than exact UTF-8 serialization would.

## Alternatives

Retaining the sequential cache implementation would misrepresent cold bursts. Sorting its output alone would leave state transitions incorrect. Preserving buggy versions as parallel implementations would increase maintenance without educational value.

## Consequences and migration

Cache v1.0.0 and request-flow v1.1.0 are rejected, rather than replayed with changed semantics. Descriptors, OpenAPI, generated React types, and UI inputs move together. Request-flow v1.0.0 remains accepted without failures; the stricter shared trace estimate can stop large traces earlier. No replay equivalence is promised for previously budget-truncated results.

## Verification

Semantic regressions cover overlapping GETs, updates during reads, version changes, missing keys, byte/event/time limits, queued failures, COMPLETE recovery, and multiple failure windows. UI tests cover changed inputs, partial results, preset seeds, and disabled pending controls. See `../SIMULATION_REVIEW.md` for executed gates and remaining review limits.
