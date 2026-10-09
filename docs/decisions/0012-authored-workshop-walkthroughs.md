# 0012: Authored workshop walkthroughs

## Context

The URL-shortener Data/Baseline/Flows contribution needs inspectable architecture and causal paths. These explain a proposed service; they are not simulator executions. Duplicating diagram content in React would separate it from the Java-delivered reference and its version.

## Decision

Add optional `walkthroughs` to `WorkshopStage`, with matching JSON Schema, OpenAPI, generated frontend types, Java records and validation. Each stage accepts at most four paths; each path has 1–8 named participants and 1–20 ordered steps. IDs are unique within their respective scope, bounded and semantic; both endpoints must name participants. A self-edge represents an internal decision. Text lengths are bounded, and unknown fields fail authored-content validation.

The canonical resource authors all descriptions and ordering. Java packages and validates it at startup. Missing optional walkthroughs become an immutable empty list in Java responses. React renders a native SVG participant diagram, manual previous/next/direct selection, one decision inspector, and a complete text equivalent. Each path is one causal branch; mutually exclusive failure/success results are separate paths or explicit reference prose.

The viewer labels itself illustrative and performs no execution, arithmetic, timers, destination fetch or write to the teaching API. A selected relationship highlights its participants without fabricating a simulator event. Paths retain independent step positions within the mounted stage; positions reset on reload. They are presentation state and do not infer completion or overwrite saved answers.

## Alternatives

- Frontend-owned diagrams would duplicate authored facts and require synchronized edits.
- Executable traces would falsely imply a URL-shortening database implementation.
- Mermaid injection or a diagram editor adds rendering/dependency/security complexity without a requirement to edit arbitrary graphs.
- Static images would make causal inspection and a maintained text equivalent harder.

## Consequences

No new dependency, service or database. Sources explicitly pin the PostgreSQL 16 semantics illustrated in the reference; this app neither provisions nor executes that database. Manual navigation works without motion. Narrow diagrams have an interior horizontal scrolling region and an adjacent full text equivalent; the page itself must fit 320px. Selecting a step immediately adjusts interior scrolling to include both participants when they fit, or its sender when they do not, without animation or focus movement.

The contract is additive under schema version 1. Content version 1.2.0 marks material learning changes, preserves earlier answers and requires fresh reference review. Older resources can omit walkthroughs. Removing fields or changing their meaning requires a future compatibility decision.

## Migration

Regenerate API types and package the updated canonical resource with the Java artifact. Deploy frontend and backend and compare content versions; frontend deployment alone does not prove backend freshness. Existing answer envelopes/activity IDs need no migration.

## Verification

Contract fixtures reject unknown endpoints, duplicate nodes/steps, empty/excessive step arrays and executable-looking unknown fields. Java tests cover startup bounds, identity, immutable resources and authored causal ordering. Unit and real-Java browser journeys check independent selections, disabled boundary controls, text equivalents, focus, stage round trips, reload, themes, narrow layouts and reduced motion. These checks verify the teaching experience, not actual SQL transaction behavior. Manual screen-reader/200% zoom and learner teach-back remain release gates.
