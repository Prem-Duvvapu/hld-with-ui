# Transactions & Isolation

Two people see one available unit and each tries to reserve it. Both reads can be correct
when they happen. The problem is what the system checks when it accepts the reservations.
Use this small example to locate the decision that must protect shared state.

This draft contains two named experiments. **Reservation race** teaches stale/current
acceptance through six views. **Atomicity & abort** asks what remains when stock and its
record are written separately. It has its own Playground, eight Guided checkpoints,
Architecture and three manual Operation sequences, plus the shared Study and Practice.
Choose the experiment within any of its four experiment-specific views.

Java executes the chosen logical schedule and returns complete snapshots. Neither experiment
has elapsed time, a database engine, durable storage, crash recovery, retries or idempotency.
The reservation model has no abort behavior. The atomicity model has an explicit local
publication/discard rule and revision check; those are not SQL isolation or recovery behavior.
Authored diagrams are untimed illustrations and reading them sends no Java run.

## Learning outcomes

- Distinguish a client's earlier observation from current shared stock.
- Predict accepted reservations, rejected reservations and allocated units for an interleaving.
- Explain why a nonnegative stock counter does not prove capacity or conservation.
- Identify the condition and mutations that belong to one protected acceptance.
- Defend that boundary to a teammate or interviewer while stating its limits.
- Separate published inventory and allocations from a transaction's private proposal.
- Explain what split-write abort leaves behind and what staged abort discards.
- Distinguish final quantity checks, aborted effects and whole-history correctness.

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

### Atomicity and abort

A reservation changes stock and records who received it. If those writes are published
separately, stopping between them can leave only half the work. An abort label does not
erase a write that was already published outside a shared rollback boundary.

The second experiment starts with one transaction A requesting one unit. **Published state**
is the inventory and allocation list the model has made visible. **Private work** is an
unfinished proposal that has not been published. **Atomic publication** makes both pieces
visible in one complete model action. A staged abort discards that transaction's private
proposal; it never restores a global snapshot over another transaction's work.

The reservation experiment still uses complete acceptance actions without abort. Atomicity
& abort uses a different Java model. Its **COMMITTED** phase means local modeled publication,
not durable storage, a delivered acknowledgement or a successful external payment.

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

### Published state and private work

Keep three facts separate: what is published, what each transaction has prepared privately,
and its current phase. An **OPEN** transaction is unfinished; **BLOCKED** records insufficient
stock; **COMMITTED** or **ABORTED** is a terminal model decision.

The atomicity model adds a fourth Java check: **aborted transactions have no published
effects**. A stock-only abort may leave consumed stock without any record. An abort after
both split writes may leave a complete stock/record pair. Conservation can pass in that
second case even though an aborted actor's effects remain. Published records always count,
including records belonging to ABORTED split actors.

Private stock or allocation proposals are excluded from published totals and invariant flags.
An absent workspace means no active private proposal; a proposal containing zero remaining
units is a known value, not missing data. The captured base is retained as history after
terminal decisions; it is different from active work.

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

### Prepare, validate, publish or discard

Each atomicity transaction has one of four complete programs. Transactions may interleave,
but each actor must keep its local order:

```text
BEGIN → ABORT
BEGIN → DECREMENT_STOCK → ABORT
BEGIN → DECREMENT_STOCK → RECORD_ALLOCATION → ABORT
BEGIN → DECREMENT_STOCK → RECORD_ALLOCATION → COMMIT
```

| Mode | Stock and record actions | Terminal decision |
| --- | --- | --- |
| Publish writes separately | Check current published stock, publish its change, then publish the allocation separately | COMMIT changes phase only; ABORT leaves those already published effects |
| Stage privately, validate revision, publish together | Capture stock and revision at BEGIN; prepare stock and allocation privately | COMMIT validates that revision, then publishes both together; ABORT discards private work |

A **revision** is a model counter that changes when published inventory or allocations
change. It is not elapsed time. Private preparation, actor phase changes and aborts do not
advance it. The staged commit compares its captured revision with the current published
revision before applying the complete proposal. A mismatch produces **REVISION_CONFLICT**
and discards only that actor's workspace, even if current stock could fit its quantity.

Insufficient stock is valid business evidence: the stock action returns **STOCK_REJECTED**,
the later record action returns **WORK_SKIPPED**, and the terminal action returns
**TRANSACTION_ABORTED** with **INSUFFICIENT_STOCK**. An otherwise explicit abort uses
**USER_ABORT**. Java evaluates every declared step, rather than silently dropping later work.

Atomicity inputs allow stock 0–20, one through three transactions, quantities 1–20 and two
through twelve steps. Each actor needs a complete program; invalid ordering is rejected
before transitions. No actual threads, clocks, SQL statements or retry loop run in the model.

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

