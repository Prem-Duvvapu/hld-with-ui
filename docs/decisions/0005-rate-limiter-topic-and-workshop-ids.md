# 0005: One rate-limiting topic and a separate workshop ID

Status: accepted — 2026-09-29

## Context

`content/catalog.json` publishes `distributed-rate-limiter` as a **topic** at `/topics/distributed-rate-limiter`. It teaches fixed-window and token-bucket limits, shared versus per-node counters, distributed overshoot, and fail-open/fail-closed backend policy.

`docs/CURRICULUM.md` used the same ID for a future **case study** that depended on a separate planned concept, `rate-limiting`. That concept described the material the published topic already covers. The result was one ID naming two kinds of module, and two planned lessons for one concept. Nothing checked catalog IDs against the curriculum, so the collision was not detected.

## Decision

- `distributed-rate-limiter` remains the published concept topic. Its URL, catalog entry, simulation ID, and content are unchanged.
- The planned `rate-limiting` concept is merged into `distributed-rate-limiter`. There is one rate-limiting lesson.
- The future integrated design case uses a new ID, `rate-limiter-workshop`. It requires `distributed-rate-limiter`, `scaling-state`, and `replication`.
- Curriculum references to `rate-limiting` (`notification-service`, `web-crawler-search`) now reference `distributed-rate-limiter`.
- The concept's curriculum prerequisites match what the published topic teaches: `capacity-estimation` only. `scaling-state` moves to the workshop, where state placement is designed rather than observed.
- `scripts/validate-plan.mjs` now requires every catalog ID to exist in the curriculum with a matching kind, and every published catalog prerequisite to appear in its curriculum row. The catalog validator requires published entries to depend only on published entries.

## Alternatives

- **Rename the published topic to `rate-limiting`** and keep `distributed-rate-limiter` for the case. Rejected: it breaks a published URL and the simulation ID for no learner benefit.
- **Keep both concepts.** Rejected: two lessons would teach the same algorithms and would drift apart.
- **Leave the collision documented but unresolved.** Rejected: the next case-study contribution would have to choose an ID under pressure, and nothing would stop a duplicate.

## Consequences

The curriculum's published concept carries an R2 release label while already being published; the curriculum notes that it shipped early. That does not mark the rest of the Phase 3 reliability wave complete. The workshop, when built, extends the topic with enforcement placement, identity choice, hot identities, and failure policy design; it must not repeat the topic's lesson.

## Migration

No published data or URLs change. Curriculum IDs change only for unpublished rows: `rate-limiting` is removed, and the case `distributed-rate-limiter` becomes `rate-limiter-workshop`. No stored learner progress exists yet (HLD-08), so no progress migration is needed.

## Verification

- `node scripts/validate-plan.mjs` passes and reports no duplicate IDs or cycles.
- The new catalog-to-curriculum check fails against the previous curriculum, reporting that the published topic `distributed-rate-limiter` is listed as a case.
- `npm run contracts:check` passes, including the published-prerequisite rule.
