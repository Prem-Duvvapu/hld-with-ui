# HLD with UI — implementation plan

Prepared for implementation by Opus 5.5 or another coding agent.

**Baseline:** `6df9ffa` / PR #20, inspected on 2026-09-29. **Status:** proposed implementation work, not completed features. This document adds execution detail to the existing roadmap; it does not replace its release gates.

## 1. Start here

Read [OPUS_START_HERE.md](OPUS_START_HERE.md) for the copy-and-paste agent prompt. Then work through this plan in dependency order, one focused contribution at a time.

The intended sequence is:

1. Make the current four modules consistent, trustworthy, and easy to use.
2. Finish cache-aside as a complete visual learning module.
3. Connect the initial concepts in a URL shortener design workshop.
4. Add durable learning progress, search, and a verified first release.
5. Expand into storage, messaging, reliability, and the most useful backend design cases.

The first release is **request flow → capacity estimation → cache-aside → URL shortener**. The existing rate limiter remains available and maintained alongside this path. Its early implementation does not make the rest of Phase 3 complete.

### Documents and ownership

| Document | Owns |
| --- | --- |
| [AGENTS.md](../AGENTS.md), [CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution rules, Git workflow, current commands |
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | Product purpose and release boundaries |
| [ROADMAP.md](ROADMAP.md) | Official work status and release gates |
| This plan | Implementation order, bounded tasks, acceptance examples, handoff instructions |
| [ARCHITECTURE.md](ARCHITECTURE.md), [SIMULATION_SPEC.md](SIMULATION_SPEC.md) | Runtime boundaries, model behavior, contracts |
| [EXPERIENCE_AND_QUALITY.md](EXPERIENCE_AND_QUALITY.md) | UI and engineering quality |
| [LEARNING_STANDARD.md](LEARNING_STANDARD.md), [content specification](../content/CONTENT_SPEC.md) | Explanations, practice, lesson and case structure |
| [RELEASE_ONE_BLUEPRINT.md](RELEASE_ONE_BLUEPRINT.md) | First-release journeys and numeric fixtures |
| [CURRICULUM.md](CURRICULUM.md) | Planned topic IDs and prerequisites |
| [SIMULATION_REVIEW.md](SIMULATION_REVIEW.md), [RELEASE_REVIEW.md](RELEASE_REVIEW.md) | Evidence already recorded and verification still missing |

When code, contracts, or documents disagree, record the discrepancy and resolve it in the relevant task. Preserve user instructions. Do not silently redefine a completed gate or invent an implemented capability.

## 2. What exists now

This table describes the inspected baseline. Recheck it when implementation starts.

| Area | Implemented | Remaining work |
| --- | --- | --- |
| Foundation | React/TypeScript, Java/Spring Boot, Maven Wrapper, Vite proxy, root launcher, CI | Reproducible browser tests, fresh-checkout evidence, full accessibility review |
| Module shell | Shared tabs, URL view selection, keyboard tab navigation, themes, lazy routes | Preserve feature state across tab switches; distinguish content/model versions; verify navigation history |
| Request flow | Routing policies, finite workers/queues, playback, architecture/sequence views, failure schedules | Complete learning/release review; verify all diagrams and narration match current failure semantics |
| Capacity | Java estimates, three presets, formulas, sensitivity, explanation/practice views | Complete accessibility, responsive, and learning review |
| Rate limiter | Fixed window/token bucket; shared/local counters; overshoot and outage policies | Integrate its curriculum identity, audit claims/sources, complete learning/release review |
| Cache-aside | Java event queue, four presets, TTL/version/outage behavior, bounded traces, Study/Playground/Practice | Structured playback state, guided simulation, architecture, sequence, richer explanation and practice |
| URL shortener | Product and content blueprints | Case-study contract, Java resource delivery, React workshop, original content, persistence integration |
| Progress/search | Planned in architecture and roadmap | Versioned local persistence, import/export, bookmarks, search, resume flow |
| Delivery | Render/Vercel configuration | Container and hosted-route verification; explicit deployment evidence |

Recorded PR #20 evidence: 83 backend tests, 31 frontend tests, CI, and selected cache browser journeys at 320/768/1440 widths in both themes. Those counts are historical evidence, not future acceptance targets. Screen-reader, 200% browser zoom, full release review, and live deployment verification were not completed there.

### Concrete gaps to address first

1. `frontend/src/components/ModuleShell.tsx` displays `topic.contentVersion` beneath a **MODEL** label. Content and simulation versions must be presented separately. *Resolved by HLD-02.*
2. Module pages conditionally render their selected feature. Feature-local form/run/practice state can be lost when switching tabs. Preserve it deliberately and test a complete tab round trip. *Resolved by HLD-02.*
3. `SimulationEvent` contains sequence, time, kind, request/node IDs, and a message. Cache events do not expose the structured cache/origin state required for reliable visual playback. Never extract state from English messages.
4. Cache descriptors lack explicit input-limit metadata, while controls currently repeat numeric bounds. Move these bounds into the contract before adding more controls. *Resolved by HLD-04 slice A: [work item](work-items/HLD-04.md).*
5. The curriculum lists `distributed-rate-limiter` as a future case while the catalog already publishes that ID as a topic. Resolve the identity before introducing a second case with that ID. *Resolved by HLD-01: [decision 0005](decisions/0005-rate-limiter-topic-and-workshop-ids.md).*
6. `FIRST_CONTRIBUTION.md` contains contradictory historical startup instructions and points at an already completed next task. Make its historical status unambiguous. *Resolved by HLD-01.*
7. The shared validation currently proves useful structural properties; it does not prove every source supports its claim, every result conforms to its schema, or every route supports its advertised capability.

These observations define follow-up tasks. This planning change does not implement their fixes.

## 3. The experience every module should provide

### The learner's six steps

| Step | Learner action | What the product must supply |
| --- | --- | --- |
| Understand | Read a short explanation | One idea, familiar language, explicit assumptions |
| Predict | Say what should happen | A concrete question before revealing the result |
| Experiment | Change a workload or failure | Bounded controls and actual Java execution |
| Observe | Follow the affected requests/components | Trace, current state, units, outcome, and explanation |
| Explain | Describe the cause and tradeoff | Teammate prompt, two-minute interview scaffold, self-check rubric |
| Apply | Handle a changed scenario | Incident or design decision with a credible alternative |

For example: “Five reads arrive before the first cache fill. Will the origin see one read or five?” After execution, the learner must point to five misses and five origin reads and explain why request coalescing would change the outcome.

### Module surfaces

Use the existing `ModuleShell`; keep existing routes and valid tab URLs working.

- **Playground:** inputs, a visible prediction prompt, run action, state/trace/results.
- **Guided simulation:** curated checkpoints over the same Java model and trace.
- **Architecture:** responsibilities, ownership, synchronous/asynchronous edges, storage, and limits.
- **Request sequence:** one complete read/write/failure flow with a textual equivalent.
- **Study / design details:** explanation, alternatives, production decisions, model exclusions.
- **Practice:** recall, diagnosis, transfer, and interview reasoning.

Introduce each tab only when it contains a complete usable view. Keep Study as a supported route; do not add a second Design Details tab that repeats it. Estimators and workshops use appropriate surface names instead of pretending to be event simulators.

### UI rules

1. Preserve the current visual identity, theme tokens, typography, and calm layout. The owner's preferred reference is LLD-with-UI's integrated module experience.
2. Keep one obvious primary action. Put optional advanced controls behind a clear disclosure.
3. Explain units, bounds, and assumptions beside controls. Show field errors next to the affected control and in an accessible summary when useful.
4. On desktop, place controls beside the active visual/result. On mobile, order controls → visual → explanation → metrics → trace. Keep tables/canvases independently scrollable.
5. A selected event links the diagram, inspector, narration, and request identity. Selection must work with a keyboard.
6. Use text/icons as well as color. Reduced motion retains every piece of information and every manual step control.
7. Preserve submitted inputs with their result. If inputs change, label the old run clearly or clear it; choose and document one consistent policy. Never silently relabel an old result as a new run.
8. Show loading, invalid input, server failure, empty, completed, limited, and unsupported-version states. A limited run cannot look like a completed experiment.
9. Announce completion and errors once. Do not stream every automatic frame into a screen reader.
10. Keep infrastructure, model-class names, and internal implementation notes out of the normal learner flow. A compact Model assumptions section is appropriate.

## 4. Engineering boundaries

### Java

- Preserve the documented Java 17 runtime baseline and Java 21 CI coverage unless a separately justified migration is approved. Keep dependencies pinned; avoid unrelated framework upgrades in a feature PR.
- Own all outcomes, state transitions, versions, budgets, and authoritative metrics.
- Keep execution state per run. Separate HTTP parsing, domain execution, and result serialization.
- Use integer virtual timestamps and a documented tie order. Keep scheduler insertion order deterministic.
- Keep workload and failure random streams reproducible. Inject no wall-clock time into modeled behavior.
- Treat the existing cooperative real-time deadline as an external execution guard. A deadline-limited result is censored; do not promise identical truncation boundaries across machine speeds. Document this distinction when reconciling the simulation rules.
- Validate at HTTP and domain boundaries where direct model invocation is supported. Cover overflow, nulls, unknown fields/types, array bounds, strings, versions, and impossible schedules.
- Account for the actual expanded event payload when adding snapshots. The current message-event byte estimate is not sufficient evidence for a larger result contract.
- Check invariant/failure behavior with small calculable fixtures. Keep rejected, failed, bypassed, completed, and incomplete populations distinct.

### React

- Render Java-provided state. Formatting time or projecting a typed event onto a view is allowed; simulating cache expiry, token spending, routing, or retries in React is not.
- Keep draft form state, submitted input, result, playback cursor, and learning answers distinct.
- Use generated API types. Add runtime checks at boundaries for incompatible versions and unknown event kinds; compile-time types do not validate network data.
- Reuse a component only after identifying a concrete second use. A small shared playback hook is justified when cache and request flow both need it; a universal diagram engine is not yet justified.
- Keep model-specific renderers separate. Avoid growing one component with switches for every future topic.
- Cancel or ignore stale responses, stop timers on unmount, and preserve state without leaving hidden automatic playback running.
- Use scoped CSS and semantic tokens; avoid a global styling change unless a reproduced shared defect requires it.

### Content and identity

- `content/catalog.json` remains the publication source. A renderer registry may map IDs to code; it must not duplicate editorial titles, ordering, prerequisites, or publication status.
- Keep existing published URLs stable. Any ID/schema/model change needs an explicit migration or rejection rule and tests.
- Preserve exact replay for supported model versions. Do not change semantics under an unchanged model version.
- Use the resource collection as a discovery index. Verify actual claims against primary sources during implementation; do not copy diagrams or articles without license/attribution review.
- Do not advertise rankings as measured interview frequency. The preparation order below is a curriculum decision.

## 5. Delivery sequence and dependencies

The `HLD-*` IDs below are implementation-plan tasks, not new topic IDs. Their status starts as **planned**. Record actual progress in a work item and the corresponding official roadmap row.

| Order | Task | Depends on | Roadmap mapping | Suggested contribution size |
| --- | --- | --- | --- | --- |
| 1 | HLD-01: reconcile baseline, IDs, and documents | Current main | P0-02, P1/P2 evidence | One documentation/identity PR |
| 2 | HLD-02: preserve module state and correct shell metadata | HLD-01 | P0-03 | One or two focused PRs |
| 3 | HLD-03: repeatable browser and startup verification | HLD-02 | P0-04, P1-05 | Browser harness, then findings |
| 4 | HLD-04: structured cache state and contract bounds | HLD-01, HLD-03 automated harness | P1-01, P2-02 | Contract/domain PR |
| 5 | HLD-05: cache playback and inspection | HLD-02, HLD-04 | P2-02 | Playback vertical slice |
| 6 | HLD-06: complete cache teaching views | HLD-05 | P2-02 | Guided flow, then diagrams/content |
| 7 | HLD-07: align existing module learning and contracts | HLD-03 | P1-04, P1-05, P2-01, P3-04 | One module per PR |
| 8 | HLD-08: local learning-state storage | HLD-02 | P2-04 | Storage adapter plus one real consumer |
| 9 | HLD-09: URL shortener workshop | HLD-06, HLD-07, HLD-08; initial concept release gates | P2-03 | Three slices listed below |
| 10 | HLD-10: search, bookmarks, and resume | HLD-08, HLD-09 | P2-04 | Search, then navigation/progress |
| 11 | HLD-11: first-release verification and packaging | HLD-01 through HLD-10 | P2-05 | Hardening PRs plus release evidence |
| 12 | HLD-12: storage and distribution foundations | HLD-11 | P3-01, P3-02 | One module per contribution |
| 13 | HLD-13: asynchronous work and reliability | HLD-11 plus prerequisite closure | P3-03, P3-04 | One module per contribution |
| 14 | HLD-14: integrated SDE-2 design cases | Full concept prerequisites, including HLD-15 for advanced cases | P3-05, P3-06 and later gates | One workshop at a time |
| 15 | HLD-15: advanced topics and maintenance | Corresponding curriculum prerequisites | P4/P5 | Separately scoped work |

A missing manual accessibility tool does not justify pretending a gate passed. Record the blocked check and continue independent preparation work; do not label the affected release complete. Follow the official roadmap prerequisites when publishing dependent modules.

## 6. Detailed first-release work

### HLD-01 — Establish one accurate baseline

**Outcome:** the next agent knows what exists and which IDs/documents are authoritative.

1. Inspect clean/dirty state, branch, recent commits, and current catalog. Preserve unrelated work.
2. Read this plan and the documents in section 1. Verify the baseline against actual code rather than old test totals.
3. Make `FIRST_CONTRIBUTION.md` historical and point to the current roadmap/plan.
4. Reconcile simulation documentation with implemented units, version support, failure semantics, and deadline guards. Current traces use milliseconds; a proposed microsecond envelope is not an implemented contract.
5. Resolve the rate-limiter topic/case collision in a short decision record. Recommended default: retain published `distributed-rate-limiter` as the topic; use a distinct proposed `rate-limiter-workshop` for the future integrated case. Consolidate or clearly distinguish the planned `rate-limiting` material rather than publishing duplicate lessons. Update affected curriculum references together and validate the DAG.
6. Keep unpublished prerequisite concepts out of the published catalog's required-reference graph until they exist. Do not introduce prerequisite cycles while consolidating IDs.
7. Create `docs/work-items/HLD-01.md` using the existing template. Record the next task.

**Acceptance:** no duplicate topic/case ID; published URLs unchanged; historical briefs cannot be mistaken for startup instructions; docs distinguish implemented behavior from proposed architecture. Planning/content validators pass. Do not edit simulator semantics in this task.

### HLD-02 — Make navigation preserve the learner's work

**Primary files:** `ModuleShell.tsx`, module pages, affected feature state and tests.

1. Write a regression journey: change a cache input, run, move to Study, return to Playground; also draft a practice answer and return to it.
2. Move feature state to the module/page owner or a small feature reducer. Keep current state during a tab round trip; do not introduce a global state library for this alone.
3. Keep ephemeral preservation distinct from durable storage, which comes in HLD-08. Document refresh behavior until persistence exists.
4. Replace the incorrect MODEL/content-version label. Display content version accurately; display actual model version from the descriptor/result where it matters.
5. Verify deliberate URL behavior. Explicit tab activation should support the chosen Back/Forward behavior; preserve deep links and normalize unsupported views visibly or consistently to a valid default.
6. Preserve keyboard manual activation: arrows move focus, Enter/Space select. Ensure panel/label relationships and document titles remain correct.
7. Stop hidden playback and prevent stale HTTP responses from overwriting newer runs.

**Acceptance:** input/run/cursor/answer state survives tab changes; no duplicate backend run is triggered by navigation; Back/Forward and direct URLs behave as documented; labels identify real versions; changing modules does not leak another module's state.

### HLD-03 — Create repeatable browser evidence

**Outcome:** future PRs can verify behavior in a browser without rebuilding an ad hoc local test process.

1. Add a small Playwright setup, using the existing stack choice in the architecture document. Pin any added development dependency and browser-install instructions.
2. Start the built Java application and frontend on isolated ports. Wait on readiness with bounded timeouts; clean up only owned processes.
3. Keep real API happy paths: open each published module, run a baseline, check one Java-derived value, change a meaningful input, and check the result changes.
4. Add focused mocked-network cases for loading/error/unsupported-version behavior. Label mocked tests; they do not replace real integration tests.
5. Cover tab-state preservation, unknown routes, browser history, cache limited runs, and cold bursts.
6. Check 320/768/1440 viewport widths, both themes, reduced motion, and focus. Compare document scroll width with client width; allow local table/canvas scrolling.
7. Add a fresh-checkout launcher smoke: install locked dependencies, launch, hit health through the proxy, open a real route, interrupt, and verify process cleanup. Exercise occupied ports.
8. Add the bounded browser suite to CI. Record actual commands in CONTRIBUTING and the evidence report only after they work.
9. Perform or explicitly leave pending the manual 200% zoom and screen-reader journeys. Capture both result and error states, not only an empty initial screen.

**Acceptance:** browser checks run from a documented clean environment and fail for a broken API, missing route, state-loss regression, or page overflow. Screenshots supplement assertions. No fixed sleep is used as a substitute for readiness.

### HLD-04 — Give cache playback authoritative state

**Primary files:** `backend/.../cache/`, cache controller, OpenAPI, generated types, model/API tests.

1. Write the state needed by the visual before implementing it: cache entries, value/version, fill/expiry timestamps, origin values/versions, availability, and request/operation identity.
2. Introduce a typed cache event payload or bounded snapshot. Include structured operation ID/key and a clear initial state; make event state sufficient to reconstruct the selected instant. Do not parse `message` or infer origin values from later outcomes.
3. Choose snapshots for the small bounded model unless measured payload size proves a need for deltas. If deltas are used, require an initial state and explicit typed changes with replay tests.
4. Record schema/version compatibility in a decision. A breaking envelope change must be rejected or migrated explicitly; a behavioral change requires a model-version change. Do not relabel old serialized results as the new version.
5. Extend descriptor metadata with exact input/run limits and display assumptions. Make frontend validation consume these values.
6. Extend trace-byte accounting to the new structured payload, including Unicode/escaping, arrays, snapshots, and envelope overhead. Define whether each budget covers events or the entire response; test the declared boundary with real serialization.
7. Validate HTTP results against the published schema, including null/omitted fields and limited outcomes. Regenerate frontend types rather than editing them manually.
8. Preserve all existing causal behavior and the regression fixtures in section 8.

**Acceptance:** selected state at every event is derivable from typed Java output alone; repeated runs match; backward/forward reconstruction matches; simultaneous HTTP runs are isolated; count/byte/time limits remain truthful after payload growth. Existing baseline and cold-burst numeric outcomes remain unchanged unless an explicitly versioned decision says otherwise.

### HLD-05 — Build the cache visual and playback

**Primary files:** `frontend/src/features/cache-aside/`, `CacheAsidePage.tsx`, reusable playback code only where justified.

1. Present Client/Application → Cache → Origin as a fixed SVG diagram with a readable text equivalent.
2. Render the selected event's cache/origin state, active operation, key/value/version, and expiry timestamp from the new contract.
3. Add play/pause, next/previous, reset, speed, and seek. Playback consumes the returned trace locally; it never reruns Java or changes the model speed.
4. Keep event log, inspector, diagram, and narration synchronized. Let the learner select an operation and follow its events.
5. Explicitly label final-run metrics if shown alongside an earlier playback instant. Per-instant metrics must come from authoritative state, not be confused with final totals.
6. Preserve form/result state across tabs, pause hidden playback, and handle reduced motion without loss of function.
7. Make empty/error/limited/unsupported-version states visible. Do not interpolate missing terminal events into a complete run.

**Acceptance:** step from the first miss to its fill at 22 ms; seek backward and forward with identical state; the cold burst never shows a cache entry before its fill; a keyboard user can inspect each event; an outdated response cannot replace a newer selected preset/run.

### HLD-06 — Finish cache teaching, architecture, and practice

Split into two PRs if needed: guided checkpoints, then diagrams/content integration.

1. Add guided checkpoints for cold miss/fill, warm hit, origin update, stale hit, expiry, concurrent misses, and cache bypass.
2. Use the same model/preset definitions as the playground. Checkpoints reference semantic events/operations, not fragile array indexes.
3. For each checkpoint: ask for a prediction, allow a short answer, reveal the actual evidence, and explain cause → consequence → tradeoff.
4. Add Architecture and Request Sequence views. Clearly distinguish cache-aside reads from origin writes; show that the modeled write does not invalidate the cache.
5. State that availability is constant per run and each run starts cold. Do not claim the origin-outage preset demonstrates serving prewarmed hits.
6. Add two transfer exercises: a hot-key cold burst and a freshness requirement that a long TTL cannot satisfy under the modeled policy.
7. Add a teammate explanation and a two-minute interview answer scaffold. Include a plausible wrong explanation and show why the trace disproves it.
8. Audit referenced sources and advance content metadata when lesson meaning changes. Verify every linked event, operation, and preset exists.

**Acceptance:** the learner can explain why the read at 70 ms returns the older version, why the read at 120 ms misses, why five concurrent misses reach origin five times, and when invalidation or coalescing could be preferable. Complete browser/accessibility evidence before marking P2-02 done.

### HLD-07 — Bring existing modules to the same learning standard

Complete one module at a time; retain working behavior and the current visual style.

**Request flow**

1. Verify architecture, sequence text, presets, and the lesson reflect current FAIL/COMPLETE rules.
2. Explain that health-check detection delay and retries are excluded. Resolve any roadmap wording that implies they already run; adding detection delay would be a separate versioned feature.
3. Preserve six-request arithmetic and failure regression cases. Use queue time versus service time as the main diagnostic lesson.
4. Verify keyboard playback, incomplete runs, terminal-outcome reconciliation, and changed-input labeling.

**Capacity estimation**

1. Check formulas, units, rounding, empty/invalid inputs, and assumptions across calculator, diagrams, and lesson.
2. Explain average versus peak and mean concurrency versus burst/tail requirements.
3. Keep sensitivity anchored to submitted inputs and identify every excluded source of storage/network cost.
4. Complete the mobile/theme/keyboard/zoom review of results and formula details.

**Rate limiter**

1. Preserve existing fixed-window/token-bucket, shared/local-state, overshoot, and fail-open/closed behavior.
2. Verify sources support their actual claims, especially protocol/RFC numbers and HTTP header terminology. Structural source-ID validation is insufficient.
3. Make the one-identity, zero-network-latency, round-robin assumptions visible; do not claim the simulator models production Redis consistency or arbitrary multi-tenant fairness.
4. Add or improve teach-back questions about atomicity, hot identities, global versus per-node limits, and failure policy. Treat broader distributed design as the later workshop.

**Acceptance:** for each module, a new learner can complete predict → run → explain → transfer. Record source review, numeric reconciliation, and actual browser evidence. Keep an unperformed manual check explicitly pending.

### HLD-08 — Add durable learning state

**Outcome:** notes and completed activities survive reload without accounts or a backend database.

1. Define a versioned local-storage envelope keyed by stable topic/activity IDs, with content version, updated timestamp, answers, bookmarks, and activity evidence.
2. Separate viewed, attempted, completed, and self-assessed states. Opening a page must not mark a concept mastered.
3. Start with one real consumer: cache guided answers or existing Practice answers. Then connect the remaining views.
4. Use a small storage adapter with a schema validator and migration functions. Keep browser storage calls out of individual presentation components.
5. Handle corrupt data, denied storage, quota exhaustion, unsupported versions, and removed/renamed IDs. Fall back to memory with a clear export option; do not silently delete answers.
6. Export a bounded JSON document. Import must validate size/shape/version and show a conflict preview before mutation.
7. Recommended conflict default: preserve local nonempty answers and merge compatible completion evidence. Let the learner explicitly choose the imported answer where texts conflict.
8. Provide local reset with clear scope and confirmation. Do not transmit notes to analytics, query strings, or external services.

**Acceptance:** answers survive tab navigation and refresh; export/import round trips; corrupt/oversized/unsupported files do not overwrite existing data; denied storage keeps the app usable; content-version changes do not silently claim renewed mastery.

### HLD-09 — Build the URL shortener design workshop

This is an educational design workshop, not a public URL-shortening service. Use the exact first-release blueprint and bounded introductory explanations instead of waiting for the entire advanced curriculum.

**Slice A: contract and first usable stage**

1. Define a typed case-study resource: stable stage IDs, prompts, reference explanations, rubric criteria, links to related experiments, and versioned content.
2. Extend catalog/capability validation and Java resource delivery for a case study. Package resources into the jar; do not read GitHub at runtime.
3. Add a lazy workshop route using the shared shell and storage adapter.
4. Implement the Requirements stage end to end: prompt → user draft → reveal reference → self-check → saved revision. Keep the case draft/unpublished until the full required path exists.

**Slice B: complete the design journey**

5. Add stages in order: requirements → estimates → APIs → data/keys/indexes → baseline architecture → create/redirect flows → cache/scaling evolution → failures → operations/security → interview defense.
6. Include two complete flows: create a unique active code, and resolve a code with expiry checks. Discuss collision retries and database uniqueness without implementing a production ID service.
7. State the invariant: an active short code resolves to one target URL and cannot silently change ownership.
8. Add three failure exercises: hot-link origin overload, cache outage, and an expired/revoked link served from stale cache. Add a timed-out create follow-up with a clearly bounded idempotency discussion.
9. Link to real request-flow, capacity, and cache experiments. Use only supported scenario-import links; if preset transfer is not implemented, link to the module and give explicit input instructions.
10. Include a simpler baseline, one justified scaling evolution, a credible alternative, operational signals, and a migration/rollback discussion.

**Slice C: publish after evidence**

11. Add a self-assessment rubric for requirements, estimates, API/data design, failure correctness, operations, and communication. Do not present an automated hiring score.
12. Verify original explanations, sources, source licenses, numeric examples, all stage links, persistence, browser history, mobile/keyboard behavior, and export/import.
13. Publish the catalog entry and capabilities only when all advertised stages and views work. Update P2-03 with evidence.

**Acceptance:** a learner can complete and resume a design, explain create and redirect paths without reading a script, connect one choice to an actual experiment, and defend a freshness/availability tradeoff. No shortening endpoint or URL-fetching infrastructure is needed.

### HLD-10 — Make the learning path easy to find and resume

1. Add bounded search over published content delivered by Java. Use an in-memory index or scan appropriate to the catalog size; no external search service is needed.
2. Search title, summary, and useful terminology/body text. Return stable topic/stage links and readable excerpts. Exclude unpublished capabilities from ordinary results.
3. Add bookmarks and a Continue learning card using HLD-08. Resume the actual stage/view where possible; handle content updates and removed activities gracefully.
4. Add a first-release path view: request flow → capacity → cache → URL shortener. Show prerequisites and optional deeper material without flooding the home page with planned cards.
5. Make counts derive from the catalog and recorded activity evidence. Treat reading completion and demonstrated practice separately.
6. Check empty query, no results, backend failure, unavailable storage, direct links, and mobile keyboard operation.

**Acceptance:** a learner can find a published concept, bookmark it, resume a saved workshop, and export their progress. Search results never lead to a falsely advertised unfinished experiment.

### HLD-11 — Close the first release

1. Run the complete existing quality gate plus the newly documented browser suite from a clean checkout.
2. Complete primary flows for all four first-release modules and smoke the existing rate limiter.
3. Review both themes, 320/768/1440 widths, reduced motion, keyboard-only use, and 200% browser zoom. Perform at least one real screen-reader walkthrough of a released simulation and the workshop navigation.
4. Verify content/contract/model/renderer agreement and the fixture table below.
5. Build/run the backend container when Docker is available. Confirm packaged content and health, frontend API routing, and refreshed deep links. Record unavailable infrastructure as unverified rather than bypassing the check.
6. Measure trace sizes and generation/render costs for tiny and maximum bounded inputs on a documented environment. Record bundle sizes. Set budgets from evidence and the intended learner flow.
7. Confirm each new structured payload and concurrent request path remains bounded. Verify cleanup and startup failures do not leave unrelated processes affected.
8. Reconcile README, roadmap, catalog metadata, release evidence, and remaining limitations. Verify no planned tab is advertised as working.
9. Deploy only within the owner's authorization and verify the actual deployed API/frontend model-version combination. A successful hosting build is not proof that a simulation request works.
10. Ask a newcomer to predict, run, and explain one cache scenario and one URL-shortener decision. Record confusing steps and fix them before claiming the learning release complete.

**Acceptance:** all applicable release gates have evidence. Any remaining gate is named with its reason and keeps the affected roadmap status incomplete. Then begin core expansion.

## 7. Expansion after the first release

The long-term curriculum remains in CURRICULUM.md. Implement one concept or workshop fully before starting the next. The ordering below emphasizes useful SDE-2/backend reasoning; it is not a measured ranking of interview frequency.

### HLD-12 — Storage and distribution foundations

| Order | Module | First bounded experience | Minimum correctness evidence |
| --- | --- | --- | --- |
| 1 | `requirements-slos` | Convert a sample product requirement into operation-specific objectives | Explicit denominator/window; no invented measured availability |
| 2 | `data-access-models` | Map one query/write set to keys and indexes | Access patterns and invariant explain the choice; alternatives have concrete costs |
| 3 | `indexes-storage` | Compare a bounded point/range workload with and without an index | State the simplified cost model; do not label it a database benchmark |
| 4 | `scaling-state` | Compare local and external session state during node loss | Ownership and loss behavior match the trace |
| 5 | `replication` | Write, read before/after replica apply, then lose the leader | A replica cannot return an unseen version; acknowledged/unacknowledged loss is explicit |
| 6 | `partitioning` | Compare balanced keys with a hot-key workload | Every key maps consistently; skew and cross-partition work are visible |
| 7 | `consistent-hashing` | Add/remove one node over a fixed seeded key set | Moved-key fraction calculated by Java; placement and key population reconcile |
| 8 | `transactions-isolation` | Interleave two reservation attempts for one inventory item | Show the unsafe result and the chosen isolation/conditional-write invariant |

For each module: define a tiny fixture → write contract/model tests → implement Java → add one visual experiment → write original explanation/practice → verify and publish. Do not implement these as a single bulk content PR.

### HLD-13 — Messaging and reliability

Respect the existing prerequisite graph. Implement missing `network-edge` and `api-communication` before dependent realtime cases.

| Module | First scenario | Required evidence |
| --- | --- | --- |
| `queues-tail-latency` | Arrivals exceed finite worker capacity | Queue, rejection, throughput, latency population, and observation window reconcile |
| `queues-delivery` | Consumer effect succeeds but acknowledgment is lost | Redelivery is visible; delivery attempts and durable effects are separate |
| `timeouts-retries` | Slow dependency with bounded retries | Attempt count, total deadline, backoff/jitter, and amplification are explicit |
| `idempotency` | Retry after lost response | One protected effect within the modeled atomic boundary; key conflict and retention expiry covered |
| `circuit-breakers` | Failure then recovery | Open/half-open/closed behavior and bounded probes; no impossible success during outage |
| `streams-pubsub` | Partition replay and consumer reassignment | Ordering scope, offsets, ownership, and lag are visible; no promise of global ordering |
| `cache-failures` | Compare basic cold burst with coalescing | Same arrivals, materially different origin load, explicit waiting/failure behavior |
| `cache-policies` / `cdn-delivery` | Invalidation/eviction or cache-key/edge tradeoff | One concrete policy difference per contribution, with modeled scope stated |

Deliver operational `observability`, `architecture-boundaries`, and `security-tenancy` content alongside the cases that need those decisions, after their prerequisites. Use actual modeled evidence to teach diagnosis; avoid a glossary-only release.

### HLD-14 — Ten priority design questions

These are the recommended case targets for this project. A concept simulator and a full system-design workshop are different deliverables.

| Order | Design question | Core design decisions | Completion exercise |
| --- | --- | --- | --- |
| 1 | URL shortener | Codes, uniqueness, redirect path, cache, expiry, abuse | Defend a hot-link and expired-link design using the first-release experiments |
| 2 | Distributed rate limiter | Enforcement point, identity, atomicity, state placement, failure policy | Extend the existing topic into the separately identified workshop; explain tolerated overshoot |
| 3 | Notification service | Fan-out, preferences, provider isolation, retries, dedupe, DLQ | Provider timeout must not be hand-waved into exactly-once external delivery |
| 4 | Chat/messaging | Connections, ordering scope, offline delivery, receipts, sync | Explain reconnect and duplicate delivery for one conversation |
| 5 | News feed | Push/pull fan-out, celebrity skew, pagination, freshness, privacy | Compare a normal author with a high-fanout author and a visibility change |
| 6 | Distributed cache / key-value store | Placement, hot keys, replication, consistency, membership change | Trace a read/write and node loss with the chosen consistency boundary |
| 7 | Ticket booking | Inventory truth, contention, holds, expiry, payment effects | Prevent oversell while handling an expired hold and a late callback |
| 8 | Payment/ledger | Idempotency, ledger invariant, external outcomes, reconciliation | Lost response and duplicate callback preserve the modeled accounting invariant |
| 9 | Job scheduler | Due work, ownership, retries, cancellation, worker loss | Recover a lost worker without claiming a scheduler alone guarantees one external effect |
| 10 | File storage | Metadata/bytes separation, multipart completion, permissions, cleanup | Recover incomplete upload and orphaned bytes without publishing an incomplete object |

The case table is a preparation priority, not permission to implement an advanced case before its supporting concepts. Advanced HLD-15 concepts may therefore precede a dependent HLD-14 case.

Use existing canonical IDs where defined: `rate-limiter-workshop`, `notification-service`, `chat-service`, `news-feed`, `distributed-kv-store`, `ticket-booking`, `payment-ledger`, `job-scheduler`, and `file-storage`. The cache/KV case requires its advanced quorum/consensus prerequisites; ordering in this table never waives those gates. Video delivery, location matching, autocomplete/search, and collaborative editing follow as specialization.

Every case requires: requirements/non-goals, estimates with units, API/data model, baseline architecture, read/write flows, invariant, overload, dependency failure, operational signals, alternative, migration, source review, and an interview rubric. Reuse the URL-shortener workshop machinery only after that concrete experience proves useful.

### HLD-15 — Advanced correctness, practice, and maintenance

1. Implement consistency histories, partitions, quorums, clocks, consensus, and leases in prerequisite order. Review each protocol against primary sources and explicit invariants.
2. Add outbox/CDC and sagas with crash-boundary and compensation/reconciliation cases before claiming transaction-like guarantees across services.
3. Add regional recovery, backups/restores, and mixed-version migration exercises. Keep RPO/RTO and durability claims tied to modeled assumptions.
4. Add configurable timed interview practice after multiple complete cases exist: clarify → estimate → baseline → deep dive → failure review → recap. Use self-assessment, not automatic hiring predictions.
5. Add an optional design editor only when a real learning task needs it. Saved graph editing must not imply arbitrary graphs are executable simulations.
6. Keep Redis/Kafka/database labs optional and separately runnable. Label measured lab results distinctly from simulator output.
7. Maintain source review dates, content/model migrations, regression fixtures, learner feedback, and a short incident record for recurring mistakes.

## 8. Numeric and semantic acceptance fixtures

Retain these as regression anchors. Add focused fixtures for new semantics; do not replace a meaningful assertion with a check that the trace is nonempty.

| Scenario | Expected result |
| --- | --- |
| Request-flow baseline: six arrivals at 0, two nodes, one worker each, 100 ms service, sufficient queues | Completion latencies 100, 100, 200, 200, 300, 300 ms; mean 200; nearest-rank p95 300; six completions over 300 ms = 20 requests/s |
| One request-flow node, three arrivals at 0, service 100, FAIL at 50 | All three fail at 50; only the first starts; queued work has no start event |
| One node, arrivals 0 and 30, service 100, COMPLETE outage 10–20 | Completion times 100 and 200; second request waits 70; recovery creates no extra worker |
| Cache baseline: lookup 2, origin 20, TTL 100; GET 0/30/70/120; UPDATE v2 at 40 | Miss at 2/fill 22; hit 32; stale hit 72; expiry miss 122/fill 142; two hits, two misses, two origin reads, one stale read |
| Cache cold burst: same-key GETs at 0/1/2/3/4 with those latencies | Five misses; five origin reads at 22/23/24/25/26; zero early hits |
| Cache unavailable: three successful GETs | Three bypasses, zero hits/misses, three origin reads; hit ratio has no eligible lookup population |
| Missing cache key followed by UPDATE creating it | First read returns not found without caching null; later read returns the created value without an exception |
| Cache lookup exactly at expiry | Miss; expiry comparison uses greater-than-or-equal |
| Cache trace/event/virtual budget stops mid-run | Limited status, accurate reason/time, incomplete GET count, no fabricated terminal outcome |
| Same supported model version, seed, normalized inputs | Same semantic events/state/outcomes absent execution-guard interruption; parallel runs do not interfere |

For capacity and rate limiting, reuse and independently reconcile their current Java fixtures before extending them. Every new numeric example must specify inputs, intermediate arithmetic, units, and its intended population.

## 9. Verification by change type

### Current full local gate

Run from repository root, using the documented supported environment:

```bash
npm ci --prefix frontend
node scripts/validate-plan.mjs
bash -n start.sh
(cd backend && ./mvnw -B verify)
(cd frontend && npm run contracts:check && npm run typecheck && npm run lint && npm run format:check && npm test && npm run build)
```

When changing OpenAPI, run `npm run contracts:generate --prefix frontend`, inspect the generated diff, and include it in the commit. The current `contracts:check` compares generated output to the Git index; stage the deliberately regenerated file before that check. Never use staging to conceal an unexplained generated change.

A Windows checkout with automatic CRLF conversion can fail Prettier's line-ending check even without semantic edits. Resolve the documented checkout/format policy deliberately; avoid adding unrelated reformatting to a feature PR.

### Required evidence

| Change | Minimum relevant checks |
| --- | --- |
| Documentation only | Local links, IDs/dependency DAG, status/claim consistency, clean diff |
| Simulator | Tiny fixture, contrasting input, failure/boundary case, determinism, input/run budgets, isolation |
| API/schema | Valid/invalid HTTP cases, response-schema checks, generated types, version compatibility |
| UI | Component behavior plus real primary browser journey, responsive/focus/theme/reduced-motion and failure states |
| Storage/import | Migration, conflict handling, bounded input, corrupt/denied/quota cases, export/import round trip |
| Release | Full local/CI gates, clean startup, browser matrix, manual accessibility, packaging and applicable deployment evidence |

The Playwright command is intentionally not listed as executable yet: HLD-03 must add and verify it before documentation claims it exists. Prefer meaningful assertions over brittle snapshots or tests that merely repeat the implementation.

## 10. Per-contribution workflow for the implementing agent

1. Read the owner's latest request and repository instructions. Check `git status` and pending PRs; preserve unrelated changes.
2. Select the earliest dependency-ready task within the owner's scope. Start with HLD-01 unless evidence shows it is already complete.
3. Update local main and create a fresh descriptive branch. Never commit directly to main.
4. Create a short work item from [the template](templates/WORK_ITEM.md). State the learning outcome, files/contracts affected, exclusions, and observable acceptance criteria.
5. Inspect the nearest working module and tests. For product behavior, use LLD-with-UI's shared shell/operations/guided flow as reference; its repo-specific rules do not govern this repo.
6. For model/API changes: write the small expected fixture, define/version the contract, implement Java, then connect the UI. For frontend-only fixes, reproduce the user journey first.
7. Finish one usable vertical slice. Do not publish a list of empty modules or a UI whose outcomes are fabricated.
8. Run relevant checks; fix concrete failures. Record limitations and manual checks honestly.
9. Update roadmap evidence, content versions where appropriate, and affected architecture/content docs. A plan file alone does not make a task done.
10. Review the diff for unintended files, generated build outputs, secrets, source/ID drift, and stale claims.
11. Commit, push, and open a focused PR to main under the repository workflow and owner's current publishing authorization. Include problem, learning outcome, changes, checks, screenshots for material UI work, compatibility, and limits.
12. Wait for required CI and address feedback. Squash-merge completed authorized work, delete its branch, and update local main.
13. Handoff: completed task, behavior now available, checks actually run, open limitations, PR/commit, and exact next dependency-ready task. If the owner requested one task, stop there.

### Stop and resolve when

- A required contract or prerequisite is missing: implement/document that dependency before publishing a dependent capability.
- A behavior change would violate replay/version promises: decide the migration and version first.
- A test contradicts the modeled semantics: verify the example; do not preserve a bad assertion merely to keep CI green.
- A new service, paid dependency, auth system, or large editor is proposed: justify it against a concrete authorized requirement before expanding scope.
- A check cannot run: state why and leave the corresponding gate incomplete. Continue independent authorized work where possible.

### Handoff template

```text
Task completed:
Learning outcome:
User-visible behavior:
Changed contracts/model/content versions:
Checks run and results:
Browser/manual evidence:
Limitations or blocked gates:
PR and commit:
Next task and why it is ready:
```

## 11. First assignment

**Start with HLD-01, then HLD-02.** The first meaningful product improvement is preserving the learner's work while moving between views and showing accurate version information. After that, establish repeatable browser verification and complete the cache module using authoritative Java state.

Do not start a new large system-design case until the current first-release prerequisites meet their gates. The purpose of the plan is a coherent path that learners can run, understand, explain, and apply.
