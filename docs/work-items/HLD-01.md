# Work item: HLD-01 — one accurate baseline and one ID per module

## Objective

A contributor can tell what is implemented, which documents are current, and which ID names each module, without cross-checking the code. Learners are unaffected: no published URL, topic, or simulation changes.

## Preconditions

- Roadmap dependencies and their evidence: current `main` at `ebbde75` (PR #21), one documentation commit after the plan baseline `6df9ffa` (PR #20). No open PRs.
- Relevant documents and reference module: [implementation plan §6 HLD-01](../IMPLEMENTATION_PLAN.md#6-detailed-first-release-work), [SIMULATION_REVIEW.md](../SIMULATION_REVIEW.md), decisions 0003 and 0004.
- Current repository state and existing user changes: clean working tree. An empty, untracked `frontend/src/features/requestflow/` directory exists locally; it is not in Git and is left alone.

## Scope

- Artifacts to add/change: `FIRST_CONTRIBUTION.md`, `SIMULATION_SPEC.md`, `ARCHITECTURE.md`, `CURRICULUM.md`, `ROADMAP.md`, `IMPLEMENTATION_PLAN.md` (gap annotations and canonical ID list), decision 0005, `scripts/validate-plan.mjs`, `frontend/scripts/validate-content.mjs`, this work item.
- User-visible behavior: none. Published URLs, catalog entries, content versions, and model versions are unchanged.
- Stable IDs/contracts touched: curriculum IDs only. The planned concept `rate-limiting` merges into the published `distributed-rate-limiter`; the planned case `distributed-rate-limiter` becomes `rate-limiter-workshop`.
- Explicit exclusions: no simulator, API, or UI change. The `cache-aside` trace starting at `sequence` 0 while other models start at 1 is documented, not changed (HLD-04 owns the cache contract).

## Design

Drift found by comparing documents with code:

| Document claim | Implementation | Resolution |
| --- | --- | --- |
| `FIRST_CONTRIBUTION.md` has two status lines: "completed" and "ready to start" | P0-01 is done | Marked historical, with links to the current setup and task sources |
| Events use `timeMicros`, `entityId`, `causedBySequence`, `payload`, explanation keys | Events have `sequence`, `timeMs`, `kind`, `requestId`, `nodeId`, `message` | Implemented envelope and proposed target envelope shown separately |
| Results include initial/final state and a `failed` status | No snapshots; statuses are `completed` and `limited`; internal failures are HTTP errors | Stated as implemented vs planned |
| Node health follows a detection delay; recovery restores empty workers | No detection delay or retries; `COMPLETE` preserves occupancy (decision 0004) | Failure semantics rewritten to match v1.1.1 |
| A shared `SimulationModel` interface and registry | Concrete simulator classes per model | Marked proposed |
| Wall-time deadline to be added | Implemented, 10 s, cooperative | Documented as a censoring execution guard excluded from replay promises |
| 1,000 requests / 20 nodes defaults; 413/429/503 responses | 100 requests / 8 nodes (request-flow), 500 requests (rate limiter); no 413/429/503 | Actual limits stated; status codes marked planned |
| Architecture layout lists `features/learn`, `experiment`, `design`, `practice`, `progress`, `fixtures/` | Per-module feature folders, shared `learning/`, fixtures in backend tests | Current layout shown; planned folders listed separately |
| `distributed-rate-limiter` is a planned case depending on planned `rate-limiting` | Published topic covering `rate-limiting`'s material | Decision 0005 |

The ID collision went undetected because no validator compared the catalog with the curriculum. The new checks make that class of drift fail CI.

## Acceptance

- [x] No curriculum ID names both a topic and a case; every catalog ID is a curriculum ID of the same kind.
- [x] Published URLs unchanged: `content/catalog.json` has no diff.
- [x] `FIRST_CONTRIBUTION.md` cannot be mistaken for startup instructions.
- [x] Simulation and architecture docs label implemented behavior separately from proposed architecture, with units in milliseconds.
- [x] No published entry requires an unpublished one; catalog prerequisites appear in each module's curriculum row; the curriculum DAG remains acyclic.
- [x] Planning and content validators pass; the new identity check fails on the previous curriculum.
- [x] No simulator semantics edited.

## Verification evidence

| Check actually run | Result | Artifact or reproduction |
| --- | --- | --- |
| `node scripts/validate-plan.mjs` | pass | 29 docs, 87 local links, 59 curriculum IDs, 4 catalog identities |
| Same check with the previous `CURRICULUM.md` restored | fails as intended | "distributed-rate-limiter is a topic in the catalog but a case-study in the curriculum"; "requires capacity-estimation, which its curriculum row does not list" |
| `node frontend/scripts/validate-content.mjs` | pass | 4 catalog entries, DAG, capabilities |
| Same check with `request-flow` temporarily set to `draft` | fails as intended | "capacity-estimation: published entry requires unpublished request-flow" (catalog restored afterward, no diff) |
| CI-equivalent gate in a fresh LF checkout | see PR | Recorded in the pull request |

Documentation-only change: the Java and React application tests are not affected by this change.

## Handoff

Roadmap: P0-02 evidence updated; the next action points to HLD-02. Remaining gaps recorded in the plan (§2) that HLD-01 does not resolve: gap 1–2 (HLD-02), gap 3–4 (HLD-04), and gap 7 beyond identity checks (source/claim and response-schema validation).

**Next dependency-ready task:** HLD-02 — preserve module state across tabs and correct shell version metadata. It depends only on HLD-01.
