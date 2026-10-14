# Work item: HLD-16A — Verify the reservation acceptance boundary

## Objective

Establish authoritative Java evidence showing why two stale reads can record more allocated
units than initial stock, and how a current-state condition with an atomic allocation boundary
preserves the stated rule. This is the foundation for the upcoming interactive learning module.

## Preconditions

- Fresh feat/reservation-interleaving-model from merged PR #71 main4c44361; owner output preserved.
- HLD-15B technical core and required CI passed; human/hosted/publication gates remain separate.
- Current project, architecture, simulation, content and learning/quality standards reviewed.
- [Transaction handoff](../TRANSACTIONS_IMPLEMENTATION_PLAN.md) freezes the exact model.

## Scope

Pure Java input validation, two reservation algorithms, eight original preset inputs, immutable
snapshots/invariants, canonical input/result schemas and actual unsafe/protected golden pairs.
No new API, descriptor, catalog entry or frontend tab. The topic remains unavailable until
integration; full isolation/rollback/retry and publication are pending.

## Design

[Decision 0031](../decisions/0031-reservation-interleavings-and-invariants.md) records the
untimed schedule and indivisible protected acceptance. READ is a preview, not ownership.
Two callers seeing one unit can both pass the stale check and assign the counter to zero:
allocated 2 plus remaining 0 does not equal initial 1. Conditional acceptance checks current
stock; one accepts and the other rejects without changing stock or allocations.

Java reports every prefix's stock, accepted allocations and capacity/nonnegative/conservation
flags. Actor status changes remain explicit. Results complete even when an unsafe invariant
fails. No frontend recomputation or physical database behavior is introduced.

## Acceptance

Exact unsafe/protected/serial/no-stock/unequal-quantity/winner fixtures; six legal interleavings;
illegal identities/bounds/schedules rejected before transitions; deterministic replay, defensive
copies and request isolation; configured mapper omission/roundtrip; actual golden equality and
meaningful positive/negative standalone schema fixtures; actual maximal-shape wire sizes.

## Verification evidence

| Actual check                             | Result                                                                                 | Evidence                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Configured mapper authoring              | PASS: three cases; unsafe/protected golden pairs written from actual Java results      | `/tmp/hld-16a-authoring.log`                      |
| Full Java verify without authoring flag  | PASS: 461 discovered, 460 executed, one existing opt-in skip; 77 new cases             | `/tmp/hld-16a-java.log`                           |
| Canonical generation/drift and contracts | PASS: 235 cases, including 76 new reservation fixtures                                 | `/tmp/hld-16a-contracts.log`                      |
| Frontend full quality gate               | PASS: typecheck, lint, format, 497 units in 58 files, production build                 | `/tmp/hld-16a-{type,lint,format,units,build}.log` |
| Copied jar outside checkout              | PASS: canonical current content/baselines, draft exclusions and owned cleanup          | `/tmp/hld-16a-packaged.log`                       |
| Plan/launcher/whitespace                 | PASS: 106 docs, 552 links, 59 curriculum IDs, eight catalog entries; shell syntax/diff | `/tmp/hld-16a-plan.log`                           |

Java covers 37 validation, 11 analyzer, 20 interleaving, six ownership and three serialization
cases. All six legal two-reservation orders have independently authored exact outcomes.
Twenty-four concurrent mixed calls share one analyzer without influencing each other; this
tests request isolation, not simulated real-thread behavior. No test failure required a fix.

The maximal-identifier/four-reservation/eight-step fixtures serialized to 1,264 input / 13,670
result bytes for stale strategy and 1,278 / 12,626 for conditional strategy, below configured
default limits. These are actual bounded examples, not proof of a global maximum or a
production resource measurement. Ordinary verification compares goldens and cannot rewrite
tracked examples without the explicit authoring property.

Required final-head CI remains pending before squash. There is no UI change to capture or
a new HTTP model to claim packaged execution for. Existing runtime/browser gates protect
the inherited application; they do not make this transaction topic available from React.

## Handoff

Next: HLD-16B strict API and direct draft Playground/Study/Practice, after this model's
required checks and focused PR pass. Deeper isolation, rollback/retry, idempotency, human
review, hosted compatibility and publication remain separate work.

## Final delivery record

[PR #72](https://github.com/Prem-Duvvapu/hld-with-ui/pull/72) final head
`0a3b0872ff25f6bf8c6e9045a892d787fd72ad41` passed required Quality, Browser journeys and
Packaged runtime plus GitGuardian/Vercel. CI run `38593583802` tested merge `ead202d`:
461 Java cases (one existing opt-in skip), 497 units, 235 contracts, 202 ordinary browser
journeys, 20 UI performance and 20 reading checks; launcher and packaged runtime passed.
Squash `ae4a88ea0e5675db8f9302d8770faa8f4371db5d` merged 2026-10-14 16:03:55 UTC.
Owned branch deleted; owner main fast-forwarded with unrelated `output/` preserved.
The next [HLD-16B](HLD-16B.md) connects this verified foundation to HTTP/React.
