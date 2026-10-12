# Decision 0023: Model a shared finite worker queue before broker delivery

## Context

The requested queue/retry/idempotency learning path first needs `queues-tail-latency`.
Request flow already has per-node queues and routing policies; it does not show a single
shared waiting queue with independently configured job service durations. That distinction
helps explain a burst, head-of-line waiting and why more buffering can reduce rejection
while increasing latency without adding processing capacity.

[Decision 0022](0022-development-and-publication-gates.md) permits unpublished development
while first-release reviews remain open. Existing topic lookup serves published topics only;
this backend model is not an accessible draft lesson or a new published API capability.

## Decision

Add a concrete, request-local, pure Java `QueueCapacitySimulator` and immutable records.
Model one FIFO waiting queue feeding 1–8 workers. Each job declares its arrival and service
duration; waiting capacity excludes active workers. Require nondecreasing arrivals and
stable input order for equal timestamps. Workers have stable IDs.

At a timestamp, complete due jobs first, start already waiting jobs before new arrivals,
then handle arrivals in order. A new arrival immediately reserves an idle worker; otherwise
it waits if there is capacity or is rejected. Positive service durations prevent zero-time
completion loops. Explicit events carry post-transition queue/worker snapshots.

Every input job has exactly one observed state: not arrived, queued, running, completed
or rejected. Successful wait/latency metrics use completed jobs only, with sample count
and nearest-rank p95. Rejected and unfinished jobs remain separate. The finite-batch
observation starts at 0 ms and ends at the last emitted event; throughput is unavailable
when this interval is zero. It is not a production capacity benchmark.

Use `SimulationBudget` defaults and cooperative external deadline/virtual-time checks.
A queue-local typed collector accounts conservatively for the entire emitted events array,
including strings, fields, numbers, commas and snapshots. Admit an event before mutating
state; on failure the final state and counts describe the emitted prefix. Do not disguise
jobs as routed requests to use `EventEmitter`, whose concrete type differs. No generic
model framework, scheduler extraction or existing-model changes are required here.

Schema/model versions begin at `1.0`/`1.0.0`. Standalone JSON Schemas describe this draft
domain contract; OpenAPI remains the actual HTTP boundary and receives no route in this
contribution. Record seed metadata within the signed JavaScript-safe integer range so a
future browser can preserve it exactly. This version uses no random choices.

## Alternatives

- Reuse the routing simulator as a broker: would conflate routing, worker queues and durable
  delivery, and would not provide per-job service variation.
- Add a generic simulation framework first: increases migration risk without a second
  concrete consumer for the queue's typed state/admission behavior.
- Publish a topic to obtain a route: would bypass the draft and publication boundaries.
- Model failures/retries here: would mix capacity/waiting with the next module's broker,
  acknowledgment, durable effect and lease semantics.

## Consequences and migration

Existing API, catalog, UI, model versions, storage and navigation are unchanged. The model
is testable directly and included in the Java artifact, but it has no HTTP registration or
Spring service declaration. No new dependency or infrastructure is introduced.

Bounds: 1–100 jobs, arrivals 0–60,000 ms, service 1–10,000 ms, 0–100 waiting slots. IDs are
bounded ASCII identifiers. Domain validation additionally enforces uniqueness and ordered
arrivals; JSON Schema alone cannot express those cross-record rules. Inputs extending beyond
the virtual-time guard produce limited runs, not fabricated completed work.

Next add deliberate draft-preview delivery, React playback, lesson/practice and learning
review. Implement queue delivery after this prerequisite has reviewed teaching artifacts.
Publishing remains gated by P2-05, published prerequisites and the module's own reviews.

## Verification

[HLD-13A](../work-items/HLD-13A.md) records actual fixture, variation, boundary, budget,
serialization, replay/isolation and contract checks. The baseline input/result examples
are checked structurally by the existing frontend contract gate; a Java test compares the
tracked result with the real model under the configured application serializer.
