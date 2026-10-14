# Transactions & Isolation

Two people see one available unit and each tries to reserve it. Both reads can be correct
when they happen. The problem is what the system checks when it accepts the reservations.
Use this small example to locate the decision that must protect shared state.

This draft teaches reservation safety through six implemented views. The Java
model executes your chosen interleaving and returns complete snapshots. It has no elapsed
time, database engine, durable commit, rollback or retry behavior. Guided checkpoints select
actual Java post-step evidence. Architecture and Operation sequence are authored untimed
illustrations; reading them sends no Java run.

## Learning outcomes

- Distinguish a client's earlier observation from current shared stock.
- Predict accepted reservations, rejected reservations and allocated units for an interleaving.
- Explain why a nonnegative stock counter does not prove capacity or conservation.
- Identify the condition and mutations that belong to one protected acceptance.
- Defend that boundary to a teammate or interviewer while stating its limits.

## Explain it simply

A read says “I saw one unit.” It does not say “that unit is now mine.” Another reservation
can be accepted between your read and your attempt. The acceptance rule must decide which
state it trusts and which changes happen together.

An **interleaving** is the order in which different reservations' actions take place. An
**invariant** is a rule that must stay true. An **atomic boundary** is a modeled action
within which another scheduled action cannot observe a partial change.

Here, A and B are distinct reservations, not retries of one request. **Accepted** means
recorded in this Java call's local allocation state; it does not mean a durable database
transaction committed or an external payment succeeded.

## Prerequisites

Review **Data Models & Access Patterns** first. Its sequential uniqueness rule separates
record identity from business identity. This module adds a different question: how can two
distinct requests compete for the same limited resource?

Giving A and B different IDs makes them distinct. It does not create a second unit of stock.
The prerequisite remains a draft with its own publication review; this module is also a draft.

## Mental model

```text
Reservation A: earlier observation ─┐
                                   ├─> attempt to reserve
Reservation B: earlier observation ─┘         ↓
                                 current stock + recorded allocations
```

The two observations belong to the reservations. Stock and the allocation list belong to
shared model state. A READ changes an actor's observation and status, but changes neither
stock nor allocations. Before a reservation reads, its observation is **not known**, not zero.

The three Java checks are:

```text
remaining units >= 0
allocated units <= initial units
remaining units + allocated units = initial units
```

The last rule is **conservation**: the units still available plus units already allocated
must account for exactly the starting stock. Count allocation quantities, not just accepted
reservation IDs. One accepted reservation can allocate two units.

## How it works

Each reservation requests a quantity, reads once and attempts once. You supply a complete
schedule with its READ before its ATTEMPT_RESERVE. Java follows that logical order; browser
playback only selects the returned initial state or post-action snapshots.

| Algorithm                      | Value checked at the attempt        | Accepted change                                                                                 |
| ------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| Stale read then write          | The reservation's saved observation | Assign remaining stock from that observation minus its quantity, then append the allocation     |
| Atomic conditional reservation | Current shared remaining stock      | Check availability, decrement current stock and append the allocation as one indivisible action |

Both algorithms accept when their checked value is at least the requested quantity.
The unsafe algorithm deliberately assigns from its old observation; it is not a decrement
of the current counter. That distinction produces the example's exact numbers.

```text
Stale:       old observation sufficient? → assign old value − quantity + record allocation
Conditional: current stock sufficient?  → [current check + decrement + record allocation]
```

The bracket names the protected model boundary. Another scheduled action cannot run inside
it. This is a stated rule of the teaching model, not proof that a real database or service
implements the same boundary.

If the checked value is insufficient, the actor becomes REJECTED with an insufficient-stock
reason. Stock and allocations remain unchanged; the actor's status and decision do change.
Its earlier observed value remains visible after either acceptance or rejection.

Inputs allow initial stock 0–20, two through four distinct reservations, quantities 1–20
and four through eight scheduled actions. Each reservation must have exactly one READ and
one later attempt. Invalid inputs are rejected before modeled transitions. Every valid run
evaluates its complete schedule; there is no timed or truncated prefix mode.

