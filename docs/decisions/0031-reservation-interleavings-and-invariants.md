# 0031 — Model reservation interleavings and the acceptance boundary

## Context

Data access teaches efficient reads and sequential write rules. Transactions & Isolation
needs a concrete example of distinct callers making stale decisions about the same stock.
A nonnegative stock counter can conceal inconsistent recorded allocations.

## Decision

Implement a finite, untimed Java reservation analysis. Caller-supplied schedules contain
one READ and one later ATTEMPT_RESERVE for each of two through four reservations.
Compare STALE_READ_WRITE with ATOMIC_CONDITIONAL_RESERVATION. The unsafe algorithm checks
its saved observation and assigns remaining stock from it. The protected algorithm checks
current stock and changes stock plus its allocation record in one indivisible modeled step.

Java reports complete immutable initial/post-step snapshots, original step/reservation IDs,
acceptance or rejection and capacity/nonnegative/conservation evidence. Completion means
all valid scheduled actions were evaluated; an unsafe completed run can violate the rule.
A rejected reservation changes its local status while preserving inventory and allocations.

The first contribution contains only pure Java behavior, canonical standalone schemas,
actual configured-mapper golden examples and verification. No HTTP endpoint, topic catalog
entry, frontend capability or new Guided selector is advertised before integration exists.
No shared transaction framework or dependency is needed.

## Alternatives

Actual threads would make modeled ordering depend on execution scheduling. Fake millisecond
events would imply timing absent from the analysis. Naming algorithms after database isolation
levels would overstate their semantics. A counter-only result would miss the allocation breach.
Generic patches would add nullable-merge complexity to a maximum of eight small snapshots.

## Consequences

Schema/model start at 1.0/1.0.0. Existing APIs and models are unchanged. Results can exceed
initial stock in their allocated/accounted counts because that unsafe example is intentional.
The first slice is unavailable as a learning UI and incomplete as the full transaction topic.
There is no database engine, lock waiting, MVCC, rollback, crash durability, retry, idempotency
or external effect guarantee. The later protected write boundary needs its own production review.

## Migration

No runtime consumer changes in this slice. The next API/UI contribution exports these
contracts through actual paths, registers one explicit draft and reuses the module shell.
Later Guided targets must select actual step identities without repurposing existing enums.

## Verification

Exact baseline and contrasting fixtures, all six legal two-reservation orders, input rejection,
immutable ownership/request isolation, serialization/schema agreement and unsafe quantity
bounds are required. Actual results are recorded in [HLD-16A](../work-items/HLD-16A.md).
