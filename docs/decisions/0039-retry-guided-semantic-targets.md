# 0039 — Retry Guided targets identify callers and actual attempts

## Context

The retry Playground already receives immutable Java event snapshots. Guided needs to
select those same facts. Broker message/attempt identities describe a different model;
authored array positions and narration are unstable evidence references.

## Decision

Add a separate request identity family to the shared checkpoint target union. Its three
request-level kinds require only `requestId`, `kind` and `occurrence`. Its eight attempt-level
kinds also require the actual associated `attemptId`. Both branches are closed, use exact
bounded identities and bound occurrence to the retry model's 384-event ceiling. Java,
standalone JSON Schema, generated HTTP types, content checks and the frontend resolver
enforce the same distinction. The exporter checks kind partitions against the canonical
result schema's actual selector capabilities.

Use `GuidedSimulation` for answer storage, reset/version/pending behavior and explicit Java
execution. The retry adapter resolves a returned event and renders its post-state without
future events or whole-run metrics. Architecture and manual sequences are authored views,
clearly labeled and separate from the executed Playground.

## Alternatives

- Reusing delivery message identities would teach the wrong ownership and accept unsupported
  events. An overloaded attempt-only family cannot identify request terminal events honestly.
- Authored offsets or explanation matching would break when causal events or prose change.
- A second Guided state/store implementation would duplicate existing reset and import rules.

## Consequences and migration

HTTP contract 1.12.0 adds the selector branches; retry content 1.1.0 adds eight new activity
IDs. Old target wire shapes and Java constructors remain supported. Existing answers remain
local and are labeled with their saved content version; a saved reveal never restores a
trace or triggers a run. Retry schema 1.0, model 1.0.0 and all four golden pairs are unchanged.
The topic remains draft. No cancellation, business-effect or durability guarantee is added.

## Verification

See [HLD-18C](../work-items/HLD-18C.md) for actual checks. Required evidence includes executing
all named Java presets, malformed/cross-family selectors, generated-contract drift, selected
snapshot equality, no-auto-run storage/reset/history/failure flows, responsive keyboard/theme/
zoom checks and copied-runtime delivery. Human and hosted release gates remain independent.