### One unit, a stock write, then abort

Choose **Atomicity & abort**, then **Abort between separate writes**. Initial stock is 1;
A requests 1. Predict what remains after BEGIN, DECREMENT_STOCK, ABORT before running it.

| Selected moment | Split published remaining / allocated / revision | Staged published remaining / allocated / revision | Private staged work |
| --- | --- | --- | --- |
| Initial | 1 / 0 / 0 | 1 / 0 / 0 | Absent |
| begin-a | 1 / 0 / 0 | 1 / 0 / 0 | Captured stock 1 / revision 0; private remaining 1 |
| decrement-a | 0 / 0 / 1 | 1 / 0 / 0 | Private remaining 0; one stock unit prepared; no private allocation |
| abort-a | 0 / 0 / 1 | 1 / 0 / 0 | Workspace discarded; zero stock units still prepared |

Under split writes, stock was already consumed before any allocation existed. At
`decrement-a`, A is OPEN: conservation fails, but the aborted-effects check is still true
because A has not aborted yet. At `abort-a`, A becomes ABORTED with USER_ABORT and one
already-published stock unit. Conservation and the aborted-effects check are now both false.
The first violating step remains `decrement-a`.

Now select **Discard unpublished stock work**. The same program prepares stock privately
while published remaining stays 1 and allocated stays 0. Abort clears the private workspace
and retains captured base history. All four published-state checks stay true throughout.

Inspect **Publish both pieces together** next. Published stock stays 1 with zero allocations
through `record-a`. At `commit-a`, expected and actual revision both equal 0, so Java publishes
remaining 0 and allocation 1 together and advances revision to 1. The visible row was
prepared at `record-a` and published at `commit-a`; preparation and publication are different facts.

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

### Try the atomicity experiment

[Open the atomicity Playground](/draft/topics/transactions-isolation?experiment=atomicity).
Opening or choosing an experiment does not run it. Select a scenario manually, write a
prediction, choose **Run atomicity experiment**, then inspect its initial and post-step states.

1. Compare **Abort between separate writes** and **Discard unpublished stock work**. Name
   which state changed at the stock step and which work the abort can discard.
2. Compare **A repaired final state has a history** and **An aborted actor still has effects**.
   Both can end with conserved quantities; only the aborted one fails the fourth final flag.
   The split stock-only prefix remains a history violation in both.
3. Try **Blocked work completes with an abort**. Explain the BLOCKED phase, explicit skipped
   record and terminal INSUFFICIENT_STOCK reason without calling valid zero stock invalid input.
4. Try **Two private proposals share one base**, then **A revision conflict despite enough stock**.
   Both start from revision 0; A publishes first and B rejects revision 0 versus 1. The second
   scenario leaves two current units, so B's one-unit request still fits despite its conflict.
5. Change one quantity, mode or ordered step. Actor ID edits leave step references explicit;
   update them yourself. Add/remove/reorder controls change inputs, not returned evidence.
   Invalid complete programs receive feedback without automatic repair.

Published counts and private work have separate regions. Selected flags describe the current
snapshot; whole-history metrics cover all returned steps. An API error supplies no new model
result, so prior evidence remains labelled with its previous submitted input.

[Open atomicity Guided](/draft/topics/transactions-isolation?view=guided&experiment=atomicity)
to predict eight selected Java steps. Reveal each checkpoint explicitly, then explain the
published counts, private work, retained base and decision reason. A cached preset still
needs a separate reveal for another checkpoint; it does not answer the prediction for you.
Saved reasoning returns on reload; Java results require a new explicit run.

In atomicity Architecture, inspect published ownership, each private workspace and the
revision-checked publication boundary. Operation sequence offers three authored causal paths:
split-write abort, staged publication and revision conflict with stock still available.
These reading views have complete text equivalents and make no Java run. Compare their
illustrations with actual Playground or Guided evidence before making a production claim.

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

The reservation model excludes lock waiting, optimistic versions, rollback, crashes, durability,
replicas, retries, external effects and multiple-resource transactions. “All invariants hold”
means these three checks for this finite input and algorithm, not every business rule.

### An abort label does not erase writes

**Wrong explanation:** “The final numbers add up and we reported an abort, so no aborted
work remains.” In **An aborted actor still has effects**, published remaining 0 plus allocated
1 equals initial 1. Nevertheless A is ABORTED with one applied stock unit and its allocation
still visible. Quantity conservation and absence of aborted effects are separate checks.

