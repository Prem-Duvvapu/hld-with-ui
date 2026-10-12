# Contracts

This directory is the machine-readable boundary between authored content, the Java API, and the React application.

- `openapi.json` defines current HTTP requests, responses, errors, simulation events, and model data.
- `catalog.schema.json`, `questions.schema.json`, `resources.schema.json`, `checkpoints.schema.json`, `workshop.schema.json`, and `learning-paths.schema.json` define authored JSON.
- `examples/` contains inputs checked against OpenAPI plus explicitly named draft domain input/result examples checked against their standalone schemas.
- `frontend/src/api/generated.ts` is generated. Do not edit it directly.

Run contract generation and validation from `frontend/`:

```bash
npm run contracts:generate
npm run contracts:validate
npm run contracts:check
```

`contracts:check` exports canonical queue-capacity and delivery schemas into OpenAPI, regenerates the committed TypeScript and delivery descriptor schema output and fails when these differ, then validates content shape and semantics. Semantic checks cover unique IDs, prerequisite references and cycles, content paths, lesson heading order, question ownership and answers, source references, capability-to-model references, and guided checkpoints (the `guided` capability requires `checkpointsPath`; each target's event kind must exist in its simulation's event contract). Java tests run each checkpoint's preset and resolve its target event. Workshop checks validate stable stage/answer identities, versions, source references, published experiment links, and the full-journey publication guard. Isolated negative fixtures run as part of `contracts:validate`; Java separately validates packaged case resources and catalog prerequisite references, publication closure and cycles at startup, including Java-only builds. These checks do not establish manual release readiness.

## Case discovery

`GET /api/v1/case-studies` returns an array of `CatalogEntry` metadata for startup-validated, published workshops, sorted by catalog order then ID. Draft/planned cases are omitted; the current production catalog yields `[]`. Explicit authored draft detail routes stay available for review. This additive endpoint does not change workshop schemas, content/model versions, answer storage or the topic collection. See [the discovery decision](../docs/decisions/0014-published-case-discovery.md).

## Published search

`GET /api/v1/search` accepts one `q`, `level` and `capability` parameter each; unknown/repeated filters return 400. Blank queries return no results; nonblank queries use 2–100 UTF-16 code units with case/compatibility normalization and literal whitespace-separated terms. `SearchResponse` schema version 1 returns at most 20 `SearchHit` entries, total match count and plain excerpts of at most 222 Unicode code points. Optional stage ID/title are omitted for topics. All result routes derive from published catalog IDs. This additive contract does not change simulator versions or answer backups.

## Versioning

The HTTP contract version is the OpenAPI `info.version`. Each simulation request records `schemaVersion` and `modelVersion`; incompatible values are rejected. Increase the model version when behavior changes enough to alter replay. Increase the schema version when the request or trace shape becomes incompatible. Preserve examples for every supported version.

OpenAPI describes what the running server returns. JSON Schema establishes structural validity; Java tests remain responsible for model semantics, and human review remains responsible for technical and teaching quality.

## Draft queue capacity contract

`queue-capacity.input.schema.json` and `queue-capacity.result.schema.json` own the
`queues-tail-latency` shape (`1.0` schema, `1.0.0` model). The deterministic exporter in
`frontend/scripts/sync-simulation-contracts.mjs` derives its OpenAPI components with internal refs; the same exporter derives `GuidedCheckpoint` from
`checkpoints.schema.json`, with exactly one cache-operation or queue-job selector;
generated frontend types derive from OpenAPI. HTTP contract version `1.1.0` added explicit
`GET /api/v1/draft/topics/{id}` and queue descriptor/run endpoints. Draft topic lookup rejects
published/planned/case IDs; published collections and search exclude the queue topic.

Jobs have unique bounded ASCII IDs, nondecreasing arrivals and individual service durations.
JSON Schema checks parsed fields/types/ranges; Java additionally rejects duplicate keys,
trailing roots, nonintegral token spellings, repeated IDs and unordered arrivals. Missing/null
or coerced values cannot silently become defaults. Seed metadata uses signed JavaScript-safe
integers. Queue capacity counts waiting jobs only. Typed snapshots drive playback, and
completed metrics exclude rejected/unfinished jobs. The two baseline examples are validated
by the content gate and compared with actual Java serialization and packaged HTTP output.
See [decision 0024](../docs/decisions/0024-draft-queue-experience.md). HTTP version `1.2.0` adds
job-based guided targets without changing simulation versions; queue content `1.1.0` supplies
eight checkpoints. [Decision 0025](../docs/decisions/0025-shared-guided-simulation.md) records
selector narrowing and evidence/lifecycle boundaries.

