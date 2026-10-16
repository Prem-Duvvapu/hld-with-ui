# 0037 — Separate caller waiting from server work

Date: 2026-10-16. Status: accepted for the bounded retry foundation.

## Context

The queue-capacity draft explains waiting and rejection; delivery explains ledger effects,
ACKs and redelivery. Neither is an HTTP caller retry policy. Reusing a broker lease as a
caller deadline would obscure the question: does stopping a wait remove accepted work?

## Decision

Create pure `timeouts-retries` model 1.0.0 / schema 1.0 with one finite worker/FIFO dependency
and a single retry owner per logical request. Caller attempt state and server-work state
are separate. A caller timeout/deadline leaves accepted work queued/running; a late
completion cannot revive the caller or cancel a newer attempt. No business effect is modeled.

Use a run-local seeded stream for chosen jitter and explicit callback phase priority:
completion, overall deadline, attempt timeout, original send, retry send. Input order and
stable insertion break ties. Completion exactly at either deadline succeeds. Queue promotion
follows completed work before new sends. A finite batch retry budget is consumed only on
actual retry dispatch, with checks at planning and dispatch; it is not a token bucket.

Emit complete immutable snapshots, including zero-time `READY` / admission / `DECIDING_RETRY` and
completion/success microsteps. An explicit blocked-by-deadline event exposes why no retry
was scheduled while the request waits for its actual overall deadline. Ignore stale timers
and stop after clients terminate and accepted work drains. Proven finite callback/event/time
bounds support a complete result, with internal bug assertions rather than silent truncation.

## Alternatives

Using real threads/sleep would make scheduling and replay machine dependent. Combining
with broker redelivery would conflate ACK ownership and caller response policy. Adding
business deduplication here would require its own atomic effect/result boundary; that
belongs to the subsequent idempotency contribution. Multiple retry layers and variable
per-attempt service times can be separate explicitly versioned models when required.

## Consequences and migration

Existing model versions, registry/catalog and API behavior do not change in this foundation.
Only actual API/renderer integration will register the new draft capability. Explicit
completed-work and attempt denominators avoid presenting duplicated work as duplicated
business effects. Publication still needs prerequisite/human/hosted gates.

## Verification

[HLD-18A](../work-items/HLD-18A.md) records actual semantic, validation, immutable replay,
serialization/schema, bounded maximum and required CI/delivery evidence. The
[implementation handoff](../TIMEOUTS_RETRIES_IMPLEMENTATION_PLAN.md) records exact fixtures,
state vocabulary, bound proof and the next React/API/Guided contributions.
