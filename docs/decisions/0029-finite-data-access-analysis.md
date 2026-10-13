# Decision 0029: Finite access-pattern analysis with separate work counts

## Context

The owner’s expanded HLD goal requires transactions and idempotency. Their canonical
`data-access-models` prerequisite depends on the implemented capacity lesson. The existing
technical baseline and draft-development policy permit an unpublished contribution; human
and hosted first-release gates remain open. Storage choices need concrete query/write
evidence without adding real database services or pretending to benchmark five engines.

## Decision

Introduce one pure Java finite access analysis over a small multi-tenant order dataset.
Execute ID lookup, tenant range, all-tenant range and insert operations sequentially. Keep
primary IDs unique; optionally enforce a separate `(tenant, businessKey)` rule. Compare a
table scan with one ordered secondary access structure, in either field order. Reject
conflicting writes without changing records or indexes. Record exact captured inputs,
ordered operation outcomes, final records and separate logical work counters.

Use the existing simulation endpoint namespace and resource guards. Descriptor kind remains
`simulation`; the result kind `analysis` distinguishes the finite untimed operation evidence.
Do not invent milliseconds, latency, physical IO or event playback. Input bounds (twenty
initial records, ten operations, thirty final records) bound all work without a scheduler.
Java owns query/insert outcomes and totals. React renders returned evidence and validates
its identity/request relationships without choosing answers or recomputing metrics.

Canonical input/result JSON Schemas export deterministically into OpenAPI. The result references
the input schema rather than duplicating it. Generate a small descriptor validation subset for
lazy Ajv loading, with the same drift gate as delivery. Retain model `1.0.0`, schema `1.0`
and draft content `1.0.0`; HTTP contract `1.5.0` adds the resource.

Ship only Playground, Study and Practice in this slice. Original decision guidance compares
relational, document, key-value, wide-column and graph choices through requirements rather
than invented product rankings. Guided and authored Architecture/sequence views stay pending.

## Alternatives

- A real database laboratory adds installation, optimizer and resource variability before the
  learner has learned to state a query. It may be justified in later storage-engine work.
- Separate simulators for five storage families would duplicate behavior and imply unsupported
  product guarantees. Use source-backed decision guidance with one explicitly scoped model.
- A timed trace would require arbitrary cost assumptions. Exact logical work is sufficient
  for the initial decision, and is labeled accordingly.
- Publishing the draft would bypass human review and first-release gates.

## Consequences

The learner sees the same correct query answer with different candidate work, and a separate
write rule rejecting a new primary ID with a duplicate business key. Index maintenance adds
logical writes. Model limits are visible: no optimizer/skip scan, covering index, physical
tree/page cost, concurrency, crashes, durable transactions or full idempotency protocol.
Detailed physical indexing belongs to `indexes-storage`; concurrent invariants belong to
`transactions-isolation`. This slice does not establish a complete prerequisite or release.

## Migration

Add one canonical draft entry and direct draft route. Preserve the four published topics,
existing versions, saved-answer envelope and discovery/search/path publication boundaries.
Allow saved draft Practice to resume only this explicitly implemented route. Require an
explicit packaged baseline mapping for each draft model so a newly registered experiment
cannot silently escape smoke verification.

## Verification

[HLD-15A](../work-items/HLD-15A.md) records actual numerical/variant/isolation/HTTP/resource
tests, canonical examples, frontend request/evidence tests, real Java browser journeys,
screenshots and delivery checks. Unperformed human, hosted and new-module native zoom
checks remain separate. PostgreSQL’s documented skip scan is intentionally omitted; the
model does not claim every real optimizer follows its single traversal rule.
