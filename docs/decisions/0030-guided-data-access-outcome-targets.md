# 0030 — Select data-access Guided evidence by operation identity

## Context

Data-access analysis returns ordered outcomes without virtual time. The shared Guided
experience already stores predictions and choices, handles explicit execution and reuses
preset results. Existing targets select cache, capacity or delivery events.

## Decision

Add one closed target family: `operationId`, canonical outcome `kind`, occurrence one.
Operation IDs are unique within a request. Preserve all legacy families and Java constructors.
Derive supported kinds and selector fields from canonical schemas, resolving explicit scalar
references; unknown or ambiguous references fail closed. Data targets validate against actual
outcomes. A thin adapter selects the returned position and reuses shared Guided behavior.
Extract selected-operation evidence for both Playground and Guided. Keep workload totals and
final records in Playground; Guided displays selected counts and populations only.

Authored Architecture and three sequence paths are untimed reading illustrations with native
controls and complete text equivalents. They do not trigger a Java run or simulate an engine.

## Alternatives

Artificial timed events would imply behavior absent from Java. Array positions would couple
content to ordering rather than identity. A second Guided lifecycle would duplicate saved
answer, reset, retry and result-reuse logic. Retain the existing shared lifecycle instead.

## Consequences and migration

HTTP version becomes 1.6.0; data content becomes 1.1.0. Model/schema and seven presets remain
unchanged. Existing targets preserve JSON semantics; mixed selector families reject. Older
saved answers remain available under the shared version-review policy. The topic stays draft.
This establishes no concurrency, durability, physical database or idempotency guarantees.

## Verification

Java fixtures reconcile all eight targets, counts, conflicts and populations. Contract
fixtures cover reference resolution and legacy compatibility. Frontend and real Java browser
checks cover identity resolution, selected evidence, explicit reuse, saved resume, errors and
reading controls. Actual results are recorded in [HLD-15B](../work-items/HLD-15B.md).
