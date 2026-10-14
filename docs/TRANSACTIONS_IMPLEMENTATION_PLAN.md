# Transactions & Isolation implementation plan

Status: **implementation handoff, not an implemented module**. Prepared 2026-10-13.
Canonical ID: `transactions-isolation`. Prerequisite: `data-access-models`.

Current implementation: [HLD-16A](work-items/HLD-16A.md) is merged with final CI evidence.
[HLD-16B](work-items/HLD-16B.md) implements the draft HTTP/Playground/Study/Practice slice;
its verification/delivery evidence is recorded in that work item. HLD-16C and broader
isolation/rollback/retry teaching remain pending. Phase descriptions below retain their
acceptance scope; they are not evidence that every phase is done.
This plan supersedes the temporary model/contract/learning design notes from this session.

## 1. Start here

Read AGENTS, CONTRIBUTING, README, project plan, roadmap, architecture, simulation, content,
learning and experience standards. Inspect current main, working files, nearby code and tests.
Preserve unrelated owner work. Confirm the data-access technical core is merged with required
CI and review evidence; publication/human/hosted gates remain separate under decision 0022.

Create a fresh branch from updated main for **each** contribution below. Finish its relevant
local checks, push, create a focused PR, wait for required final-head CI, squash merge, delete
only that merged branch and update local main before beginning the next contribution.

Use LLD as the product reference and retain HLD's existing visual identity. No new database,
service, dependency, authentication, cloud infrastructure or generic simulation framework.

## 2. One learning question

**Two distinct reservations both saw one available unit. Can both be accepted?**

An earlier read is information. The current-state check and the changes that accept a
reservation need a stated owner and atomic boundary. The experiment should make that boundary
visible before introducing a taxonomy of isolation levels.

A learner should predict an interleaving, inspect actual Java evidence, explain the breach,
and defend a protection in a project discussion or interview. Carry the same stock/reservation
example through the model, controls, snapshots, lesson, diagrams and questions.

## 3. Freeze this first model

Model/schema versions start at `1.0.0`/`1.0`. Execution is a bounded, untimed, deterministic
sequence supplied by the caller. No seed is needed because nothing is random. No sleeps,
wall-clock time, network requests, shared mutable state or actual thread scheduling inside it.

### Two algorithms

| Strategy                         | READ                                             | ATTEMPT_RESERVE                                                                                                            |
| -------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `STALE_READ_WRITE`               | Save this reservation's observed remaining count | Check the saved count. If sufficient, assign `remaining = observed - quantity` and append its allocation; otherwise reject |
| `ATOMIC_CONDITIONAL_RESERVATION` | Save a preview only                              | Check current shared remaining count. If sufficient, indivisibly decrement it and append the allocation; otherwise reject  |

Both accepted actions finish as one logical transition. The unsafe algorithm deliberately
**assigns from its stale observation**. Replacing that assignment with a decrement of current
stock changes the experiment and its exact fixtures.

The protected boundary contains the current condition, stock mutation and allocation record.
There is no interleaving inside that transition. Rejection changes reservation status to
REJECTED while preserving stock and allocations. Acceptance here is local model state, not
a durable database commit, payment or external effect.

These are algorithm names. Do not relabel them Read Committed, Repeatable Read or Serializable.
No MVCC, optimistic version, lock waiting, deadlock, rollback, crash, retry, replica,
multi-resource transaction or idempotency is implemented by this first comparison.

### Input

All objects have closed fields, explicit required status/types and bounds:

```text
schemaVersion: "1.0"
modelVersion: "1.0.0"
strategy: one of the two algorithms
initialUnits: integer 0..20
reservations: 2..4 records {id, quantity}; quantity integer 1..20
schedule: 4..8 records {id, reservationId, action: READ | ATTEMPT_RESERVE}
```

