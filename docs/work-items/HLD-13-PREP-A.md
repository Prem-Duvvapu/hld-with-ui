# Work item: HLD-13-PREP-A — unblock draft development and specify queue delivery

## Objective

Give the next contributor a precise queue-delivery implementation target: explain the gap
between broker acknowledgment and durable effect, with hand-checkable crash/redelivery
fixtures and a usable learning flow. Reconcile the execution plan with the owner's resumed
broader scope so implementation can advance alongside unfinished human/hosted reviews.

## Preconditions

- Baseline `7a214d7` (PR #61); four published modules and ten draft URL-shortener stages.
- P2-05 remains in progress. Technical evidence is recorded in HLD-11A–D; human/hosted
  release gates are not passed by this contribution.
- Read roadmap, project/execution plans, curriculum, architecture/simulation contracts,
  content/learning/quality standards, actual context/emitter/controller and LLD module shell.
- Fresh `docs/queue-delivery-handoff` branch from fetched main; implementation worktree clean.
  Owner's untracked `output/` directory is unrelated and preserved.

## Scope

- Add a queue-delivery handoff and sequencing decision; reconcile execution/roadmap links.
- Proposed stable ID `queues-delivery`; existing curriculum identity/prerequisites preserved.
- No registered model, catalog entry, endpoint, product route or published capability.
  These documents are preparation, not an implemented queue module.

## Design

One accepted message → consumer delivery → durable ledger append → acknowledgment.
Lost ACK permits another delivery and another append. Compare ACK-before/after under
crash and lease expiry. Define worker capacity, cancelled callbacks, settlement, strict
deadline ordering, retry cap, late effects, metric populations, bounds and typed state.

[Decision 0022](../decisions/0022-development-and-publication-gates.md) separates development
from publication. First implement `queues-tail-latency`; then develop queue delivery after
that prerequisite's model/teaching review. Publishing still waits for P2-05, human reviews
and published prerequisites.

## Acceptance

- Exact eight-row ACK/fault comparison, retry-cap and lease-boundary fixtures are independently
  reviewed; redelivery and extra effects remain separate.
- Typed proposed contracts, validation/budgets, UI states/accessibility, teaching exercises,
  primary source boundaries and sequential delivery/checks are explicit.
- Development scope includes the owner's requested modules without falsely closing release
  gates; actual draft topic lookup limitation is recorded.
- Documentation links/anchors and curriculum/catalog validation pass. No application changes.

## Verification evidence

| Check actually run | Result | Artifact or reproduction |
| --- | --- | --- |
| Repository/main and open PR inspection | PASS: main at `7a214d7`, no open PR at start; owned implementation worktree clean | Git/`gh pr list` on 2026-10-12 |
| Primary source review | Reviewed four official documents; source/model boundaries recorded | [Handoff section 7](../QUEUE_DELIVERY_IMPLEMENTATION_PLAN.md#7-claims-and-primary-references) |
| Independent fixture and sequencing review | PASS; reviewed eight fault/policy fixtures plus lease 100/101 boundaries and crash ties; clarified valid-action draining, emitted-prefix consistency and queue guided-selector validation | Read-only parallel reviews on 2026-10-12; corrections incorporated in the handoff |
| `node scripts/validate-plan.mjs` | PASS: 83 documents, 424 local links, 59 curriculum IDs, 5 catalog identities | Executed on 2026-10-12 |
| `git diff --check` | PASS | Executed on 2026-10-12 |

Application suites were not run locally for this documentation-only contribution. Required
CI must pass at the final contribution head before merge; it is not evidence of queue code.

## Handoff

[Queue-delivery plan](../QUEUE_DELIVERY_IMPLEMENTATION_PLAN.md) is the implementation target.
No new learning module is usable yet. P2-05 and the Phase 3 publication gate remain open.
The next implementation is the `queues-tail-latency` bounded Java contract/model, followed
by explicit draft delivery and React learning flow; continue independent release evidence
when human/hosted verification becomes available.
