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

`contracts:check` exports canonical queue schemas into OpenAPI, regenerates the committed TypeScript output and fails when either differs, then validates content shape and semantics. Semantic checks cover unique IDs, prerequisite references and cycles, content paths, lesson heading order, question ownership and answers, source references, capability-to-model references, and guided checkpoints (the `guided` capability requires `checkpointsPath`; each target's event kind must exist in its simulation's event contract). Java tests run each checkpoint's preset and resolve its target event. Workshop checks validate stable stage/answer identities, versions, source references, published experiment links, and the full-journey publication guard. Isolated negative fixtures run as part of `contracts:validate`; Java separately validates packaged case resources and catalog prerequisite references, publication closure and cycles at startup, including Java-only builds. These checks do not establish manual release readiness.

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

## HTTP resource failures

Every API POST has a raw-body ceiling (default 256 KiB), including chunked/unknown-length
bodies. The four simulation run endpoints also have a complete serialized-result ceiling
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
