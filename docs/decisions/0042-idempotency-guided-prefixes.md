# 0042 — Idempotency Guided evidence selects an actual call step

## Context

The idempotency workbench already returns initial and post-step Java states. Teaching a
lost response, competing save or expiry requires choosing the exact prefix: a server can
hold a receipt before its caller receives it, and a later duplicate is not current evidence.

## Decision

Extend the existing closed `stepId` / `kind` / `occurrence: 1` target family with the sixteen
actual idempotency outcome kinds. Derive capabilities from the canonical result schema.
Preserve all reservation, atomicity and older selector families. Java's target constructor
validates the shared family union; model-specific content validation, client compatibility
and exact Java checkpoint tests verify the selected model and preset. These checks do not
introduce a general simulator or a new catalog startup execution policy.

Reuse `GuidedSimulation` for explicit execution and the saved-answer lifecycle. The
idempotency adapter renders only the selected outcome and its post-state. It does not expose
the full timeline or whole-run metrics at an earlier checkpoint. The frontend guard checks
shape and references; only Java decides which outcome a scheduled action actually produces.

Architecture and three manual call paths are original authored illustrations. Every initial
and post-step state in those paths is compared with the corresponding Java program. They
remain separate from edited Playground inputs and make no execution or network claim.

## Alternatives

- Array positions and narration would turn incidental order or wording into evidence identity.
- A new target shape would duplicate an existing exact-step selector without adding a fact.
- A separate Guided store would duplicate answer/reset/version/history behavior.
- A client-side action-to-outcome table would become a second policy implementation.

## Consequences and migration

HTTP advances to 1.14.0; idempotency content advances to 1.1.0 with eight new checkpoint
activities. Old wire shapes, Practice IDs and answer format remain supported. Older answers
show their saved version; restored notes never restore a trace or cause an automatic POST.
Simulation schema 1.0 / model 1.0.0, all nine golden pairs and the GET descriptor stay unchanged.
Four modules remain published. No real durability or external-provider guarantee is added.

## Verification

[HLD-19C](../work-items/HLD-19C.md) records checks actually run. Required evidence includes
eight exact Java prefixes, 27 authored states, malformed/cross-model selectors, canonical
generation, saved reasoning and explicit failure/retry, manual design controls/text,
responsive themes, reduced motion, native zoom and copied-runtime delivery. Human/hosted
and publication gates remain independent.
