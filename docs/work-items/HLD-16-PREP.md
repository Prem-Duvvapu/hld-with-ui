# Work item: HLD-16-PREP — Prepare the transaction foundation

## Objective and status

Prepare one clear implementation handoff that another agent can execute without inventing
transaction behavior, duplicated contracts or misleading UI capabilities. **Planning only:**
no transaction model, API, catalog entry, learning content or frontend view is implemented.

## Preconditions

Fresh `docs/transactions-foundation-handoff` from PR #70 squash `c4d5d00`. Data-access core
technical review and final-head CI passed; human/hosted/publication gates remain separate.
Owner main updated and unrelated output assets preserved. Required project/learning/quality
documents and actual neighboring Java/API/client/schema/UI patterns were reviewed.

## Artifact and decisions

[The implementation plan](../TRANSACTIONS_IMPLEMENTATION_PLAN.md) freezes one small story:
two distinct reservations compete for one unit. Compare a stale cached assignment with a
precisely defined current-state conditional reservation, including stock and allocation in
one modeled acceptance. Java reports capacity, nonnegative stock and conservation evidence.

Explicit bounded schedules, immutable snapshots, closed input/result shapes, exact arithmetic
and success/rejection/failure fixtures support phased HLD-16A Java/canonical evidence,
HLD-16B runnable draft Playground/Study/Practice, and HLD-16C Guided/authored design views.
The document includes UI/error/saved-answer acceptance, source links and an execution prompt.
It explicitly keeps deeper isolation/rollback/retry, idempotency and publication pending.

## Reviews and verification

Three independent model/contract/learning design reviews checked the original algorithms,
all six two-actor interleavings, exact unsafe/protected values and conservative unsafe bounds.
Final review clarified the direct prerequisite is only data-access-models, observed reads
persist after acceptance/rejection, and firstViolationStepId exists iff history is violated.
These are source/design reviews, not execution of the proposed transaction model.

PostgreSQL 18 isolation, UPDATE, constraints and transactions documentation was actually
opened on 2026-10-13. Original model definitions are distinguished from those production
connections; no vendor assets/code were copied and no database experiment was executed.

Actual local checks passed: plan validation (104 docs, 542 local links, 59 curriculum IDs,
eight catalog identities), Prettier for all five changed Markdown files, launcher shell syntax
and Git diff whitespace. Logs: `/tmp/hld-16-prep-{plan,format-check}.log`.
Required final-head CI must pass before squash; inherited runtime counts are not new
transaction implementation evidence. [HLD-15B](HLD-15B.md) separately records its actual
final CI and hosted compatibility observation.

## Limits and next work

The two algorithms are not SQL isolation-level emulators. No timing, actual threads,
optimistic versions, rollback/crash/durability, retry or idempotency is added by this plan.
The hosted backend lacks current draft support; no deployed commit was verified.
Under [decision 0022](../decisions/0022-development-and-publication-gates.md), the next
unblocked draft contribution is HLD-16A, after rechecking current main and its gates.
P3-02 remains planned until working artifacts and checks exist.

## Final delivery record

[PR #71](https://github.com/Prem-Duvvapu/hld-with-ui/pull/71) passed required
[CI 38455666194](https://github.com/Prem-Duvvapu/hld-with-ui/actions/runs/38455666194)
on final head `fca784b8539825012942cd7ae2a8f811fd1b2777`, then merged on
2026-10-14 15:30:19 UTC as `4c4436135df1ce1ec4f4a7640375c0fa549e699d`.
Those checks verify the documentation contribution and inherited baseline, not a new
transaction implementation. The next actual model contribution is HLD-16A.