## Worked example

Select **Both read one unit**. Initial stock is 1; A and B each request 1. The full schedule
is READ A, READ B, ATTEMPT A, ATTEMPT B.

| Position      | What the action establishes                                 | Remaining | Allocated | Accepted reservations |
| ------------- | ----------------------------------------------------------- | --------: | --------: | --------------------- |
| Initial state | Neither actor has read                                      |         1 |         0 | None                  |
| READ A        | A observes 1; no allocation                                 |         1 |         0 | None                  |
| READ B        | B also observes 1; no allocation                            |         1 |         0 | None                  |
| ATTEMPT A     | A checks saved 1, writes `1 − 1 = 0`, records A             |         0 |         1 | A                     |
| ATTEMPT B     | B still checks saved 1, writes `1 − 1 = 0` again, records B |         0 |         2 | A, B                  |

Remaining stock is never negative. Nevertheless, allocated 2 exceeds initial 1 and
`remaining 0 + allocated 2 = accounted 2`, not initial 1. Capacity and conservation fail
at `attempt-b`. The run completes, but the business rules have been broken.

Now select **Check current stock atomically**, with the same stock, quantities and schedule.
Both READs still observe 1. A's attempt checks current 1, accepts and leaves remaining 0,
allocated 1. B's attempt checks **current 0**, not its saved 1, so B rejects. B's status
changes, but the stock and allocation list do not. All three invariants hold throughout.

At A's first acceptance, both algorithms show remaining 0 and allocated 1. A valid-looking
selected snapshot does not prove what a later stale attempt will do. Inspect the selected
step and the separately labeled whole-run result.

## Explore in the playground

1. Predict the final accepted IDs and allocated units before running **Both read one unit**.
   Select the initial snapshot and then each of the four returned steps. Observe the
   difference between B's saved value and current stock after A accepts.
2. Run **Check current stock atomically**. Explain B's rejected decision using the checked
   value, requested quantity and unchanged stock/allocation state.
3. Try **A serial test hides the race**: READ A, ATTEMPT A, READ B, ATTEMPT B. B now reads 0
   and rejects even under the stale algorithm. Explain why this one safe order proves no guarantee.
4. Try **Let B attempt first**. The conditional algorithm accepts B and rejects A. It protects
   the resource, but does not promise which client wins or fairness.
5. Try **Enough total stock still loses an update**. Both reservations request 1 from initial
   2 and read before either attempt. Both are accepted under the stale rule; remaining ends
   at 1 and allocated at 2. Capacity holds, but `1 + 2 = 3` does not conserve initial 2.
6. Try **Reserve two units before one**. Initial stock is 2; A requests 2 and B requests 1.
   The conditional rule accepts A, rejects B and ends with zero remaining and two allocated
   units. One accepted reservation is not one allocated unit.
7. Try **A stale assignment restores stock**, using the same quantities under the stale rule.
   A sets remaining to `2 − 2 = 0`. B then sets it to `2 − 1 = 1` while recording another
   allocation. Three units are allocated; accounted units are `1 + 3 = 4`, not initial 2.
8. Try **An empty inventory rejects work**. Reads observe 0; both attempts reject; stock and
   allocations remain zero. Empty stock is valid input and a business result, not a server failure.

Change a stock value, quantity, algorithm or legal schedule order and run again. Keep each
reservation's READ before its attempt; illegal schedules receive validation feedback rather
than an invented result. Changing inputs keeps an earlier result labeled with its submitted
design. Selecting a snapshot does not submit a new analysis or change the modeled schedule.

Practice saves explanations locally. Playground predictions stay on the page; they are not
automatic grades or a claim of mastery. Guided saves paired prediction/tradeoff answers and
requires explicit reveal of selected Java evidence. Architecture and the three Operation
sequence paths provide separately labelled authored illustrations with complete text.

## Failures and tradeoffs

**Tempting wrong explanation:** “Stock stayed at zero, so we cannot have oversold.”
The one-unit fixture records two allocated units while remaining is zero. Check capacity
and conservation as well as the counter's lower bound.

