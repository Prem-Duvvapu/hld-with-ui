# 0034 — Model split publication, staged work and abort

## Context

The reservation draft demonstrates stale/current acceptance decisions using complete actions.
It deliberately has no intermediate stock/allocation writes or abort behavior. A separate
bounded experiment is needed to show what remains when related writes are published separately,
and what a protected operation discards before publication. Extending reservation replay would
silently change that first model's guarantees and exact evidence.

## Decision

Implement a pure `com.hld.atomicity` analysis with simulation ID `transaction-atomicity`,
schema 1.0 / model 1.0.0. Caller-ordered programs operate on one shared inventory and allocation
list. One through three transactions each have quantity 1..20; initial stock is 0..20.
Two through twelve steps have stable unique IDs and one of BEGIN, DECREMENT_STOCK,
RECORD_ALLOCATION, COMMIT or ABORT. Each actor follows exactly one complete program:

- BEGIN → ABORT.
- BEGIN → DECREMENT_STOCK → ABORT.
- BEGIN → DECREMENT_STOCK → RECORD_ALLOCATION → ABORT.
- BEGIN → DECREMENT_STOCK → RECORD_ALLOCATION → COMMIT.

Validate every field, reference and complete program before executing any step. IDs use
whole-value lowercase ASCII grammar `[a-z][a-z0-9-]{0,31}` without whitespace. No null,
implicit default or coercion changes the intended program. Preserve null elements in
defensive input copies long enough for explicit validation to reject them.

`SPLIT_WRITES` checks current shared stock and applies the decrement immediately, then
publishes the allocation on its separate action. Each visible mutation increments revision.
Its COMMIT changes only the actor's phase; ABORT leaves its published effects in place.

`STAGED_VERSION_CHECK` captures remaining stock and revision at BEGIN. Its decrement checks
that working copy and prepares stock privately; its record prepares a private allocation.
COMMIT compares captured and actual visible-data revision, then publishes stock plus allocation
in one complete action only if they match. A conflict aborts/discards even when current stock
could satisfy the quantity. ABORT discards only that actor's private work; it never restores
a saved global snapshot or removes another actor's publication.

Every terminal action clears workingRemaining, pendingStockUnits and pendingAllocation while
retaining baseRemaining/baseRevision history. Insufficient stock is a valid runtime decision:
STOCK_REJECTED records INSUFFICIENT_STOCK, later record work returns WORK_SKIPPED, and the
terminal action aborts retaining that failure. Otherwise explicit ABORT uses USER_ABORT;
staged revision mismatch uses REVISION_CONFLICT. Each input step has one actual outcome.

Java owns all published/private state, immutable snapshots, explanations, flags and metrics.
Revision covers visible stock/allocation changes only: split decrement+1, split record+1,
staged publication+1; BEGIN/private work/status/abort do not increment it. Java reports
remainingNonnegative, allocatedWithinCapacity, unitsConserved and abortedEffectsAbsent.
The last flag detects published effects belonging to an ABORTED actor, using its
appliedStockUnits and visible allocation. Allocation totals include split-aborted rows.
History retains the first failed prefix even when later published state becomes consistent.

This first slice includes pure Java, standalone schemas and actual configured-mapper goldens.
It adds no Spring model registration, controller, HTTP/OpenAPI path, catalog entry, UI or
Guided selector. Existing reservation schema/model/goldens and every legacy target remain
unchanged. [HLD-17A](../work-items/HLD-17A.md) records implementation and actual evidence.

## Alternatives

A reservation version bump would combine different experiments and require replay migration.
Real database transactions or threads would add infrastructure/scheduling behavior beyond the
learning question. A generic transaction framework is unnecessary for two concrete algorithms.
Showing final conservation alone would hide both a temporary split prefix and an aborted actor
whose complete pair remained visible. Rolling shared state back to BEGIN would incorrectly
erase another transaction's intervening publication. Staging without revision validation would
permit publishing against an obsolete shared base.

## Consequences

The first story uses one unit and one transaction. Two-transaction contrasts make the explicit
optimistic revision guard visible without promising fairness or retry. Protected public state
remains consistent while its private workspace can contain only half the prepared pair.
Split success can end with every final flag true while history is VIOLATED; split abort after
both writes can preserve conservation while failing abortedEffectsAbsent. Completed means
the schedule was evaluated, not that every transaction committed or every check passed.

The finite bounds are published remaining/allocated/accounted 0..20, revision 0..6, at most
three transaction/visible allocation records and twelve outcomes. Input bounds constrain all
work, with no elapsed time, seed, random choice, actual model threads, network or shared
mutable state between runs.

This is original local publication/discard behavior, not SQL isolation-level emulation or
database recovery. A modeled COMMITTED phase establishes no durability, crash recovery,
acknowledgement, lost-response resolution, retry, idempotency or external-effect atomicity.
The foundation remains unavailable as a learning UI until a later vertical integration passes
its gates; technical draft development and publication remain separate.

## Migration

No existing runtime consumer or replay migration changes in this slice. After its verified
merge, add an independent strict API/descriptor and explicit second experiment inside the
existing canonical `transactions-isolation` draft. Register the additional simulation ID only
when actual endpoints and renderer exist. Preserve old activity IDs/saved answers and visibly
scope the existing eight Guided checkpoints/design views to the reservation experiment.
New atomicity Guided targets are a later decision backed by actual authored checkpoints.

## Verification

Require exact eight presets, blocked/skipped/terminal reason precedence, all seventy legal
two-actor four-action interleavings at stock 1 and 2, abort isolation, revision conflicts with enough
stock, quantities/bounds, validation-before-transitions, immutable ownership/replay/request
isolation, configured-mapper omission/roundtrip and actual standalone-schema golden comparison.
Measure representative wire sizes without claiming a global maximum or performance benchmark.
Relevant inherited checks and final-head CI protect existing modules; they do not make this
new model publicly callable. Actual results belong in [HLD-17A](../work-items/HLD-17A.md).

Original model rules use these limited primary-source connections, reopened on 2026-10-14:
[PostgreSQL 18 Transactions](https://www.postgresql.org/docs/18/tutorial-transactions.html)
explains grouped database updates;
[ROLLBACK](https://www.postgresql.org/docs/18/sql-rollback.html) discards updates inside its
actual transaction boundary; [COMMIT](https://www.postgresql.org/docs/18/sql-commit.html)
describes real database publication/durability. The split algorithm has no common rollback
boundary, and the staged algorithm supplies no persistent database guarantee. No vendor
implementation, SQL machinery or assets are copied.
