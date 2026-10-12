# Work item: HLD-14C — explain delivery failures with selected Java evidence

## Objective

Complete the delivery draft's core teaching flow: predict a failure outcome, inspect its exact
message/attempt event, explain the independent broker/consumer/ledger state, then defend a choice.

## Preconditions

- Fresh `feat/queue-delivery-guided-teaching` from `1363cc6` (PR #67), clean implementation
  checkout, no open PR; owner `output/` preserved.
- PR #67 final-head CI passed on merge `3335f2f`, with 317 Java cases executed, 387 frontend
  units, 179 browser journeys, 20 UI performance and 20 reading-load groups, runtime/container,
  memory and launcher checks. New delivery remains draft.
- Project, architecture, simulation, content, learning and quality standards reviewed; LLD
  remains the primary product reference. Existing primary references support the unchanged model.

## Scope

Eight canonical Guided checkpoints; explicit message/attempt target family; typed Java/content
validation and numerical teaching tests; shared Guided adapter; authored Architecture and three
Message sequence paths; six-tab integration and saved checkpoint resume. No simulator behavior,
model/schema version, new services or publication change.

## Design

[Decision 0028](../decisions/0028-delivery-guided-message-attempt-targets.md) defines paired
semantic targeting, legacy compatibility and authored/live evidence boundaries. Root checkpoints
cover baseline effect-before-ACK, lost-ACK repeated work, crash-before cancellation, crash-after
preserved effect, early-ACK missing effect, deadline equality, effect-after-dead-letter and an
unobserved future effect at the virtual ceiling. No-recovery remains Playground/Practice coverage.

Use all preceding complete Java replacements to reconstruct selected state; do not shallow merge
omitted nullable fields or filter away unrelated world transitions. Reuse existing saved answer,
explicit run, preset reuse, pending reset/version and scoped error behavior. Static diagram
selection is a reading interaction; no Java POST or fabricated outcome follows it.

## Acceptance

- Exactly one closed selector family; reject incomplete/mixed delivery pairs, inconsistent IDs,
  unsupported kinds/occurrences and consumer/enqueue events without attempt capability.
- Existing cache/job JSON and teaching stay unchanged. Canonical generation has no drift.
- Every authored checkpoint resolves against its real Java preset and selected state, ledger,
  timestamps, independent lease/effect/ACK status and final/prefix populations agree.
- Six working views retain explicit run association, tab/history state and hidden playback pause.
  Missing targets show no unsupported explanation; reload restores reasoning without traces.
- Shared saved-answer lifecycle preserves predictions/choices, exact home resume and reset/version
  guards; it never reinstates deleted answers after a pending run.
- Architecture explains ownership and absent atomic/deduplication boundary. Baseline, lost-ACK and
  early-ACK/crash sequence paths provide keyboard selection and complete text equivalents.
- Real Java browser checks cover meaningful Guided evidence, all eight checkpoints, failures,
  reduced motion, focus, 320/768/1440 and both themes; all applicable gates pass before merge.

## Verification evidence

Pending until actual commands and reviews complete. A planned check is not passing evidence.

## Handoff

Publication still requires human reviews, the first-release gate and published prerequisite
closure. Next: technical completion review of the delivery core, then the earliest required
storage/transaction prerequisite before executable idempotency protection. Keep the full requested
Notification/Rate Limiter/Chat/News Feed/Booking scope and its dependency graph intact.