IDs use the existing whole-value lowercase ASCII grammar, maximum 32 characters; reject
whitespace explicitly. Reservation IDs and step IDs are unique in their respective sets.
Each step references an existing reservation. Schedule length equals twice the reservation
count. Every reservation has exactly one READ followed by exactly one ATTEMPT_RESERVE.

Reject unknown/missing/null fields, wrong/coerced types, unsupported versions/actions,
invalid bounds, duplicate identities, unknown references, missing/repeated actions and
attempt-before-read schedules **before execution**. Complete schedules are required;
there is no partial-result or truncation mode in this finite first model.

### Authoritative state and outcomes

Java owns every transition, quantity, invariant and summary. Use concrete immutable records
and complete post-step snapshots; at most eight outcomes makes generic patches unnecessary.

```text
State
  remainingUnits: 0..20
  allocatedUnits: 0..80
  reservations: input-order {id, quantity, status, observedRemaining?}
    status: NOT_READ | READ_OBSERVED | ACCEPTED | REJECTED
  allocations: acceptance-order {reservationId, quantity, stepId}, at most 4
  invariants
    remainingNonnegative: boolean
    allocatedWithinCapacity: boolean
    unitsConserved: boolean
    accountedUnits: 0..100

Outcome
  sequence: 1..8
  stepId, reservationId, action
  kind: READ_OBSERVED | RESERVATION_ACCEPTED | RESERVATION_REJECTED
  postState: complete State
  explanation: bounded original Java explanation, 1..600 characters
  READ only: observedRemaining
  ATTEMPT only: checkedRemaining, checkSource: SNAPSHOT | CURRENT, quantity
  rejected only: rejectionReason: INSUFFICIENT_STOCK

Result
  simulationId: transactions-isolation
  schemaVersion, modelVersion, kind: analysis, status: completed
  exact captured input, initialState, ordered outcomes, finalState, metrics
  assumptions: at most 12 original bounded strings, each 1..600 characters

Metrics
  acceptedReservations, rejectedReservations: 0..4
  finalRemainingUnits: 0..20
  finalAllocatedUnits: 0..80
  invariantStatus: PRESERVED | VIOLATED
  firstViolationStepId?: original step ID
```

Java computes `accountedUnits = remainingUnits + allocatedUnits`, conservation against
initialUnits and capacity against allocated units. First-violation evidence covers **any
observed prefix**, not just the final snapshot. Omit inapplicable optional fields rather
than supplying meaningless nulls; conditional schemas forbid them on other outcome kinds.

`observedRemaining` is absent only for NOT_READ and required/retained for every subsequent
status, including ACCEPTED and REJECTED. `firstViolationStepId` is required exactly when
invariantStatus is VIOLATED and forbidden when PRESERVED; it names the first observed breach.

Initial state has unread reservations, no allocations and all three flags true. Final state
equals the last post-state. A completed run may contain valid business rejections or an
intentional unsafe invariant breach. HTTP success, business acceptance and correctness are
three different facts. Never cap unsafe allocation totals at initial stock in the schema.

## 4. Exact fixtures to execute

Default: initialUnits 1; reservation IDs `a`,`b`, quantity 1 each. Stable steps:
`read-a`, `read-b`, `attempt-a`, `attempt-b`, in that order.

| Position               | Stale remaining / allocated | Conditional remaining / allocated          |
| ---------------------- | --------------------------- | ------------------------------------------ |
| Initial and both READs | 1 / 0                       | 1 / 0                                      |
| Attempt A              | 0 / 1, A accepted           | 0 / 1, A accepted                          |
| Attempt B              | 0 / 2, B accepted           | 0 / 1, B rejected after checking current 0 |

Unsafe: remainingNonnegative true, allocatedWithinCapacity false, unitsConserved false;
first violation `attempt-b`. Conditional: all three flags stay true. B's earlier observed
value remains 1 even when the protected decision checks current 0.

Required contrasts; these are expected definitions until Java actually executes them:

