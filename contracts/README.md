# Contracts

This directory is the machine-readable boundary between authored content, the Java API, and the React application.

- `openapi.json` defines current HTTP requests, responses, errors, simulation events, and model data.
- `catalog.schema.json`, `questions.schema.json`, `resources.schema.json`, `checkpoints.schema.json`, `workshop.schema.json`, and `learning-paths.schema.json` define authored JSON.
- `examples/` contains valid inputs checked against the OpenAPI schemas.
- `frontend/src/api/generated.ts` is generated. Do not edit it directly.

Run contract generation and validation from `frontend/`:

```bash
npm run contracts:generate
npm run contracts:validate
npm run contracts:check
```

`contracts:check` regenerates the committed TypeScript output and fails when it differs, then validates content shape and semantics. Semantic checks cover unique IDs, prerequisite references and cycles, content paths, lesson heading order, question ownership and answers, source references, capability-to-model references, and guided checkpoints (the `guided` capability requires `checkpointsPath`; each target's event kind must exist in its simulation's event contract). Java tests run each checkpoint's preset and resolve its target event. Workshop checks validate stable stage/answer identities, versions, source references, published experiment links, and the full-journey publication guard. Isolated negative fixtures run as part of `contracts:validate`; Java separately validates packaged case resources and catalog prerequisite references, publication closure and cycles at startup, including Java-only builds. These checks do not establish manual release readiness.

## Case discovery

`GET /api/v1/case-studies` returns an array of `CatalogEntry` metadata for startup-validated, published workshops, sorted by catalog order then ID. Draft/planned cases are omitted; the current production catalog yields `[]`. Explicit authored draft detail routes stay available for review. This additive endpoint does not change workshop schemas, content/model versions, answer storage or the topic collection. See [the discovery decision](../docs/decisions/0014-published-case-discovery.md).

## Published search

`GET /api/v1/search` accepts one `q`, `level` and `capability` parameter each; unknown/repeated filters return 400. Blank queries return no results; nonblank queries use 2–100 UTF-16 code units with case/compatibility normalization and literal whitespace-separated terms. `SearchResponse` schema version 1 returns at most 20 `SearchHit` entries, total match count and plain excerpts of at most 222 Unicode code points. Optional stage ID/title are omitted for topics. All result routes derive from published catalog IDs. This additive contract does not change simulator versions or answer backups.

## Versioning

The HTTP contract version is the OpenAPI `info.version`. Each simulation request records `schemaVersion` and `modelVersion`; incompatible values are rejected. Increase the model version when behavior changes enough to alter replay. Increase the schema version when the request or trace shape becomes incompatible. Preserve examples for every supported version.

OpenAPI describes what the running server returns. JSON Schema establishes structural validity; Java tests remain responsible for model semantics, and human review remains responsible for technical and teaching quality.

Learning paths contain ordered canonical module references and purposes, with optional deeper
references. Shape/size/schema checks reject unsupported fields; semantic checks require unique
path/module IDs, existing catalog references, and every prerequisite earlier in the main/optional
order. Java repeats these checks at startup. The API resolves published entries and current answer
identities, hiding entry/activity metadata for draft/planned steps. Browser tests validate the
actual Java response against OpenAPI and separately assert the draft publication boundary.
