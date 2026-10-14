# Work item: HLD-17A — Verify publication and abort of related writes

## Objective

Establish original Java evidence for the question: **If stock changes before its allocation
record is written, what does abort remove?** Compare separately published writes with private
work that is published together after a revision check or discarded on abort. This contribution
is a pure foundation; it does not make a second experiment available in the learning UI.

## Preconditions

- Fresh `feat/transaction-atomicity-model` from main `e871e94`, after the merged reservation
  Guided/design contribution. Preserve unrelated owner files.
- [HLD-16A](HLD-16A.md), [HLD-16B](HLD-16B.md) and [HLD-16C](HLD-16C.md) establish the
  existing six-view reservation draft. Its model, presets, goldens and selectors stay unchanged.
- Project, architecture, simulation, learning and quality standards reviewed. The
  [transaction handoff](../TRANSACTIONS_IMPLEMENTATION_PLAN.md) distinguishes the two experiments.
- Root freezes the exact atomicity vocabulary and bounds before Java/schema implementation.
  Preparation notes alone are not implementation or verification evidence.

## Scope

Pure `com.hld.atomicity` behavior, complete input validation, immutable snapshots, eight Java
preset inputs, standalone canonical input/result schemas and configured-mapper golden examples.
Stable model ID `transaction-atomicity`, schema `1.0`, model `1.0.0`, result kind `analysis`
and status `completed`. Input uses `mode`, not the reservation model's `strategy` field.

There is no new controller, HTTP/OpenAPI path, Spring registration, catalog simulation ID,
frontend component, lesson/question resource or Guided capability in this slice. Existing
reservation replay remains compatible. No database, dependency, service or generic transaction
framework is added. [Decision 0034](../decisions/0034-transaction-atomicity-model.md) records
the publication/discard boundary.

## Design

Input supplies initial stock, one through three transactions and their complete ordered
programs. Each program begins, optionally performs stock/allocation work, then commits or
aborts. Validate the whole schedule before transitions. Java returns one actual outcome per
input step, with complete published state, per-transaction private work, phases and reasons.

`SPLIT_WRITES` checks current stock and publishes the decrement and allocation separately.
Its COMMIT changes status only; ABORT does not undo published effects. `STAGED_VERSION_CHECK`
prepares against BEGIN-captured stock and publishes both changes only when its captured
visible-data revision still matches. Otherwise it aborts without publication. Every terminal
action clears its private workspace while retaining captured base history.

Java reports nonnegative stock, capacity, conservation and absence of aborted effects as
separate flags. It counts all visible allocations, including split-aborted records. Summary
status covers every observed prefix; a later consistent state does not erase an earlier breach.
Neither modeled COMMITTED nor completed analysis establishes durability, SQL isolation,
crash recovery, acknowledgements, retries, idempotency or external-effect atomicity.

## Acceptance

- Exact baseline: initial stock 1, A quantity 1, BEGIN → DECREMENT_STOCK → ABORT. Split writes end
  remaining 0 / allocated 0 / revision 1, A ABORTED with appliedStockUnits 1, conservation false and
  abortedEffectsAbsent false. First violation is `decrement-a`.
- Protected baseline: same program leaves published remaining 1 / allocated 0 / revision 0;
  private work is discarded, appliedStockUnits is 0 and every published-state check is preserved.
- Protected commit publishes remaining 0 / allocated 1 / revision 1 atomically. Split commit
  ends remaining 0 / allocated 1 / revision 2 with all
  final flags true but history VIOLATED at its earlier stock-only publication.
- Split abort after both writes ends remaining 0 / allocated 1 / revision 2: quantity checks pass while
  abortedEffectsAbsent is false. The ABORTED actor and its visible allocation remain explicit.
- Empty stock is valid: STOCK_REJECTED, WORK_SKIPPED and a terminal TRANSACTION_ABORTED
  with INSUFFICIENT_STOCK consume the declared program without changing stock/allocations.
- Two staged contenders retain their BEGIN history; only the first valid commit publishes.
  Test revision conflict even with sufficient current stock, reversed winner, serialized
  successful commits and an abort that cannot undo another transaction's published work.