| Input change                                                         | Exact outcome to reconcile                                                                                                   |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Serial schedule READ A, ATTEMPT A, READ B, ATTEMPT B                 | Both strategies accept A/reject B; remaining 0, allocated 1. One favorable ordering does not prove general safety            |
| Reverse attempts after shared reads                                  | Conditional accepts B/rejects A. No fairness or preferred-client guarantee                                                   |
| Initial 2, quantities 1/1, shared reads                              | Stale: remaining 1, allocated 2, capacity true but conservation false. Conditional: remaining 0, allocated 2, all flags true |
| Initial 0                                                            | Both strategies reject both; no allocations, remaining 0, all flags true                                                     |
| Initial 2, A quantity 2/B quantity 1, shared reads, A attempts first | Stale: remaining 2→0→1, allocated 0→2→3, accounted 4. Conditional accepts A/rejects B, remaining 0, allocated 2              |
| Same unequal quantities, B attempts first                            | Conditional accepts B/rejects A, remaining 1, allocated 1                                                                    |
| Four reservations, eight steps, maximal IDs/quantities               | Full bounded immutable evidence; measure actual serialized input/result under configured limits                              |

Use the unsafe default as the canonical baseline input/result example, and retain an
independent protected golden pair. Proposed stable descriptor preset IDs for the runnable
slice are `unsafe-baseline`, `protected-baseline`, `serial-control`, `reverse-winner`,
`conservation-gap`, `empty-stock`, `unequal-quantities`, and `stale-restoration`, corresponding
to the exact fixture rows above. Author the descriptor from these Java inputs; do not keep
a second frontend preset registry. Reconcile these IDs and goldens before implementation.

Enumerate the six legal two-reservation READ-before-ATTEMPT orders for initial 1, quantities
1/1. Stale fails four; conditional preserves the stated invariants in all six. This is a
finite model result, not a probability of production failure.

Also check equality boundaries, request isolation, exact replay, defensive input/output
ownership, known identities and rejection before any transition. Serialized-size fixtures
are measured examples, not proof of a global maximum or production performance.

## 5. Deliver in focused slices

### HLD-16A — Java model and canonical evidence

Create its actual work item and model ADR before coding. Suggested package:
`com.hld.transactions`; concrete ReservationInput/Analyzer/Result/Limits types. Use current
Java model patterns and configured mapper. Avoid a generic transaction engine.

Implement the two algorithms, bounded validator, snapshots/invariants and exact tests above.
Add canonical `transactions-isolation.input.schema.json` and `.result.schema.json`; the input
owns shared identity/captured-input definitions. Their exact IDs are
`https://hld-with-ui.dev/schemas/transactions-isolation.input.schema.json` and
`https://hld-with-ui.dev/schemas/transactions-isolation.result.schema.json`; result references
resolve to that explicit input owner. Author Java-serialized baseline examples and
positive/negative schema fixtures through the existing Node contract gate.

No placeholder API, descriptor, topic catalog entry or UI capability solely to export types.
The module remains unavailable until the next runnable slice. This backend-only contribution
is explicitly incomplete under decision 0022. Record actual checks and limitations in HLD-16A.

Minimum gates: Java verify, actual golden/schema comparison, bounds/immutability/isolation
cases, canonical/content drift checks, plan/launcher syntax, required final-head CI. Do not
report proposed commands or generated scaffolding as a working learning module.

### HLD-16B — Strict API and runnable three-view draft

After 16A merge and main update, create a new branch. Add concrete descriptor/presets,
strict `GET /api/v1/simulations/transactions-isolation` and
`POST /api/v1/simulations/transactions-isolation/runs` endpoints. Draft content is explicit at
`GET /api/v1/draft/topics/transactions-isolation`; its React route is
`/draft/topics/transactions-isolation`. Extend
existing body/response/admission guards; preserve structured 400/413/422/503 behavior.

Use the next additive HTTP version only after rechecking current main; 1.7.0 is a candidate
if 1.6.0 is still current. Do not reserve that version during this planning contribution.
Export canonical schemas to actual OpenAPI paths, generate TypeScript aliases and a reachable
lazy descriptor validation subset; add it to formatting/drift commands. Never duplicate a
hand-maintained contract vocabulary or topic list.

