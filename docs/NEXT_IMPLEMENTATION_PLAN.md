# Implementation plan from the current baseline

Prepared 2026-10-05 for Opus 5.5 or another coding agent. Baseline: `add46a4` (PR #30). This is a plan, not evidence that the work below has shipped.

**Progress since the baseline (2026-10-05):** HLD-05 cache playback (#32), HLD-06A guided checkpoints (#34), HLD-06B cache architecture/sequence and lesson (#35), and HLD-07A request-flow failure teaching are merged; see their work items in `docs/work-items/`. HLD-07B capacity review and HLD-07C rate-limiter source/learning review are also implemented; see their work items. HLD-08A implements shared Practice answer persistence and recovery; see [its work item](work-items/HLD-08A.md). HLD-08B adds Guided answer persistence and validated import/reset/recovery; see [its work item](work-items/HLD-08B.md). HLD-09A implemented the initial draft URL-shortener Requirements stage with contract/API/route and saved answers; see [its work item](work-items/HLD-09A.md). HLD-09B1 adds Estimates/API and stage navigation with Java-checked examples; see [its work item](work-items/HLD-09B1.md). HLD-09B2 adds Data/Baseline/Flows and typed illustrative walkthroughs; see [its work item](work-items/HLD-09B2.md). HLD-09B3 adds Evolution/Failures with strict eligibility paths and Java-checked transfer exercises; see [its work item](work-items/HLD-09B3.md). HLD-09B4 adds Operations/Defense, completing ten authored draft stages; see [its work item](work-items/HLD-09B4.md). [HLD-09C-B](work-items/HLD-09C-B.md) implements published-case discovery without publishing the draft. **Resume at HLD-09C stage/answer/source publication review; manual gates remain open.** Manual zoom, screen-reader, and newcomer teach-back gates remain open for every module.

## 1. Objective and scope

Deliver an excellent first learning path:

**Request flow → capacity estimation → cache-aside → URL shortener.**

Keep the existing distributed rate limiter working and bring its explanations to the same standard. A learner should be able to predict behavior, run an experiment, explain the evidence simply, and defend a design decision in an SDE-2 interview or team discussion.

The immediate assignment is HLD-05 through HLD-11, one bounded contribution at a time. HLD-12 onward is a later expansion, not part of this assignment. Follow the full [implementation plan](IMPLEMENTATION_PLAN.md) for detailed contracts, fixtures, and prerequisites and the [roadmap](ROADMAP.md) for authoritative status. This document updates the starting point and provides the execution checklist; it does not waive any release gate.

## 2. Establish the starting point

Before editing:

1. Read `AGENTS.md`, `CONTRIBUTING.md`, README, project plan, roadmap, and the relevant architecture, simulation, content, learning, and quality documents identified there.
2. Inspect `git status`, current branch, remote changes, catalog, work items, and nearby code/tests. Preserve unrelated work. Fetch GitHub and reconcile changes after the baseline.
3. Inspect the LLD project's module experience when available. Use it as the product reference while preserving HLD's established visual identity and repository rules.
4. Create a fresh branch from current `main` for the first implementation task. If this documentation handoff is still uncommitted, preserve it on its own branch; do not mix it into a feature PR or discard it.
5. Write the task's acceptance criteria in `docs/work-items/HLD-05.md` using the work-item template. Do the same for subsequent tasks.

### Already implemented: preserve and reuse

| Area | Current evidence / capabilities |
| --- | --- |
| Four published modules | `request-flow`, `capacity-estimation`, `distributed-rate-limiter`, `cache-aside` in the canonical catalog |
| HLD-01 | Identity/document baseline; separate rate-limiter topic and future workshop IDs |
| HLD-02 | Tab/history behavior, state preservation across tabs, hidden playback pause, content/model labels |
| HLD-03 automated checks | Real Java browser journeys, errors/retry, layout/theme/focus checks, launcher cleanup/occupied-port smoke |
| HLD-04 shipped slices | Descriptor limits, initial cache state, per-event operation/key/cache/origin state, byte accounting, HTTP response schema tests, compatibility errors |
| PR #30 verification | 88 Java tests, 55 frontend tests, 41 browser checks, launcher smoke, production build, and CI passed at that revision |

Those counts are historical, not a target or a substitute for rerunning applicable checks. Manual zoom/screen-reader review remains pending. Audit any broader HLD-04 acceptance requirement not yet evidenced—especially serialized-size bounds and concurrent isolation—when closing release gates; do not assume every detailed criterion is complete merely because its implementation slice merged.

## 3. Delivery sequence

| Order | Task | Deliverable | Recommended PR boundary |
| --- | --- | --- | --- |
| 1 | HLD-05 | Cache state diagram, playback, event inspection | One usable playback contribution |
| 2 | HLD-06A | Guided cache checkpoints with predictions and explanations | One guided-learning contribution |
| 3 | HLD-06B | Cache architecture, sequences, design explanations, practice | One teaching/views contribution |
| 4 | HLD-07 | Align existing modules and review release evidence | One PR each for request flow, capacity, rate limiter; skip changes with existing evidence |
| 5 | HLD-08A | Versioned local storage with one real answer consumer | One persistence contribution |
| 6 | HLD-08B | Remaining consumers, safe import/export and reset | One complete data-lifecycle contribution |
| 7 | HLD-09A | Draft workshop contract/API/route plus Requirements stage | One end-to-end draft stage |
| 8 | HLD-09B | Complete URL shortener design journey | Bounded stage groups with coherent flows |
| 9 | HLD-09C | Workshop review and catalog publication | Publish only after all advertised stages pass |
| 10 | HLD-10 | Search, bookmarks, resume, first learning path | Search first, then navigation/progress |
| 11 | HLD-11 | First-release verification and honest release report | Fixes and evidence in focused PRs |

Finish the current task before starting another. If a manual gate is unavailable, record exactly what remains, continue only independent work, and keep the affected release/publication status incomplete.

## 4. HLD-05: cache visual playback — implement first

### Build in this order

1. Inspect `CacheAsidePlayground.tsx`, `CacheAsidePage.tsx`, generated cache types, request-flow playback, `ModuleShell.tsx`, and decision 0006. Reuse only abstractions that actually fit both modules.
2. Implement a pure presentation-state reconstruction function. Start with `initialState`, then apply each event's post-event state for its key in sequence order. Missing `cacheEntry` or `originValue` means that key has no corresponding state at that event. Preserve other keys. Never mutate the returned response.
3. Define the cursor precisely: provide an explicit initial-state position before any event, then one position per event. Reset goes to initial state. Keep equal-time events ordered by `sequence`; do not merge them by timestamp.
4. Build a fixed Client/Application → Cache → Origin diagram using existing tokens and native SVG/HTML. Add a readable table/text equivalent. Show active component, operation number/key, value/version, fill/expiry timestamps, and availability from authoritative data.
5. Add play/pause, previous/next, reset, seek, and playback speed. Speed changes presentation only. At the last event, stop. No control should submit a new simulation request.
6. Synchronize the diagram, selected event, inspector, and event table. Selecting an operation filters/highlights its events; state reconstruction must still apply all preceding events from all operations.
7. Keep aggregate metrics labeled **Final run metrics** while inspecting earlier events. Treat limited-run metrics as partial. Do not invent intermediate metrics or completion events.
8. Preserve tab state, pause hidden playback, clean up timers on unmount/new result, and support reduced motion with fully usable manual stepping. Preserve explicit run/input association and existing pending-run protections.
9. Handle no run, loading, invalid input, backend error, incompatible result, empty trace, and limited trace. Keep controls valid at both ends and for a zero-event trace.

### Acceptance fixtures

| Check | Required result |
| --- | --- |
| Initial position | Empty cache and initial origin `k = v1`, version 1; no later state leaks backward |
| Baseline miss at 2 ms | No cache entry |
| Origin read / fill at 22 ms | Separate events: entry appears only after the fill |
| Origin update at 40 ms | Origin becomes v2 while cached v1 remains |
| Stale hit at 72 ms | Cache v1, origin v2; explanation agrees with the trace |
| Expiry at 122 ms | Lookup misses at the expiry boundary; renderer does not silently delete state the trace retains |
| Fill at 142 ms | Cache contains v2; backward and forward seeks reproduce identical selected states |
| Cold burst | Five misses and five origin reads at 22–26 ms; no entry before first fill |
| Multiple keys | Events for one key do not erase or overwrite another key |
| Limited/empty trace | Honest stopping state, no fabricated completed requests, safe controls |
| Navigation | Tab round trip preserves cursor/result, pauses playback, sends no extra run |

Test reconstruction with real-contract fixtures and browser checks against Java. For each visible number/state, identify its response field. Avoid storing duplicate copies of derivable presentation state.

## 5. HLD-06: make cache easy to understand and explain

1. Reuse Java presets and the playback renderer for guided scenarios; do not implement a second simulator in React.
2. Define checkpoints using stable preset/operation/event criteria, including an occurrence discriminator where necessary. Do not use narration text or unexplained array indexes as identifiers. Validate that every checkpoint resolves in the real trace.
3. Cover cold miss/fill, warm hit, update, stale hit, expiry, cold burst, bypass, and origin failure. For every checkpoint show: **predict → reveal evidence → explain why → choose a tradeoff**. Allow skipping a written prediction and revising it after reveal.
4. Add Architecture and Request Sequence tabs only when their full content works. Distinguish the read/fill path from origin writes; show that this model does not invalidate cache on update.
5. Keep assumptions visible: initially cold cache, availability fixed per run, no request coalescing. Do not claim the origin-outage preset demonstrates warm-cache availability.
6. Add a one-sentence summary, a tiny worked example, a teammate explanation, a two-minute interview scaffold, and transfer questions about hot-key load and freshness.
7. Explain invalidation/coalescing as alternatives unless separately implemented and versioned. Link original explanations to primary sources, verify those sources support the claims, and update content metadata.

**Done when:** the learner can explain the 72 ms stale hit, the 122 ms expiry miss, and why five cold misses cause five origin reads, using the UI without parsing raw JSON. All new views have direct URLs, text equivalents, keyboard access, and browser coverage.

## 6. HLD-07: align the other existing modules

Review one module per contribution. Retain working features; change only demonstrated gaps.

- **Request flow:** reconcile FAIL/COMPLETE behavior across diagrams, lessons, traces, and outcomes; preserve six-request arithmetic; explain queue versus service time and excluded health-check delay/retries.
- **Capacity:** reconcile formulas, units, rounding, and sensitivity with submitted inputs; explain mean concurrency versus peak/tail capacity; verify invalid values and formula details on mobile.
- **Rate limiter:** reconcile algorithm decisions, global/local scope, overshoot, and outage policy; verify RFC/source claims against primary documents; expose the one-identity and zero-network-latency limits; distinguish this concept module from a future full workshop.

**Done when:** each module has a coherent predict → run → explain → transfer journey with verified numbers and source claims. Record automated and manual evidence separately. Do not claim a release gate passed merely because a PR merged.

## 7. HLD-08: save learners' work

1. Define a versioned, bounded local-storage schema using stable module/activity IDs, content versions, timestamps, and answer/progress records. Distinguish visited, attempted, completed, and self-assessed.
2. Introduce a small storage adapter and one real consumer before generalizing. Persist answers and notes first; do not persist large simulation traces by default.
3. Handle denied/quota-limited storage, corrupted data, unsupported versions, renamed/removed activities, and migrations. Fall back to memory with a clear notice and export option; never silently erase answers.
4. Validate import size, schema, versions, and IDs before mutation. Preview conflicts; preserve local nonempty answers by default and let the learner choose conflicting imports explicitly.
5. Add export, safe import, and a scoped confirmed reset. Keep personal notes out of URLs, analytics, and network requests.

**Done when:** reload preserves answers; export/import round trips; invalid imports leave existing data intact; conflicting answers are resolved deliberately; unavailable storage does not break learning; content updates do not falsely renew mastery.

## 8. HLD-09: URL shortener workshop

This is a learning workshop, not a deployed URL-shortening service.

### Slice A — one draft stage end to end

Define a typed, versioned case resource with stable stage IDs, prompts, reference explanations, rubrics, and experiment links. Add Java resource delivery, contract/generated types, validation, and a lazy React route. Complete Requirements: draft → reveal → self-check → revise → save/reload. Keep the workshop out of ordinary published discovery until complete.

### Slice B — complete stages

1. Requirements and non-goals.
2. Traffic/storage estimates with units and links to the real estimator.
3. Create and redirect APIs, validation, errors, expiry semantics.
4. Data model, uniqueness, key choices, indexes, and collision retries.
5. Simple baseline architecture with a textual equivalent.
6. Create flow and redirect flow, with failure branches.
7. Cache/scaling evolution justified by a measured or stated bottleneck.
8. Failure exercises: hot link, cache outage, expired/revoked stale link, ambiguous timed-out create.
9. Operational signals, abuse/security concerns, and migration/rollback tradeoffs.
10. Interview defense with a self-assessment rubric and changed-requirement follow-ups.

Preserve the invariant: an active short code maps to one target and cannot silently change ownership. Link to working experiments using supported routes; if input transfer is not implemented, provide explicit input instructions. Do not pretend a static architecture diagram is executable.

### Slice C — publish

Verify every stage, save/resume, content/contract/capability agreement, deep links, source claims, mobile/theme/keyboard behavior, and import/export. Published-case discovery now comes from Java/the canonical catalog in HLD-09C-B; the topic endpoint intentionally excludes cases. Check discovery alongside the remaining publication gates. Publish only after prerequisite release gates and all advertised stages pass. Record what a learner can now explain and the remaining model/design limitations.

## 9. HLD-10 and HLD-11: discovery and release

### Discovery

Implement bounded search over published Java-delivered content with stable links and useful excerpts. No external search service is needed. Add bookmarks, Continue learning, and the first-release path using saved activity state. Test empty/no-result/error states and removed/updated content. Completion counts come from recorded evidence, not page visits.

### Release

- Run the full gate from a clean checkout, including real browser journeys and the launcher smoke.
- Check all first-release modules plus rate-limiter regressions; verify 320/768/1440 widths, both themes, keyboard/focus, reduced motion, and result/error/limited states.
- Perform actual 200% browser zoom and a real screen-reader journey. If unavailable, document the missing check and leave the release gate open.
- Reconcile numeric fixtures, schema/model versions, payload budgets, Unicode serialization, and simultaneous-request isolation. Record generation/render/bundle measurements in a named environment without calling simulations production benchmarks.
- Verify packaged content, container startup when available, health/proxy/deep links, and process cleanup. A build alone is insufficient runtime evidence.
- Reconcile README, roadmap, catalog, work items, and release report. Capture a newcomer teach-back if available; otherwise leave that learning-validation gate open.
- Do not add cloud resources or manually deploy without user authorization. If hosting automatically publishes branch/main builds, report that and distinguish it from an exercised live application.

**First release is complete only when its required gates have recorded evidence.** Pending manual evidence must stay visible even if the code is otherwise ready.

## 10. Quality rules for every contribution

### UI/UX

Preserve the current visual identity and reuse semantic CSS tokens. Show the question, controls, visual state, explanation, and next action in a clear order. Keep layouts readable and restrained. Use text with status colors, visible focus, accessible labels, local table scrolling, and diagram alternatives. Avoid new tabs that only contain placeholders. Add abstractions only when a second concrete use justifies them.

### Frontend/backend

Java owns simulated outcomes and metrics. React renders typed state and controls presentation. Keep feature components small and state ownership explicit. Avoid duplicated catalogs, handwritten copies of generated API types, narration parsing, arbitrary delays in model logic, unbounded inputs, shared mutable simulation state, and silent compatibility fallbacks. Version semantic changes deliberately; document consequential architecture decisions.

### Verification commands

Run applicable commands from the root; record actual results, failures, and fixes:

```bash
node scripts/validate-plan.mjs
bash -n start.sh scripts/start-smoke-test.sh
(cd backend && ./mvnw -B verify)
(cd frontend && npm run contracts:check && npm run typecheck && npm run lint && npm run format:check && npm test && npm run build)
(cd frontend && npm run e2e)
bash scripts/start-smoke-test.sh
```

For a clean environment, first use `npm ci --prefix frontend` and install the pinned Playwright browser as documented in CONTRIBUTING. Backend verification packages the jar used by browser tests. For intentional OpenAPI changes, regenerate types and inspect/stage the expected generated diff before the drift check. Run tests appropriate to each task; do not rerun the entire suite for a wording-only change.

### Git and handoff

Each distinct task gets a fresh branch from updated `main`, a focused PR, actual local checks, and passing required CI before squash merge. Never bypass a failed check. Update the relevant work item and roadmap in the same contribution. Report: changes, learning outcome, checks/results, limitations, PR/commit, and exact next task. User publishing authorization governs execution; the copyable prompt supplies explicit authorization when used.

## 11. Deferred expansion

After first-release gates pass and the owner requests the next scope, follow HLD-12 onward: storage/replication/partitioning foundations; queues, retries, idempotency and backpressure; then Notification, integrated Rate Limiter, Chat, News Feed, Booking and other design cases in prerequisite order. Do not add shallow cards for these during the first-release assignment.
