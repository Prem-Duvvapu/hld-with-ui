# Decision 0025: Share the guided flow, preserve model-specific evidence

## Context

Cache-aside has a working saved-answer predict/reveal/explain/tradeoff flow. The draft queue
module needs the same learning interaction but selects events by stable job ID rather than
cache operation. Copying the complete state/storage flow would duplicate reset, version,
error and replay rules. A second concrete consumer now justifies a small shared component.

## Decision

Extract the interaction into typed `GuidedSimulation<Input, Result>`. Concrete cache and queue
adapters provide presets, explicit Java execution, target resolution and playback rendering.
The shared component owns selected checkpoint, local saved reasoning, transient memoized runs,
pending/reset/version guards and reveal gating. It has no model registry, queue engine or
metric calculations. Preserve cache labels, URLs, stored activity identities and selector JSON.

Targets form an explicit union: `{operation, kind, occurrence}` for cache or
`{jobId, kind, occurrence}` for queues. Exactly one subject is required. Java checks selector
shape; authored schemas and the content validator additionally require a selector supported
by that model's actual event schema. Java fixtures execute every queue checkpoint and check
its timing, state and metric populations. No selector is an event array index or narration.

The standalone checkpoint schema becomes authoritative for the complete OpenAPI checkpoint
component. The renamed `sync-simulation-contracts.mjs` exports it together with the existing
queue model schemas; generation rejects OpenAPI and TypeScript drift. OpenAPI is `1.2.0`.
Queue learning content is `1.1.0`, preserving older answers with explicit review notices.
Existing simulator behavior, inputs/results and replay versions are unchanged.

A reveal requires an explicit successful Java run and matching event. Stored reference-view
state cannot manufacture a trace after refresh. Missing events withhold the verified
explanation/tradeoff. Pending completions are ignored after reset or unmount; errors belong
to their checkpoint. Storage problems remain visible without preventing reference reading
when real matching Java evidence is available. Answers stay local; traces stay in memory.

Architecture and job-sequence views are original authored explanations of the fixed local
model. Selectable steps do not execute Java or follow edited Playground inputs. Label this
boundary and provide complete text equivalents; a local transition arrow is not a network hop.

## Study renderer correction found during verification

The new all-tab mobile journey exposed unbounded code examples in shared Study. Authored
pipe tables were also rendered as paragraphs because the Markdown parser did not enable
GFM tables. Add pinned `remark-gfm` 4.0.1 (MIT) for this concrete teaching requirement,
retaining React Markdown's inert raw-HTML behavior. Render native table headers with column
scope, and keep tables/code in labeled keyboard-scrollable regions within the reading grid.
Do not clip the example or reduce it to unreadable text.

The [official plugin](https://github.com/remarkjs/remark-gfm) and
[React Markdown integration](https://github.com/remarkjs/react-markdown#use-a-plugin) were
reviewed. Installation also exposed an existing `source-map-js` 1.2.1 audit finding via
Vite/PostCSS. Its permitted patch 1.2.2 was verified against the
[reviewed advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) and updated in the lockfile.
Other pinned tool versions remain the same. The local audit then reported zero vulnerabilities;
that observation is not a guarantee about future advisories or hosted security.

## Alternatives

- Copy cache Guided wholesale: duplicates lifecycle logic across two consumers.
- Build a general simulator registry: no current requirement for automatic model discovery.
- Treat queue jobs as operation-array numbers: loses stable semantic identity.
- Use both selectors or default one silently: makes stale/malformed content ambiguous.
- Reveal explanations before a target resolves: can present unmatched evidence as verification.
- Generate frontend outcomes for the walkthrough: duplicates authoritative Java behavior.

## Consequences and migration

Cache public routes and stored answers remain unchanged. New queue Guided IDs share the
existing per-topic answer namespace and use the standard checkpoint URL selector. Ordinary
published discovery remains four topics; draft resume requires existing saved work.

The shared flow needs regressions for both adapters, failure/reset races and storage handling.
The target extension is additive at the HTTP boundary, while TypeScript consumers must narrow
the union before reading a selector. The queue experience remains unpublished pending reviews;
this decision does not waive P2-05 or enable durable delivery/idempotency claims.

## Verification

[HLD-13C](../work-items/HLD-13C.md) records actual checks, screenshots and outstanding human
reviews. Required PR CI is recorded on the final contribution head before squash merge.