Add one canonical draft catalog entry with `prerequisites: ["data-access-models"]`,
original lesson/resources
and useful Practice questions. Keep published discovery, search, bookmarks and runnable
first-path destinations unchanged. Add an explicit draft route and saved-answer resume support.

Build Playground/Study/Practice in ModuleShell. No Guided/Architecture/sequence placeholder
tabs. Register actual golden baseline mapping in packaged-runtime smoke so a new draft cannot
silently bypass model execution.

Client validation: closed schemas, exact versions and captured inputs, known step/reservation
identities, ordered correspondence, quantity identities, complete bounded snapshots, valid
outcome-specific fields and final/last-snapshot correlation. Capture serialized input before
the first await. React renders Java metrics/flags; it does not reserve units, replay rules or
compute authoritative allocation/invariant counters itself.

Minimum gates: semantic Java/API cases, strict unknown/null/duplicate/trailing/coerced input
failures, schema/type drift, meaningful form/client/UI cases, real Java browser journeys,
copied jar/container, draft exclusion, final-head CI. Explain an insufficient-stock outcome
separately from validation, overload or network errors.

### HLD-16C — Guided and authored design views

Use a fresh branch after the runnable slice passes review. Reuse GuidedSimulation, local
answer storage, StudyView/PracticeView, ModuleShell and exact resume/reset/version behavior.
Share one selected-snapshot renderer with Playground.

Select actual step identity and actual outcome kind. The existing data-access operationId
family is restricted to its four operation kinds. Do not reuse its enum, a queue job ID,
narration or authored array positions for this new model. Design the smallest concrete
selector extension when these real checkpoints need it; preserve all four existing families,
Java constructors, schema/exporter/content capability rules and legacy resolvers.

Author inspectable logical ownership (local observations/shared stock/allocation boundary),
manual unsafe/conditional/serial Operation sequences and full text equivalents. Label authored
illustrations separately; they send no run and invent no elapsed time.

Eight checkpoint themes: read is a preview; safe-looking first acceptance; unsafe second
acceptance; current-state protected boundary; reject a stale preview; serial order masks the
flaw; capacity can hold while conservation fails; empty inventory is a business result.
Resolve every target with a Java fixture and reconcile its numerical explanation. Cached
presets still need explicit reveal for a previously unseen checkpoint; no extra POST is needed.

Minimum gates: exact targets/prefix populations, saved reasoning/reload/reset/version/pending
response cases, missing target/retry, real Java browser evidence, authored reading/no-POST,
keyboard/reduced motion/widths/themes/native zoom, copied runtime and required CI.

### Remaining transaction curriculum

Six views around this experiment do not constitute complete isolation coverage. Keep chosen
isolation guarantees, multi-record anomalies/write skew, rollback/abort boundaries and retry
semantics explicitly pending. Add further behavior only through separate bounded designs and
fixtures. Review precisely which atomic guarantee supports a later idempotency draft; that
module also depends on `queues-delivery` and must define its own retained-key/effect boundary,
request conflicts, expiry and lost-response scope. This first model deduplicates nothing.

Publication remains blocked on the documented release, module and published-prerequisite
reviews. Technical draft development can continue under decision 0022; CI is not publication.

## 6. UI and learning acceptance

1. Start with “Can both reservations succeed?” and an optional prediction.
2. Provide Java-defined presets, initial stock and reservation quantities. Preserve numeric
   blanks until validation; show zero stock as valid, not missing evidence.
3. Edit the ordered schedule with labeled controls and keyboard move-up/down actions. Keep
   stable UI keys separate from editable semantic IDs. Dragging cannot be the only control.
4. Explain illegal ordering without silently repairing it. Never automatically POST on load,
   preset selection, reload, tab switch, reading a diagram or moving through evidence.
