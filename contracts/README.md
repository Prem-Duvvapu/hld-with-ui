# Contracts

This directory is the machine-readable boundary between authored content, the Java API, and the React application.

- `openapi.json` defines current HTTP requests, responses, errors, simulation events, and model data.
- `catalog.schema.json`, `questions.schema.json`, `resources.schema.json`, and `checkpoints.schema.json` define authored JSON.
- `examples/` contains valid inputs checked against the OpenAPI schemas.
- `frontend/src/api/generated.ts` is generated. Do not edit it directly.

Run contract generation and validation from `frontend/`:

```bash
npm run contracts:generate
npm run contracts:validate
npm run contracts:check
```

`contracts:check` regenerates the committed TypeScript output and fails when it differs, then validates content shape and semantics. Semantic checks cover unique IDs, prerequisite references and cycles, content paths, lesson heading order, question ownership and answers, source references, capability-to-model references, and guided checkpoints (the `guided` capability requires `checkpointsPath`; each target's event kind must exist in its simulation's event contract). Java tests run each checkpoint's preset and resolve its target event.

## Versioning

The HTTP contract version is the OpenAPI `info.version`. Each simulation request records `schemaVersion` and `modelVersion`; incompatible values are rejected. Increase the model version when behavior changes enough to alter replay. Increase the schema version when the request or trace shape becomes incompatible. Preserve examples for every supported version.

OpenAPI describes what the running server returns. JSON Schema establishes structural validity; Java tests remain responsible for model semantics, and human review remains responsible for technical and teaching quality.
