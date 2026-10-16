# 0036 — Separate Guided sessions for two transaction models

Date: 2026-10-16. Status: accepted for the draft transaction experience.

## Context

The canonical transaction topic now advertises two independently versioned Java analyses.
Both descriptors contain preset IDs such as `protected-baseline`, but these inputs and
results have different schemas and meanings. GuidedSimulation caches runs by preset ID.
Atomicity checkpoints also need actual step identity without inventing an event clock.

## Decision

Keep the existing finite stepId/kind/occurrence1 selector family. Its closed vocabulary
includes the actual reservation and atomicity kinds; content validation resolves the
checkpoint's simulationId to canonical outcome capabilities and rejects cross-model kinds.
Java fixtures execute each new target and verify its selected prefix.

Use separate ReservationGuided and AtomicityGuided instances with model-filtered checkpoints.
Each owns its run cache; both save reasoning under canonical topic `transactions-isolation`
with distinct authored activity IDs. Keep visited sibling views mounted and preserve their
selected checkpoints when explicitly switching experiments. A model selector applies across
the four experiment-specific views. A known Guided checkpoint in a resume URL identifies
its model and normalizes the experiment query without issuing a run.

A topic-scoped provider loads/caches the atomicity descriptor on demand for Playground or
Guided. An in-flight descriptor request remains owned by that mounted topic when the user
changes views; the next view shares it. Static authored Architecture/Operation sequence and
Study/Practice do not require this descriptor or run either model. Errors remain local and
retry is explicit. Missing model metadata and unknown experiment IDs remain visible.

## Alternatives

One mixed Guided instance would need compound cache keys and result dispatch, increasing
shared machinery for two concrete adapters. Keeping a loader in every panel would duplicate
requests and error state. Duplicating a new time-based target family would misrepresent the
untimed model. The concrete provider and existing step selector address the actual needs.

## Consequences and migration

Content advances to 1.3.0; older reasoning remains available and needs fresh reference review.
Original eight reservation and sixteen Practice question IDs remain stable. HTTP advances
to 1.10.0 for the additive selector vocabulary. Both model/schema versions and their goldens
remain unchanged. Existing selector families and default reservation links retain behavior.

This contribution supplies technical draft views. It establishes no database, durability,
SQL isolation, retry, idempotency, external-effect or publication guarantee.

## Verification

See [HLD-17C](../work-items/HLD-17C.md) for actual checks, generated-contract drift,
Java targets, saved-answer lifecycle, same-preset cache isolation, model-aware resume,
reading/no-POST, responsive/theme/native-zoom browser evidence and remaining human gates.
