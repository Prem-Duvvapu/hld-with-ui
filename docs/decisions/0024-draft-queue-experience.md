# Decision 0024: Deliver draft topics explicitly and connect queue capacity

## Context

HLD-13A implemented the queue-capacity Java model and standalone schemas. The current topic
API serves published concepts only. A draft catalog entry alone cannot provide a reviewable
learning route. The next prerequisite experience needs real HTTP delivery, controls and
playback while first-release human/hosted publication gates remain open.

## Decision

Add `GET /api/v1/draft/topics/{id}` for explicitly requested draft topics. It accepts neither
published topics nor planned entries or case studies. Keep published topic lookup, discovery,
search, bookmark eligibility and learning-path availability unchanged. Add one canonical
draft `queues-tail-latency` entry and a direct React route at
`/draft/topics/queues-tail-latency`, visibly labeled draft.

Register a concrete queue descriptor and run controller at the standard simulation paths.
Descriptor limits/presets derive from Java model constants and typed inputs. Its five presets
are the hand-checkable baseline, more buffering, more workers, one slow job and virtual-time
limitation. Existing body/admission guards cover the run route; `SimulationResponses` bounds
the whole serialized envelope.

Parse queue input with a local strict reader and bounded raw body. Reject missing/null/unknown
fields, duplicate keys, trailing roots, numeric strings, floating numeric tokens and wrong
container types before conversion. Required creator fields, nested Bean Validation and direct
domain checks enforce the remaining bounds/order/identity/version rules. Existing APIs and
their global Jackson configuration are unchanged. JSON Schema describes structural numeric
constraints; lexical integer-token and cross-record rules are additionally enforced by Java.

The standalone queue schemas remain the source of model shape. A deterministic export script
maps their local definitions into normal OpenAPI components and internal references. Contract
generation checks both OpenAPI and TypeScript drift. This avoids hand-maintained duplicate
schema bodies and preserves existing response-validator reference handling. OpenAPI is now
`1.1.0`; model/schema versions remain `1.0.0`/`1.0` because domain behavior is unchanged.

React provides Playground, Study and Practice through the existing module shell. It stores
draft controls separately from captured run inputs and results. Playback selects returned
initial/post-event snapshots; it never dispatches jobs or computes authoritative outcomes.
Scheduled completion is labeled separately from an observed completion. Nullable successful
statistics are unavailable; limited traces retain honest outstanding populations.

## Alternatives

- Let published topic lookup return drafts: would blur publication for every consumer.
- Publish the entry to obtain a route: would falsely pass release and prerequisite reviews.
- Duplicate schemas inside OpenAPI: would create independent definitions for one model.
- Add all proposed tabs immediately: would advertise teaching artifacts not yet implemented.
- Recompute queue state in React: would duplicate Java behavior and risk inconsistent playback.

## Consequences and migration

Four published topics and the existing draft URL workshop retain their URLs and behavior.
The new experience is directly accessible, but excluded from ordinary published discovery.
Practice uses existing local answer storage. Continue learning resolves an existing saved
queue answer through the explicit draft lookup and exact implemented draft route, with a
draft-topic label. It does not discover other drafts or manufacture routes from metadata.
No accounts, services or new dependencies are introduced. Resource guards apply across four registered simulations without changing limits.

Draft development can now be reviewed as a complete core input → trace → explanation flow.
Guided checkpoints, dedicated architecture/sequence views, broader human reviews and publication
remain follow-up work. This does not complete P2-05 or the overall messaging/reliability wave.

## Verification

[HLD-13B](../work-items/HLD-13B.md) records the actual Java/HTTP, contract, React, browser,
packaged-runtime and visual checks. Missing manual screen-reader/newcomer evidence remains
explicit. Only recorded checks constitute verification; the decision itself is not a gate pass.
