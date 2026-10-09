# 0016: Define the workshop eligibility clock and service objective

## Context

Publication review found that Requirements proposed separate p95 and availability targets, while Operations used a stricter combined correctness/latency objective. The expiry invariant also omitted the clock authority and the distinction between authorization time and response completion. A primary metadata read does not fix a slow handler clock or cancel an earlier approved response.

## Decision

Use the Operations exercise consistently: at least 99.9% of included well-formed resolves return a contract-correct response within 200 ms at the service boundary over a rolling 30 days. Include correct 404 responses for unknown/expired/taken-down codes; dependency errors, deadlines and included overload rejection fail the objective. Agree abuse/quota exclusions explicitly. p95 is a diagnostic; the estimator's 200 ms mean remains an independent assumption.

Define expiry at the authoritative eligibility decision. In the worked design the primary supplies its current UTC decision time alongside current link state. An unchecked client/handler clock cannot authorize a link. Accuracy through clock changes/failover is an explicit real-implementation assumption to verify. Responses approved before expiry or takedown may finish afterward. A stronger completion guarantee requires a different deadline/coordination contract.

## Alternatives

- Separate availability and percentile objectives are valid product choices, but must be carried consistently through Requirements and Operations.
- Handler clocks need explicit uncertainty bounds and conservative checks; this introductory design does not establish those bounds.
- A guarantee forbidding every post-expiry completion needs an end-to-end response/deadline protocol; a fresh metadata read does not establish it.

## Consequences

This changes teaching content, not simulation behavior or the teaching API. The clock example is illustrative. No clock simulator, database, shortening endpoint or production SLO is introduced. Catalog publication remains subject to the independent prerequisite/manual gates.

## Migration

Content 1.5.0 changes the workshop invariant and explanations. Semantic stage/answer IDs and the local answer schema stay unchanged. Earlier notes are preserved, but reference review and self-checks must be renewed. Deploy the content-bearing Java artifact together with compatible frontend code; frontend deployment alone does not update lessons.

## Verification

Existing Java fixtures reconcile estimates and transfer experiments. Browser checks exercise all ten stages and 64 distinct answer records through backup/reset/import/reload, plus native 200% zoom in both themes. Executed results and missing manual evidence are recorded in [HLD-09C-D](../work-items/HLD-09C-D.md).
