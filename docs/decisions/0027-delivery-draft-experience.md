# Decision 0027: delivery draft experience and canonical compatibility checks

Status: accepted for HLD-14B; publication review remains pending.

## Context

HLD-14A provides a verified Java model with independent broker, consumer, attempt and ledger
states. Its events contain typed changes rather than whole-world snapshots. The next learner
experience needs to preserve those semantics, expose failure inputs and reject incompatible
responses without a second hand-maintained schema. The prerequisite queue topic is still draft.

## Decision

Register `queues-delivery` once in the canonical catalog as a draft topic, with Study,
Simulation and Practice capabilities and an explicit `/draft/topics/queues-delivery` React
route. Add its versioned descriptor and run endpoints to OpenAPI 1.3.0. Model 1.0.0 and schema
1.0 remain unchanged. The first experience has three working tabs; Guided and authored
Architecture/sequence views follow as a separate contribution before core completion.

Java owns every outcome and metric. Playback applies all preceding event changes by stable
entity ID, replacing each complete changed record. Omitted nullable fields clear earlier
pointers; spreading new fields onto an old record would retain invalid state. A message focus
changes selection only, not world reconstruction. Ledger entries come from emitted events.
Metrics stay labeled as final-run or observed-prefix values regardless of playback position.

Use the existing pinned Ajv 8.20.0 compiler to validate the canonical delivery input/result
schemas and a descriptor schema generated from OpenAPI. Classify that existing dependency as
production, and load its compatibility module lazily from delivery API methods. This keeps
schema/enum shape ownership in the contracts and avoids loading the compiler on unrelated
published routes. Check request/result identity separately for seed and initial entities.
Strict request parsing in Java rejects duplicate/trailing JSON, unknown fields and integral
coercion before direct semantic validation.

## Alternatives

- A second manual set of TypeScript field/enum guards would increase drift risk for thirteen
  event kinds and several independent state axes.
- Shallow entity merging would be smaller but incorrect for omitted-null serialization.
- Publishing immediately would bypass the outstanding prerequisite/human release gates.
- Adding all guided content and diagrams in this change would expand the review boundary;
  the three-tab vertical draft is usable without advertising those missing capabilities.

## Consequences

The direct route adds an explicit draft renderer without changing published discovery,
bookmarks or the first learning path. Saved Practice reasoning can resume this implemented
route; Playground predictions, inputs and traces are not persisted as replay artifacts.
The contract drift command also checks the generated descriptor schema. Ajv adds a lazily
loaded chunk to this draft; the production build and browser checks must verify that boundary.
No broker service, transaction, deduplication, provider integration or infrastructure is added.

## Migration

No model/schema or existing answer IDs change. New semantic question IDs use content version
1.0.0. Existing modules retain their contracts and routes. Regenerate OpenAPI/types/descriptor
schema together; stage intentional generated changes before checking index-relative drift.

## Verification

HLD-14B records actual Java HTTP/limits/isolation, canonical contract compatibility,
projection and form tests, real Java browser journeys, responsive/theme/focus/reduced-motion
checks, packaged runtime and final-head CI. Publication and human screen-reader/newcomer review
remain separate gates. Do not infer completed checks from this decision's design.
