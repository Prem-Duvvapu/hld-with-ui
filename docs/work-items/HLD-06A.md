# Work item: HLD-06A — guided cache checkpoints

## Objective

A learner works through eight short checkpoints that cover cache-aside's important moments. For each one they predict, run the real Java preset, see the trace at the exact event, read why it happens, and choose a tradeoff with feedback. Afterwards they can explain the 72 ms stale hit, the 122 ms expiry miss, and the five origin reads in a cold burst without reading JSON.

## Preconditions

- Roadmap dependencies and their evidence: HLD-05 merged (#32), which provides the playback renderer this reuses.
- Relevant documents: [next implementation plan](../NEXT_IMPLEMENTATION_PLAN.md) §5 and the HLD-06 section of the [implementation plan](../IMPLEMENTATION_PLAN.md); [content spec](../../content/CONTENT_SPEC.md); [learning standard](../LEARNING_STANDARD.md).
- Current repository state: `main` at `3d5b0ce`.

## Scope

- Added: `contracts/checkpoints.schema.json`; `content/topics/cache-aside/checkpoints.json` (8 checkpoints); the Java `GuidedCheckpoint` record and `GuidedCheckpointsTest`; the React `GuidedCheckpoints` component, `checkpoints.ts` resolver, and their tests; `e2e/guided-checkpoints.e2e.ts`; [decision 0007](../decisions/0007-guided-checkpoints.md).
- Changed: `TopicDetail` gains a required `checkpoints` array; the catalog gains the `guided` capability and `checkpointsPath`; the cache-aside catalog entry advertises `guided`; the content validator checks checkpoints; `CachePlayback` takes a starting position, an optional trace table, and a title; the cache page adds a **Guided** tab; real-HTTP topic responses are validated against OpenAPI.
- Stable IDs/contracts touched: catalog capability `guided`; checkpoint IDs `cold-miss-fill`, `warm-hit`, `update-keeps-cache`, `stale-hit`, `expiry-miss`, `cold-burst`, `cache-bypass`, `origin-failure`. No simulation input, trace, or model version change.
- Explicit exclusions (HLD-06B): Architecture and Request Sequence tabs, lesson additions (teammate explanation, two-minute interview scaffold, transfer questions), and auditing primary sources for the tradeoff claims. Durable answers are HLD-08; answers live in memory and survive tab changes but not a reload.

## Design

Each checkpoint names a Java preset and a target `{operation, kind, occurrence}`: the n-th event of that kind for that input operation. Java runs every preset and checks both that the target exists and that the numbers the explanation teaches are the numbers the event carries. The tab runs a preset only when the learner selects **Run and reveal**, keeps one run per preset for all checkpoints that share it, and opens playback at the target event without the long trace table. The prediction stays editable after the reveal. The tradeoff feedback always shows the recommended option and why; a weaker choice gets its own feedback too. A missing target shows an error rather than a nearby event.

Coverage: cold miss and fill, warm hit, write without invalidation, stale hit, expiry boundary, cold burst, cache bypass, and origin failure on a cold cache. Each checkpoint names features the model does not implement (invalidation, warming, refresh-ahead, coalescing, stale-if-error) as alternatives and says the playground cannot demonstrate them. The origin-failure checkpoint states that the run starts cold, so it does not show warm hits surviving an outage.

## Acceptance

- [x] Every checkpoint resolves to a real event in its preset's Java trace, and every preset has a checkpoint (Java).
- [x] The numbers in each explanation match the resolved Java event and result: 22/122 ms fill, 2 ms hit, version 2 vs version 1 at 40 ms, stale v1 at 72 ms, expiry at 122 ms, fifth origin read at 26 ms with five misses, three bypasses and origin reads, and two failed GETs (Java).
- [x] Structural and cross-reference errors fail the content check: an unknown event kind and a bad recommended option were each rejected in a negative run.
- [x] Predict → run → reveal at the target event → explanation → tradeoff feedback works against Java, and checkpoints sharing a preset reuse one run (unit, browser).
- [x] A backend failure shows a recoverable error, and retry succeeds (unit). A missing target is reported, not guessed (unit).
- [x] Guided answers survive a tab round trip (browser). The real-HTTP `TopicDetail` for cache-aside and request flow validates against OpenAPI, and the capability agrees with the delivered checkpoints (browser contract test).
- [x] No page overflow on any cache tab, including Guided, at 320/768/1440 in both themes (existing layout matrix iterates every tab).
- [ ] Manual 200% zoom and screen-reader review — **pending** (release gate).
- [ ] Primary-source audit of tradeoff claims — HLD-06B.

## Verification evidence

| Check actually run | Result | Artifact or reproduction |
| --- | --- | --- |
| `./mvnw -B verify` | pass, 91 tests | 88 before + 3 in `GuidedCheckpointsTest` |
| `npm run contracts:check` | pass | 8 checkpoints validated; generated types staged after an intentional OpenAPI change |
| Content validator negative run | fails as expected | `cache.flush` kind and unknown `recommendedOptionId` reported; file restored |
| `npm run typecheck`, `lint`; `prettier --check` on changed files | pass | |
| `npm test` | 88/88 pass (12 files) | 79 before + 4 resolver + 5 guided-flow tests. `ModuleNavigation`'s cache round trip once hit the 5 s timeout during a parallel run on this machine and passed alone (6/6) and in the full run |
| Full `playwright test` against the packaged jar and production build | 49/49 pass | 45 before + 3 guided journeys + 1 real-HTTP `TopicDetail` check; guided journeys and the cache 320/768/1440 × light/dark layout matrix were rerun (3/3, 6/6) after a final CSS/text fix |
| Screenshots at 1440 light and 320 dark | reviewed | Fixed a hint that pointed at a table the Guided view does not show, and the gap under the tradeoff heading |

## Handoff

The roadmap's P2-02 stays **in progress**. Next: HLD-06B, the Architecture and Request Sequence views and lesson completion for cache-aside.
