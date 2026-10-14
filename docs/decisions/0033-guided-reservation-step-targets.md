# 0033 — Select actual reservation steps for Guided learning

## Context

Reservation results contain untimed step outcomes rather than queue/cache events or
sequential data-access operations. Eight concrete checkpoints need to select the returned
step identity and kind without broadening any existing selector's capabilities.

## Decision

Add a fifth closed checkpoint target: `stepId`, one actual reservation outcome `kind`, and
`occurrence: 1`. IDs are unique in a validated schedule. Match a unique returned step and its
actual kind; reject missing, mixed, malformed and duplicate matches. Preserve the existing
four target families and Java source/wire constructors. Canonical exporter/content checks
resolve the actual ReservationOutcome scalar identifier owner and derive its three kinds.
HTTP becomes 1.8; model/schema remain 1.0.0/1.0.

Reuse the shared Guided saved-answer/reveal lifecycle. Its reservation adapter renders the
actual outcome's `postState` through the same ReservationEvidence used by Playground. No
whole-run metrics, later actors or final state become selected-checkpoint facts. Eight authored
checkpoints use five existing presets; cached runs still require an explicit reveal per step.

Add separately labelled authored Architecture and three manual Operation sequence paths.
Their original text and numbers illustrate the same rules, without submitting a run or
inventing timing. The topic remains draft with content 1.1 and six views.

## Alternatives

Using operationId would widen the data-access family beyond its modeled operations. Queue
job IDs, narration and authored positions would provide the wrong identity. Displaying final
metrics beside an early selected prefix would confuse local and whole-history evidence.
A new answer engine or generic transaction framework is unnecessary for this concrete model.

## Consequences

Learners can predict, reveal and explain the exact stale/current decision, a serial test's
blind spot, and capacity versus conservation. A zero observation is visibly a read rather
than an unread state. The empty-stock checkpoint selects only A's first rejection while B
still holds its preview. Saved reasoning and explicit reruns retain the established lifecycle.

Six views do not complete isolation guarantees, rollback, retries, idempotency or publication.
The model still has no database engine, MVCC, locks, durable commits or crash behavior.

## Migration

Existing target JSON and legacy callers are preserved. Upgrade frontend/backend together
for the new target family and draft content. An old content version's saved explanations
remain available with the shared version notice; transient evidence requires a new run.

## Verification

[HLD-16C](../work-items/HLD-16C.md) records exact Java checkpoint fixtures, strict family and
legacy regressions, real browser prefix/cached-reveal/lifecycle evidence, authored no-run/text
flows, responsive/focus/zoom checks, packaged content and required final-head CI.