Learning paths contain ordered canonical module references and purposes, with optional deeper
references. Shape/size/schema checks reject unsupported fields; semantic checks require unique
path/module IDs, existing catalog references, and every prerequisite earlier in the main/optional
order. Java repeats these checks at startup. The API resolves published entries and current answer
identities, hiding entry/activity metadata for draft/planned steps. Browser tests validate the
actual Java response against OpenAPI and separately assert the draft publication boundary.

## Draft queue delivery contract

`queue-delivery.input.schema.json` and `queue-delivery.result.schema.json` describe the
illustrative `queues-delivery` model (`1.0` schema, `1.0.0` model). HLD-14A supplied the
standalone Java model and schemas. HTTP version `1.3.0` adds its descriptor/run endpoints and
an explicit draft learning route with Playground, Study and Practice. Published topic/search
collections and learning paths continue to exclude the draft. Guided coverage is not advertised.
The deterministic exporter derives delivery components and generated frontend aliases from
these canonical schemas. It also generates the descriptor validation schema from only the
reachable OpenAPI components, with its own drift check.

Inputs use bounded ASCII identities, explicit enqueue/failure/lost-ACK schedules and signed
JavaScript-safe seeds. JSON Schema checks closed fields, types and bounds. Java additionally
checks unique identities, referenced schedule subjects, loss selectors, chronological
alternating crash/recovery actions and the ACK-before timing inequality. The schema accepts
parsed JSON values. The model-specific HTTP controller additionally rejects duplicate keys,
trailing roots, missing/null fields and numeric strings, fractions, exponents or booleans used
for integer fields.

Result events carry typed post-event entity changes. Each kind requires its applicable
message/attempt/consumer identities; only `effect.committed` carries a ledger append. Lease,
effect and ACK states remain separate, including transient crash and expiry states inside
atomic event batches. Java tests reconcile these changes with final state, outcomes and metrics.
Unavailable nullable fields may be omitted by the configured mapper. Limited runs require a
stop reason and leave `acknowledgedWithoutEffect` unavailable; empty ACK/effect populations
leave latency statistics unavailable. Neither ACK policy promises exactly-once business effects.

The baseline input and actual Java-serialized result in `examples/` are checked by
`contracts:validate`; the delivery fixture suite adds positive boundary and meaningful negative
checks. Its derived limited structural fixture is explicitly distinguished from an executed
limited simulation. Serialization comparison and causal semantics remain Java test responsibilities.
The delivery API methods load their Ajv validator and canonical schemas lazily; existing
published routes do not eagerly load that compiler. Compatibility checks reject unsupported
shapes, unsafe entity references and unordered traces, and correlate seed, initial workload
identities/times and fault selector metadata with the captured request. They validate evidence
without manufacturing outcomes or latency statistics. The existing pinned Ajv package is
classified as a production dependency; no separate validation vocabulary is maintained.
See the [delivery implementation handoff](../docs/QUEUE_DELIVERY_IMPLEMENTATION_PLAN.md).

## HTTP resource failures

Every API POST has a raw-body ceiling (default 256 KiB), including chunked/unknown-length
bodies. The five simulation run endpoints also have a complete serialized-result ceiling
(default 4 MiB) and share process-local synchronous admission (default 2, no queue).

- 413 `request_too_large`: reduce the workload before sending it again.
- 422 `result_too_large`: reduce the workload to obtain a complete deliverable result.
- 503 `simulation_busy`: keep inputs and retry explicitly; `Retry-After: 1` is a delay hint,
  not a promise of capacity after one second.

All use the closed `ApiError` shape: `code`, `message`, `fieldErrors`, and required ISO
`timestamp`. This timestamp was already emitted by Java; HLD-11A reconciles its omission
from OpenAPI. No successful-response shape, model/schema version, or answer backup changes.
An HTTP overload failure is distinct from a rate-limiter decision inside a simulated run.
See [decision 0021](../docs/decisions/0021-http-simulation-resource-guards.md) for configuration and limits.