- All seventy legal two-transaction four-action interleavings at initial stock 1 and 2;
  equality/insufficient quantities; early and post-record abort; maximal three-transaction,
  twelve-step, 32-character-ID shape; deterministic replay and request isolation.
- Reject malformed/null/out-of-bound identities, unsupported variants/versions, unknown
  references, missing/repeated/reversed/post-terminal actions before transitions. Verify
  defensive input copies and immutable snapshot/result ownership.
- Actual configured-mapper golden equality and conditional-field omission/roundtrip;
  standalone positive/negative schema fixtures; measured representative serialized sizes.
  No nonexistent API is inserted into OpenAPI to export the standalone types.

## Verification evidence

Local Java, contracts/content, inherited frontend and copied-runtime checks have been
executed. Final-head CI and merge evidence are recorded in the contribution PR after
the remote jobs finish; passing local checks alone does not authorize a premature merge.

| Check actually run | Result | Artifact or reproduction |
| --- | --- | --- |
| Configured-mapper authoring, `./mvnw -B -q -Dtest=AtomicitySerializationTest -Dhld.atomicity.writeExamples=true test` | PASS: 3 cases, 4 actual input/result golden pairs | `/tmp/hld-17a-authoring.log`; the authoring property was used once |
| Full `./mvnw -B verify` without authoring property | PASS: 657 discovered, 656 executed, one existing opt-in skip; 168 new atomicity cases | `/tmp/hld-17a-java.log`; normal verification compares canonical goldens without rewriting |
| Standalone schemas, canonical/content generation and drift | PASS: 426 checks; generated API/types remain unchanged | `/tmp/hld-17a-contracts.log`; 167 new checks including actual golden and malformed-evidence fixtures |
| Frontend typecheck, final script lint/format, units and production build | PASS: 600 units in 66 files; formatting passes | `/tmp/hld-17a-fe-{type,lint-final,format,units,build}.log`; inherited checks establish no atomicity UI |
| Copied executable jar and packaged-runtime regressions | PASS: existing published/draft baselines, discovery exclusions, cleanup and 9 regression tests | `/tmp/hld-17a-runtime.log`, `/tmp/hld-17a-runtime-tests.log` |
| Plan/links and launcher syntax | PASS | 113 docs, 595 local links, 59 curriculum IDs and 9 catalog identities; staged whitespace checked before commit |
| Required final-head CI and focused PR delivery | Delivery gate; inspect the PR for the completed run and merge record | Merge requires Quality, Browser journeys and Packaged runtime checks |

No checks or builds were run by the documentation contributor. Source links below were
reviewed for conceptual connections; they do not establish implementation acceptance.

## Handoff

The pure Java implementation and captured evidence are locally verified, with no user-visible
experiment or publication change. Documentation defines the exact boundary and acceptance
criteria. Required final-head CI and focused PR delivery still gate this contribution.
After applicable checks and PR merge, the next bounded slice can add a strict descriptor/run
API and a second named Playground/Study/Practice experiment inside `transactions-isolation`.
Its existing eight Guided checkpoints cover only the reservation model.

Real SQL isolation, retry/idempotency, durable recovery, acknowledgement/lost-response behavior,
external effects and human/hosted/publication reviews remain separate work. Primary source
connections are [PostgreSQL 18 Transactions](https://www.postgresql.org/docs/18/tutorial-transactions.html),
[ROLLBACK](https://www.postgresql.org/docs/18/sql-rollback.html) and
[COMMIT](https://www.postgresql.org/docs/18/sql-commit.html), opened on 2026-10-14. Model algorithms
and numbers are original definitions; no vendor code or assets were copied.

## Representative wire evidence

The configured mapper measured a three-actor, twelve-step, maximum-ID/quantity input:
SPLIT_WRITES uses 1,673 request bytes and 19,304 result bytes; STAGED_VERSION_CHECK uses
1,681 request bytes and 19,979 result bytes. Both fit the actual default execution limits.
These measured shapes are not a claim of a global byte maximum, heap measurement or
production performance. Pretty-printed canonical files have different byte sizes; comparison
uses parsed JSON evidence.