**Another wrong explanation:** “Every step updated its state together, so the stale policy
must be safe.” Both policies make complete action transitions. Only the protected policy
checks the current value inside its acceptance boundary. Atomic changes based on stale
information can still encode the wrong decision.

The conditional algorithm rejects a contender when another reservation consumes its stock.
That rejection is how this boundary preserves the resource rule. In a production system,
contention, waiting, aborts and retry choices have costs; none is timed or implemented here.

The model excludes lock waiting, optimistic versions, rollback, crashes, durability,
replicas, retries, external effects and multiple-resource transactions. “All invariants hold”
means these three checks for this finite input and algorithm, not every business rule.

## In a real project

Start with the invariant and its owner. For an inventory service, availability checks,
inventory changes and allocation records need a defined coordination boundary. Protecting
only the counter while independently writing the allocation leaves another problem to solve.

PostgreSQL documents [transactions that group related changes](https://www.postgresql.org/docs/18/tutorial-transactions.html).
That is a production connection; the model has no real transaction begin, commit or recovery.

A [conditional UPDATE](https://www.postgresql.org/docs/18/sql-update.html) can select qualifying
rows and expose affected-row/RETURNING evidence. In PostgreSQL's documented simple Read
Committed row-update case, a competing update can cause the condition to be rechecked against
the updated row. See [transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html).
This does not establish arbitrary multi-row invariants or turn the two teaching algorithms
into SQL isolation levels.

A [row CHECK constraint has a defined scope](https://www.postgresql.org/docs/18/ddl-constraints.html).
A nonnegative inventory column alone does not express the relationship to a separate
allocation ledger. Verify the complete write path and actual transaction/constraint guarantees.

Useful evidence includes accepted allocation quantities, remaining inventory, rejection
reasons and discrepancies in accounting. Test overlapping contenders against the intended
database path. Separate business rejection from validation errors, unavailable dependencies
and ambiguous responses; this local experiment does not simulate those production failures.

## Interview practice

Use this six-part explanation in roughly two minutes:

1. State the resource, quantity units and required operation.
2. Name nonnegative stock, capacity and conservation requirements.
3. Trace A and B reading the same value before either attempt.
4. Explain the stale assignment with `0 remaining + 2 allocated` from initial 1.
5. Locate the current check, decrement and allocation record in one protected boundary.
6. Defend rejection and identify the next unmodeled correctness question.

Follow-up one: a reservation needs two inventory items. The single-resource model does not
establish an all-or-nothing multi-item guarantee; state which larger boundary needs review.
Follow-up two: the client times out after acceptance and retries. Distinct request IDs and
one attempt per actor establish no deduplication or durable replay result. Define that scope
before claiming idempotency.

Full isolation levels, write skew, abort/rollback behavior and retry semantics remain later
curriculum. The module's title identifies that curriculum; this first draft models one
precise reservation safety comparison.

## Teach it back

Explain to a teammate: “Both reservations saw one unit. The stale implementation trusted
those old observations and set the counter to zero twice while recording two allocations.
We need an owner that checks current stock and records the stock change plus allocation in
one protected action. I would test the actual concurrent write path and accounting, not
just check that stock never became negative.”

Apply the same reasoning to two jobs spending a shared quota. State the remaining quota,
allocated quantity, write boundary and rejected outcome. Attempt a Practice answer, reveal
its reference, compare and revise. Self-check for a clear problem, cached/current distinction,
correct numbers, explicit invariant, precise boundary, one tradeoff and one changed condition.

## Further reading

- [PostgreSQL 18 transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html): documented statement/update behavior and its scope.
- [PostgreSQL 18 UPDATE](https://www.postgresql.org/docs/18/sql-update.html): conditions and evidence of an actual update.
- [PostgreSQL 18 transactions](https://www.postgresql.org/docs/18/tutorial-transactions.html): grouping related database changes.
- [PostgreSQL 18 constraints](https://www.postgresql.org/docs/18/ddl-constraints.html): row and relational constraint boundaries.