5. Explicit Run captures inputs. Keep inputs, prediction and prior successful results on errors;
   label old evidence after edits and lock conflicting controls during a pending run.
6. Render client observation cards, shared remaining stock, accepted allocations and all three
   Java invariant flags at the selected initial/post-step snapshot. “Not read yet” is not zero.
7. Label whole-run status separately. A green selected prefix cannot certify later unsafe steps.
8. Compare policies using the same schedule/reservations and two actual Java results. No
   frontend-generated comparison result, generic efficiency score or invented timing.
9. Check 320/768/1440, both themes, keyboard/focus, reduced motion, loading/error/empty stock,
   business rejection and long bounded identifiers. Tables scroll within focusable regions.
10. Retain actual representative screenshots, exact checks/results and any unperformed human,
    device, zoom or hosted review. Keep model limits beside the first result.

The lesson follows the six-step learning ladder: simple idea → example → mechanism →
prediction/experiment → tradeoff/failure → teach-back. Include a tempting wrong explanation,
two changed-condition follow-ups, a self-check rubric and a roughly two-minute interview outline.

Wrong explanation: “Stock never went below zero, so we cannot have oversold.” The default
stale run records two allocated units from one initial unit while remaining stays zero.

Practice should cover: default prediction; protected contrast; serial-test blind spot;
unequal quantities; a partial counter/allocation boundary; request-ID uniqueness versus
capacity; transfer to quotas/budgets; unmodeled timeout/crash/retry implications. Use original
rubrics and shared attempt/reveal/compare/revise, not automatic free-text grading.

## 7. Primary sources verified for the handoff

Pinned PostgreSQL 18 documentation was opened on 2026-10-13. The finite rules and numbers
above are original model definitions. These connections do not establish engine emulation.

- [Transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html): its simple
  Read Committed row-update discussion explains rechecking a condition after a competing
  update. Keep this connection scoped; it does not settle arbitrary multi-row invariants.
- [UPDATE](https://www.postgresql.org/docs/18/sql-update.html): conditional updates and affected
  row/RETURNING evidence can distinguish a mutation from no qualifying update.
- [Transactions](https://www.postgresql.org/docs/18/tutorial-transactions.html): multiple related
  writes need an explicit transaction boundary. A real stock mutation and allocation record
  must be coordinated; the model's indivisible transition supplies no crash/durability proof.
- [Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html): row checks have limits
  for conditions involving other rows/tables. A nonnegative counter alone cannot certify the
  example's stock/allocation relationship.

Recheck source claims when authoring the actual lesson. Write original explanations/diagrams;
copy no vendor code/assets. Add canonical resource IDs only when the content slice needs them.

## 8. Execution prompt

```text
Implement the next uncompleted slice in docs/TRANSACTIONS_IMPLEMENTATION_PLAN.md.
Read AGENTS.md and its required documents, inspect actual current main/code/tests/status,
and preserve unrelated user work. Verify HLD-15B final-head CI and technical core evidence.
Create a fresh branch from updated main for one focused work item.

Start with HLD-16A if no reservation model exists. Follow the plan's exact two algorithms,
bounds, semantic IDs, snapshots, Java-owned quantities/invariants and fixtures. Do not
invent elapsed time, use actual threads in the model, add dependencies/services, rename
these algorithms as SQL isolation levels, advertise unsupported tabs, or publish drafts.

Write a work item and model decision, implement and run relevant checks, record only actual
results, and review learning/contract/model agreement. Push a focused PR to main, wait for
required final-head CI, squash merge and update local main. Continue to HLD-16B only if
16A is complete and the current user-authorized work window allows another bounded slice.
Reuse the shared module/answer UX and strict API/schema/runtime patterns, keeping frontend
and backend code readable and the example easy to explain to a teammate or interviewer.

Finish with changed artifacts, learning outcome, checks/results, limitations and next item.
Full isolation/rollback/retry, human/hosted reviews and publication remain separate gates.
```
