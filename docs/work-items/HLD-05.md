# Work item: HLD-05 — watch the cache and origin change, one event at a time

## Objective

After a cache-aside run, a learner can step through the Java trace and see what the cache and the origin hold at every event. They can point at the exact moment the cache keeps v1 while the origin moves to v2, the 72 ms hit that serves v1, and the 122 ms lookup that misses because the entry expired. They can do this without reading raw JSON.

## Preconditions

- Roadmap dependencies and their evidence: HLD-02 (tab state, `usePanelActive`) and HLD-04 (`initialState` and per-event key state, [decision 0006](../decisions/0006-cache-event-key-state.md)) merged; HLD-03 browser harness available.
- Relevant documents: [next implementation plan](../NEXT_IMPLEMENTATION_PLAN.md) §4 and the HLD-05 section of the [implementation plan](../IMPLEMENTATION_PLAN.md). Request-flow playback is the in-repo reference for controls.
- Current repository state: `main` at `6733e48` (PR #31); the baseline `./mvnw -B verify` passed with 88 tests before any change.

## Scope

- Added: `cacheState.ts` (pure reconstruction), `CachePlayback.tsx` (diagram, controls, inspector, state table, event trace), unit tests for both, four fixtures captured from the packaged Java backend, `e2e/cache-playback.e2e.ts`.
- Changed: `CacheAsidePlayground.tsx` keeps each result with the exact input that produced it and renders playback; the event trace moved into playback; aggregate metrics now sit under **Final run metrics** (with "(partial)" for limited runs). `types.ts` exports the generated `CacheEntryState` and `OriginValueState`.
- Stable IDs/contracts touched: none. No API, OpenAPI, model, or content version change.
- Explicit exclusions: guided checkpoints, Architecture/Sequence tabs, and lesson changes (HLD-06); a shared playback component with request flow. Request flow has no initial-state position and its own trace types, so the two share only CSS classes and the `usePanelActive` hook.

## Design

**State.** `cacheStateAt(result, position)` starts from `initialState` and applies each event's post-event `cacheEntry`/`originValue` for its key, in `sequence` order, up to the cursor. A missing field means that key has no entry or origin value at that event. Other keys are untouched. The response is never mutated, and narration is never parsed. Position −1 is the initial state; there is one position per event, and equal-time events stay separate.

**Expiry.** Java keeps an expired entry until the next fill replaces it. The contract defines `expiresAtMs` as the first time a lookup misses, so the renderer labels a retained entry *expired* at or after that time and does not delete it. "Behind origin" compares the cached `version` with the origin `version` carried by the same snapshot.

**Diagram.** Cache ← Application → Origin, built with HTML and the existing tokens. The application sits in the middle because in cache-aside it calls both the cache and the origin; the cache never calls the origin. At ≤640 px the application moves on top, with cache and origin side by side below it. The highlighted node comes from the event's `nodeId`; the link label comes from a fixed map keyed by event kind, exhaustive over the generated enum. Unavailable components are red and say "Unavailable". A hidden figcaption, the inspector sentence, and the **Cache and origin state** table give the same information as text.

**Controls.** Play/pause, previous/next, reset, a range slider, and 0.5×/1×/2× speed move only a local cursor; nothing submits a run. Play from the end restarts from the initial state, and playback stops at the last event. Selecting an event in the trace jumps to it. "Show events for" narrows the trace table to one operation, and the diagram and state still include every earlier event from all operations. A hidden tab pauses playback. A new result remounts playback, which clears its timer and cursor.

**Honesty.** Metrics are labeled as final-run totals, not values at the selected event. At the last event of a limited run, the inspector says the trace stopped at a limit and later events were not simulated. A zero-event trace disables every control and says so.

## Acceptance

- [x] Initial position: empty cache, origin `k = v1` version 1, `atMs` 0; later state never leaks backward (unit, browser).
- [x] 2 ms miss has no entry; the 22 ms origin read and fill are separate positions and the entry appears only at the fill (unit, browser).
- [x] 40 ms update: origin v2/version 2 while the cache keeps v1, marked "behind origin" (unit, browser).
- [x] 72 ms hit: cache v1, origin v2; the inspector explains the stale read from structured state, consistent with the outcome `stale: true` (unit, browser).
- [x] 122 ms miss: the retained v1 entry with `expiresAtMs` 122 is shown as expired, not removed (unit, browser).
- [x] 142 ms fill: cache v2/version 2, 142→242; backward and forward seeks give identical states (unit, browser).
- [x] Cold burst: five misses, origin reads at 22–26 ms, no entry before the first fill (unit, browser).
- [x] Multiple keys: an UPDATE to `a` (creating origin version 1) leaves `k` unchanged; keys appear in first-touch order (unit).
- [x] Operation filter narrows the table without dropping other operations' state (unit).
- [x] Limited trace stops at the last emitted event with an explicit note; positions beyond it repeat the last state. Empty trace: all controls disabled (unit).
- [x] Play advances to the last event and stops; speed changes only the interval; no fetch during playback (unit).
- [x] Keyboard: slider arrows and step buttons move the cursor (browser).
- [x] Tab round trip during playback pauses it, keeps the cursor and result, and sends exactly one run (browser).
- [x] No page overflow at 320/768/1440 in light and dark after a run, with reduced motion (existing layout matrix, which now includes the diagram).
- [ ] Manual 200% zoom and screen-reader journey — **pending** (release gate in `RELEASE_REVIEW.md`).

Each visible value maps to a response field: node and table values to `cacheEntry.value/version/filledAtMs/expiresAtMs` and `originValue.value/version`; availability to `initialState`; time, operation, key, and kind to the event; narration to `message`; operation labels to the submitted input kept with the result; totals to `metrics`.

## Verification evidence

| Check actually run | Result | Artifact or reproduction |
| --- | --- | --- |
| `./mvnw -B verify` (baseline, before changes) | pass, 88 tests | No backend change in this item |
| Fixture capture from the packaged jar | 4 traces | `fixtures/*.json`: baseline, cold burst, multiple keys, virtual-time-limited |
| `vitest run src/features/cache-aside` | 41/41 pass | 15 reconstruction + 9 playback + 17 existing playground tests |
| Full `npm test` | 79/79 pass (10 files) | 55 before this item |
| `npm run contracts:check`, `typecheck`, `lint` | pass | Generated types unchanged |
| `prettier --check` on changed files | pass | This WSL checkout uses `core.autocrlf=true`; four untouched files report CRLF only locally, and CI checks LF |
| Full `playwright test` against the packaged jar and production build | 45/45 pass | 41 existing + 4 new playback journeys. The tab-pause test first raced the 2× speed, so it now uses 0.5× |
| Screenshots at 1440 light, 768 dark, 320 dark | reviewed | Fixed letter-by-letter wrapping of event kinds at 320 px and ambiguous "v1 (v1)" labels, which now read "(version 1)" |

## Handoff

The roadmap's P2-02 stays **in-progress**: guided checkpoints, the Architecture/Sequence views, and the manual accessibility review remain. Next: HLD-06A, guided cache checkpoints that reuse this renderer and Java presets.
