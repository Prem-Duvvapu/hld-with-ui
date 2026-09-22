# Content authoring contract

Status: active specification. Request Flow & Load Balancing is the first published topic. Use this contract with [the curriculum](../docs/CURRICULUM.md), the JSON Schemas in `contracts/`, and the assigned roadmap item.

## 1. What a complete module contains

Build an integrated module following the primary LLD-with-UI reference: meaningful operations, guided simulation when applicable, architecture, request sequence, design details, and practice. Content must explain what the learner sees when they run the module.

One topic normally owns:

```text
content/topics/<topic-id>/lesson.md
content/topics/<topic-id>/questions.json
content/topics/<topic-id>/resources.json
```

Case studies use `content/case-studies/<case-id>/`. Add its metadata to the canonical `content/catalog.json` once that file exists. Simulation presets and model fixtures live with the contracts/models, not as duplicate executable logic embedded in prose.

Do not create placeholder lessons just to fill the curriculum. Register a planned item as planned; publish only after the relevant gates pass.

## 2. Lesson structure

Use these headings in this order. The future validator will check exact headings and explicit section anchors. Subheadings may vary.

```markdown
# <Title>

<A concrete problem, why it matters, and what the learner will be able to decide.>

## Learning outcomes
## Explain it simply
## Prerequisites
## Mental model
## How it works
## Worked example
## Explore in the playground
## Failures and tradeoffs
## In a real project
## Interview practice
## Teach it back
## Further reading
```

For an estimator, “Explore in the playground” describes editable assumptions and outputs. For a theory-only module, it describes a worked decision exercise and explicitly states that no executable experiment is available. Do not imply an unsupported feature.

### Depth and clarity

- Start with vocabulary and a simple mechanism, then develop intermediate application and advanced limits. Use section metadata for level navigation instead of requiring arbitrary word counts.
- Every outcome is observable: “Given replica lag, predict which reads may be stale,” rather than “Understand replication.”
- Include one complete numerical or state-transition example with inputs, intermediate work, final result, units, and assumptions.
- Include an architecture diagram and a sequence/state diagram when both explain distinct facts. Provide an adjacent textual description.
- Explain at least two valid alternatives and when each is reasonable. A comparison table must identify the workload and correctness assumptions.
- Include realistic failure, detection, mitigation, and residual limitation. Avoid ending with “add more servers” without identifying the bottleneck.
- Include a transfer exercise whose setup differs from the demonstrated preset.
- Include a plain-language opening, teammate explanation prompt, two-minute interview answer scaffold, and changed-condition follow-ups as specified in [the learning standard](../docs/LEARNING_STANDARD.md).
- Correct misconceptions in context, including one tempting but wrong interpretation of the experiment.
- Do not pad lessons to meet line counts or equate diagram/question counts with quality.

## 3. Case-study structure

```markdown
# <System design case>

## Problem and scope
## Requirements and non-goals
## Scale assumptions and estimates
## APIs and data model
## Baseline architecture
## Request and data flows
## Experiments and bottlenecks
## Design evolution and alternatives
## Failures and recovery
## Security and abuse
## Operations, rollout, and cost
## Interview walkthrough
## Decision record and exercises
## Further reading
```

Required evidence: two or more complete flows, including a write or state-changing path; an explicit invariant; one overload scenario; one dependency failure; one alternative architecture; one migration decision; one operational signal; and a rubric with acceptable alternative reasoning.
Case studies also need a brief opening pitch and a deeper interview walkthrough so the learner practices explaining the same design at different levels.

The initial URL shortener may explain collision handling and database uniqueness locally without waiting for the full distributed-ID curriculum. Mark this as a bounded introductory treatment, link to the planned deeper module only as unavailable, and never add an unfulfilled prerequisite to the first release.

Architecture diagrams label protocols, ownership, synchronous/asynchronous edges, and storage responsibility. Explain whether a queue represents a durable broker or an in-memory worker queue. Name the boundary within which each guarantee holds.

## 4. Metadata contract

Finalize JSON Schemas in `P0-02`. Required conceptual fields:

| Field | Rule |
| --- | --- |
| `id` | Stable lowercase kebab-case; unique across topic and case-study entries |
| `kind` | `topic` or `case-study` |
| `title`, `summary` | Reader-facing text with no implementation jargon |
| `category`, `order`, `level` | Controlled category/level values and deterministic order |
| `prerequisites` | Existing canonical IDs; no self-reference or cycles |
| `outcomes` | Observable learning outcomes |
| `status` | `planned`, `draft`, or `published` |
| `capabilities` | Only implemented, checked capabilities may be advertised as available |
| `lessonPath` | Present for authored lessons; cannot escape the content root |
| `contentVersion` | Changes when a material learning claim or exercise changes |
| `simulationIds`, `estimatorIds` | Explicit references, each resolved against its registry |
| `reviewedAt`, `sourceIds` | Review date and corresponding resource entries |

Future catalog generation may include all planned entries, but app navigation cannot present a planned module as usable. Required lesson files apply to draft/published entries; placeholder file paths are not allowed for planned entries.

## 5. Questions and feedback

Questions are structured separately for reuse in the lesson and practice mode. Each has a stable `id`, topic ID, level, kind, prompt, explanation, rubric, and optional source references. Kinds: recall, prediction, diagnosis, design-decision, and calculation. Closed-choice questions additionally declare options, correct option IDs, and distractor explanations.

An answer must explain the mechanism, state assumptions, and discuss a follow-up. For free text, show a rubric and example answer after the learner attempts it; do not use string equality to score reasoning.

Every released module needs coverage of its learning outcomes across questions. Aim for a compact useful set, including prediction, failure diagnosis, and transfer. The reviewer checks reasoning quality; question count alone is not acceptance.

Example prediction: “The cache expires while 20 requests for the same key arrive. Does cache-aside alone guarantee one origin read?” The answer must connect to whether the particular model implements coalescing; it cannot assume a lock that the implementation lacks.

## 6. Sources and originality

Each resource entry records an ID, title, author/organization, direct URL, source type, relevant sections, access/review date, and the claim it supports. Record unavailable or paywalled resources as such. Primary documentation, papers, and original engineering reports support technical claims; use indexes and videos for discovery or optional learning.

Write explanations and diagrams in original language. Link to books/articles instead of copying chapters. A resource collection's license does not automatically license the linked works. Before adapting code/images, record its source and applicable license/attribution. No lesson should require a paid resource to understand its core content.

Distinguish “this paper describes this system” from “all systems behave this way.” Vendor-specific details include a product/version/date when relevant.

## 7. Validation and review

Automate structure, schema, unique IDs, valid prerequisites, local paths/anchors, question references, diagram compilation, and capability registration. External-link checking is a separate scheduled/manual job because transient network failure should not silently rewrite sources.

Human review checks: mechanism correctness, numerical example, diagram semantics, relation to simulator behavior, honest limits, alternative reasoning, readability, and useful interview follow-ups. A valid document schema cannot establish technical correctness.

Before publishing, a reviewer follows the topic from its prerequisite entry point, completes one playground/guided flow, checks one failure, and answers the transfer question. If the simulator is absent, the module must neither advertise it nor fail its declared release gate.

## 8. Author handoff

Report changed files, outcomes covered, sources checked, numeric/trace evidence, validation results, unresolved assumptions, and publication status. A module is complete only when content and declared capabilities agree.
