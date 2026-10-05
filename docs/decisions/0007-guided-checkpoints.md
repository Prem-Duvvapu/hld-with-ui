# 0007: Guided checkpoints are authored content that Java verifies

Status: accepted — 2026-10-05

## Context

HLD-06 asks for guided cache steps: predict, run the real model, reveal the evidence at a specific event, explain it, and choose a tradeoff. Each step must point at a real event without parsing narration or relying on array indexes. The text must also stay true when the model changes. Hard-coding the steps in React would create a second, hand-maintained list beside the catalog. Generating them in Java would mix teaching prose into simulator code.

## Decision

- Checkpoints are authored JSON (`content/topics/<id>/checkpoints.json`, `contracts/checkpoints.schema.json`), delivered in `TopicDetail.checkpoints`, an array that is empty for topics without them.
- A new catalog capability, `guided`, advertises them and requires `checkpointsPath` and a simulation; topics without `guided` must not declare a path.
- A target is `{operation, kind, occurrence}`: the n-th event of that kind emitted for the 1-based input operation of a named Java preset.
- `GuidedCheckpointsTest` runs every preset through the real controller. It checks that each target resolves, that every preset is covered, and that the specific numbers each explanation teaches (for example 22, 72, 122, and 26 ms; five origin reads) are the values the resolved event and result carry. `validate-content.mjs` checks structure, IDs, simulation membership, recommended options, and that the event kind exists in the simulation's run-result contract.
- React shows the Guided tab only when the capability is present and checkpoints were delivered. It runs the preset on request, resolves the target with the same rule, and says so if the target is missing instead of guessing.

## Alternatives

- **Steps in React.** Rejected: a second catalog, and nothing would tie the prose to Java outcomes.
- **Targets by sequence number.** Rejected: any added event earlier in the trace would silently retarget a step.
- **Targets by narration text.** Rejected by the simulation rules.

## Consequences and migration

`TopicDetail` gains a required `checkpoints` array; the frontend and backend deploy together, and every topic returns it. The catalog capability enum gains `guided`. No simulation input, trace, or model version changes. A future model change that moves an event fails `GuidedCheckpointsTest` before the content can mislead a learner.

## Verification

`GuidedCheckpointsTest` (3 tests), the content validator with a negative check (an unknown kind and a bad recommended option both fail), real-HTTP `TopicDetail` validation for `cache-aside` and `request-flow`, and the guided browser journeys.