**Another wrong explanation:** “The final state is consistent, so every prefix was safe.”
The split commit repairs final conservation, but its earlier stock-only publication remains
the first Java history violation. Private half-prepared work in the staged mode is a different
scope; it is not added to published totals.

The coarse revision guard conservatively rejects obsolete shared bases, including work whose
current quantity would fit. It supplies no fairness, waiting, automatic retry or measured
contention cost. Discarding one workspace cannot undo another actor's publication. Staging
alone does not establish a safe concurrent commit protocol; the explicit revision check matters.

## In a real project

Start with the invariant and its owner. For an inventory service, availability checks,
inventory changes and allocation records need a defined coordination boundary. Protecting
only the counter while independently writing the allocation leaves another problem to solve.

PostgreSQL documents [transactions that group related changes](https://www.postgresql.org/docs/18/tutorial-transactions.html).
That is a production connection; neither Java model executes database transactions or recovery.

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

### Coordinate actual database writes

For inventory plus a reservation record, quota plus a usage record or budget plus spending,
identify the owner and the actual transaction boundary for both related writes. Catching an
error after an independently published write does not make that write disappear.

PostgreSQL's [ROLLBACK](https://www.postgresql.org/docs/18/sql-rollback.html) discards changes
inside the current SQL transaction. The split algorithm has no shared rollback boundary;
its ABORT does not show PostgreSQL rollback failing. Its [COMMIT documentation](https://www.postgresql.org/docs/18/sql-commit.html)
describes a real database publication/durability boundary. This model's local COMMITTED phase
does not supply persistent storage, crash recovery or acknowledgement semantics.

Verify the real database transaction, condition/constraint behavior and failure handling.
Then separately define an ambiguous response, retry or external payment boundary before
claiming durability, idempotency or external-effect atomicity.

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

Named SQL isolation guarantees, write skew, actual database rollback/recovery and retry
semantics remain later curriculum. The module's title identifies that larger curriculum;
these two bounded comparisons do not implement every transaction guarantee.

### Explain atomicity and abort in two minutes

State the inventory/allocation requirement and the units. Trace the one-unit stock-only
abort. Separate published data, private work and terminal phase. Propose one owner-controlled
boundary for both real writes, then explain this model's revision validation and publication
or discard. Distinguish a valid abort from no new API evidence and name the unmodeled guarantees.

Follow-up one: B publishes while A has private work, then A aborts. A must discard only its
own workspace and preserve B's shared state; it cannot restore a global BEGIN snapshot.
Follow-up two: the real response is lost after a database commit. This model has no ACK,
lost-response or retained-key replay protocol. Define that separate retry/idempotency boundary.

## Teach it back

Explain to a teammate: “Both reservations saw one unit. The stale implementation trusted
those old observations and set the counter to zero twice while recording two allocations.
We need an owner that checks current stock and records the stock change plus allocation in
one protected action. I would test the actual concurrent write path and accounting, not
just check that stock never became negative.”

### Explain the publication boundary

Tell a teammate: “Stock changed before the record, so the stop left stock consumed without
its allocation. We need the actual related writes inside one defined boundary. This model
stages them, validates the shared revision and either publishes both or discards private work.
It does not prove our production database or retry protocol provides the same guarantee.”

Transfer the example to budget units and spending records. Self-check: both writes named;
accurate selected-step quantities; published versus private work; exact terminal reason and
revision; no invented undo; history versus final flags; one tradeoff and one changed condition.
Practice questions name which experiment they discuss and save reasoning under this same
topic. Earlier reservation answers remain available; neither saved explanations nor reference
views are automatic grades or proof of mastery.

Apply the same reasoning to two jobs spending a shared quota. State the remaining quota,
allocated quantity, write boundary and rejected outcome. Attempt a Practice answer, reveal
its reference, compare and revise. Self-check for a clear problem, cached/current distinction,
correct numbers, explicit invariant, precise boundary, one tradeoff and one changed condition.

## Further reading

- [PostgreSQL 18 transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html): documented statement/update behavior and its scope.
- [PostgreSQL 18 UPDATE](https://www.postgresql.org/docs/18/sql-update.html): conditions and evidence of an actual update.
- [PostgreSQL 18 transactions](https://www.postgresql.org/docs/18/tutorial-transactions.html): grouping related database changes.
- [PostgreSQL 18 constraints](https://www.postgresql.org/docs/18/ddl-constraints.html): row and relational constraint boundaries.
- [PostgreSQL 18 ROLLBACK](https://www.postgresql.org/docs/18/sql-rollback.html): discard within a defined transaction boundary.
- [PostgreSQL 18 COMMIT](https://www.postgresql.org/docs/18/sql-commit.html): real publication and durability, distinct from the local model.
