# 0002: Generate frontend API types from OpenAPI

Status: accepted — 2026-09-22

## Context

The first module used handwritten TypeScript interfaces beside Java records. That allowed either side to change without an explicit contract update. Authored catalog, question, and resource files also needed structural and cross-file validation before more modules could be added.

## Decision

Maintain a versioned OpenAPI 3.1 document for current HTTP behavior and generate `frontend/src/api/generated.ts` from it. Keep small application-facing aliases in `frontend/src/api/types.ts`. Define authored JSON with Draft 2020-12 JSON Schemas and run semantic validation for relationships that schemas alone cannot express.

Commit generated TypeScript and make CI regenerate it and reject drift. Require simulation inputs to carry both schema and model versions.

## Alternatives considered

- Continue handwritten interfaces. This is simple for one module but cannot reliably detect client/server drift.
- Generate OpenAPI from Java annotations. This makes Java the source for HTTP shapes but does not cover authored content and can expose implementation shapes accidentally.
- Share TypeScript definitions with the backend. Java cannot consume them as its native contract and content validation would still need another mechanism.

## Consequences

API changes begin in `contracts/openapi.json`, followed by generation and matching Java behavior. Content changes must satisfy structural and semantic checks. OpenAPI generation proves type consistency but does not replace Java integration tests or human review.

## Migration

Replace the handwritten API interfaces with aliases over generated components. Add schemas for catalog, questions, and resources, then enrich the current request-flow content with ownership, source, and capability references.

## Verification

`npm run contracts:check` regenerates types, validates two API inputs, and validates the current catalog, prerequisite graph, lesson structure, questions, sources, paths, and capabilities. Backend API tests verify the enriched fields and omitted optional values.
