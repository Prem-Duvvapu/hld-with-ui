# 0010: Deliver draft workshops separately from published topics

Status: accepted — 2026-10-08

## Context

HLD-09A needs a real Requirements stage before the full URL-shortener case can be published. A case is a design exercise rather than an executable shortening service. Topic discovery must continue to describe working published modules, while an explicit draft route lets the owner review the first stage.

## Decision

- Keep case identity, version, status, prerequisites, capabilities, and resource paths in the canonical catalog. Add `workshopPath` for authored case-study entries; topic entries retain their existing lesson/question resources.
- Author a bounded `workshop.json` with schema version 1, introduction, invariant, and ordered stages. Each stage has a stable ID, prompt, original reference, rubric criteria, primary-source IDs, and links with instructions for existing experiments. JSON Schema and OpenAPI describe the resource; TypeScript is generated.
- Java packages and validates case resources at startup, then serves `GET /api/v1/case-studies/{id}` as `{entry, workshop}`. Only authored draft/published case entries resolve. Paths derive from a matching canonical entry, never from arbitrary request text. Existing topic endpoints select published entries of kind `topic`.
- Expose the draft through a lazy `/case-studies/:id` route using the shared shell. Show only implemented stages, a draft notice, and a distinction between an educational decision and an executable experiment. Keep the incomplete case out of ordinary home discovery.
- Reuse `hld-practice-v1`: stage records are `<stage-id>-attempt`, `<stage-id>-revision`, and `<stage-id>-check-<criterion-id>`, keyed by case ID/content version. The original attempt remains visible after reference reveal; the separate revision records improved reasoning. Self-checks use `yes`/`revisit`, never an automatic score or mastery claim. No personal text is sent to Java, analytics, or URLs.
- Preserve older answers and require fresh reference review/self-checks. Shared download/import/conflict/reset/retry controls apply to case answers without a new storage schema. Reference reading remains possible when the record limit prevents persisting a reveal; that session-only reveal does not claim durable saving.
- Require unique stage/rubric and derived activity IDs, bounded strings/arrays, catalog/resource version agreement, resolved sources, and links to published executable experiments. Before publication, require the complete ten-stage design journey. Structural validation does not close technical, learning, or manual accessibility gates.

## Alternatives

- Publish a one-stage case as complete: would advertise an unfinished design journey.
- Reuse topic lesson/question delivery for workshops: obscures ordered decisions and conflates cases with simulation-capable topics.
- Add a real URL-shortening service: introduces unrelated persistence, abuse, and deployment work before the educational design is ready.
- Create a second answer store: duplicates lifecycle behavior already exercised by Practice and Guided.

## Consequences and migration

Existing topic resources and answer exports remain compatible. Topic responses may omit the new optional `workshopPath`; case responses omit unused lesson/question paths. Draft access by URL is a review convenience, not access control. No account, service, dependency, simulation model, or API for creating links is introduced. Case publication/discovery and the remaining nine stages belong to HLD-09B/C.

## Verification

Record actual contract, Java, frontend, real-HTTP/browser, persistence, theme, responsive, and keyboard results in [HLD-09A](../work-items/HLD-09A.md). Keep manual learning and accessibility review distinct from automated checks.
