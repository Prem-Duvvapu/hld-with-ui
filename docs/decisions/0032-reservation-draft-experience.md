# 0032 — Connect reservation evidence to a bounded draft experience

## Context

[Decision 0031](0031-reservation-interleavings-and-invariants.md) established Java-owned
reservation evidence. Learners need to change an interleaving, inspect each prefix and explain
why a nonnegative stock counter alone does not establish capacity or conservation.

## Decision

Expose the unchanged schema/model 1.0/1.0.0 through explicit descriptor and run endpoints.
HTTP 1.7 exports the canonical schemas and a closed descriptor with Java-owned limits and
presets. Strict transport parsing rejects duplicate, trailing, unknown and coercible fields;
integer JSON tokens are required. Existing byte budgets and process-local admission apply.

Register one draft topic in the canonical catalog, with only Playground, Study and Practice
at `/draft/topics/transactions-isolation`. Default selection finds `unsafe-baseline` by ID.
Run is explicit. Editable reservations and steps have stable internal keys independent of
semantic IDs; step links resolve the actor's current ID at submission. Reordering can create
an invalid schedule, which is reported without silently repairing it.

React renders complete Java initial/post-step snapshots. Selected-prefix flags and whole-run
history metrics are separately labelled. Lazy schema/reference checks reject incompatible or
unrelated success responses without calculating availability, stock, allocations or invariants.
Failed/pending runs retain the previous evidence and learner prediction. Shared Study/Practice
supports locally saved explanations and exact draft-question resume.

## Alternatives

Recomputing the protected algorithm in React would create a second authority. Automatically
running on each edit would hide the prediction/experiment boundary. Publishing a runnable draft
would skip learner, hosted and prerequisite gates. Advertising Guided/design tabs now would
claim capabilities whose authored experience has not been completed.

## Consequences

Eight scenarios and eight original Practice questions become directly reviewable. Public
catalog/search/bookmarks/path destinations retain their existing publication behavior. The
module models logical reservation steps, without database latency, isolation levels, MVCC,
lock waiting, rollback, retries, durable commits, crashes or idempotency guarantees.

## Migration

Deploy frontend and backend together for the new HTTP family. Existing model versions and
unsafe/protected goldens are unchanged. Add the later Guided, Architecture and Operation
sequence contribution only after its evidence and capability agreement are verified.

## Verification

[HLD-16B](../work-items/HLD-16B.md) records actual HTTP input/limit tests, canonical drift,
client/UI checks, Java browser flows, responsive/focus/zoom evidence and copied-jar comparison.
A successful local artifact is separate from the unresolved hosted deployment gate.
