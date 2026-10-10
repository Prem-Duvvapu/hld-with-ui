# Delivery roadmap and work queue

Planning baseline: 2026-09-22. Implementation evidence is recorded per work item; partial slices stay in progress until every acceptance criterion is met.

Statuses: `planned` → `in-progress` → `review` → `done`; `blocked` requires a named dependency or missing decision. Update the evidence column when changing status. Do not call a phase complete while its release gates remain unverified.

Sizes are relative work packages: S = focused change; M = several related changes; L = multiple vertical contributions. They are not promises of days or deadlines. Split L items before implementation using the task template.

For the detailed execution sequence and agent handoff, use [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) and [OPUS_START_HERE.md](OPUS_START_HERE.md). Those plans do not change the statuses or release gates recorded here.

## Phase 0: executable foundation

Goal: one coherent shell and a working contract path, without producing a broad library of unfinished modules.

| ID | Work package | Depends on | Size | Acceptance | Status / evidence |
| --- | --- | --- | --- | --- | --- |
| `P0-01` | Bootstrap React/TypeScript and Java/Spring toolchain | None | M | Locked dependencies, Maven Wrapper, clean builds, health endpoint, API proxy, root launcher with cleanup, exact setup docs | **done** — lockfile/wrapper committed; Java and React gates pass; health endpoint, proxy, launcher, and README commands implemented |
| `P0-02` | Catalog and HTTP/event/content contracts | P0-01 | M | OpenAPI/JSON Schemas, generated frontend types, examples validate, unique IDs and prerequisite DAG checks, published-capability checks | **done** — OpenAPI 3.1 and content schemas committed; frontend types generated; CI checks two inputs plus catalog IDs, DAG, paths, questions, sources, and capabilities; HLD-01 adds catalog-to-curriculum identity/kind/prerequisite agreement and published-only prerequisites ([decision 0005](decisions/0005-rate-limiter-topic-and-workshop-ids.md)) |
| `P0-03` | Shared HLD module shell | P0-01, P0-02 | M | LLD-inspired tabs; URL-selected view; home/category navigation; deep-link and unknown route behavior; both themes; responsive keyboard navigation | **in-progress** — HLD-02 keeps visited panels mounted so inputs, runs, playback position, and practice answers survive tab round trips without re-fetching; tabs are history entries, unsupported views normalize to the default, hidden playback pauses, pending runs lock presets, and the header shows the content version while playgrounds show the Java model version ([work item](work-items/HLD-02.md)); URL tabs, document titles, manual-activation keyboard semantics, route splitting, themes, and 320/768/1440 initial-state Chrome renders have automated coverage; manual zoom, completed flows, reduced-motion, and screen-reader review remains in `RELEASE_REVIEW.md` |
| `P0-04` | Repository quality gates | P0-01, P0-02 | M | CI runs applicable backend/frontend builds, tests, type/lint checks, content/contract validation; no success from missing tests; clean-checkout instructions verified | **in-progress** — CI runs contract drift/content checks, Java verify, and frontend typecheck/lint/format/tests/build; a Playwright browser job (HLD-03 slice 1, [work item](work-items/HLD-03.md)) runs real-API journeys for all four modules, cache cold-burst and limited runs, tab/history state, keyboard focus, unknown routes, mocked load/run failures, and 320/768/1440 × light/dark overflow on every tab, against the packaged jar and production build; plus a real launcher smoke (proxied health, deep link, Ctrl+C process/port cleanup, occupied-port failure) in the same job; cache compatibility failures now have a runtime guard and retry regressions; manual zoom/screen-reader review remains |

Exit: a developer can start both applications, navigate the shell, fetch a validated draft catalog entry, and see honest unavailable states. No fake simulation is necessary to prove the shell.

## Phase 1: reference vertical slice

| ID | Work package | Depends on | Size | Acceptance | Status / evidence |
| --- | --- | --- | --- | --- | --- |
| `P1-01` | Bounded deterministic runner | P0-02, P0-04 | M | Virtual clock, stable scheduler, seeded RNG, request isolation, event/byte/time budgets, trace envelope, explicit limits/errors | **done** — shared `SimulationContext` runner engine implemented with byte budget tracking, cooperative wall-time checks, seeded PRNG (workload/failure seeds), validated `FailureSchedule`, truthful truncation reasons (`trace_size_limit`, `wall_time_limit`), and ADR 0003 recorded; review fixes account for escaped/Unicode trace strings; [HLD-04C](work-items/HLD-04C.md) checks actual serialized events-array bounds and simultaneous real HTTP isolation across all three simulator beans. Independent total-response/body byte ceilings and aggregate admission are still unimplemented |
| `P1-02` | Request-flow/load-balancing model | P1-01 | M | Round-robin and least-outstanding, finite workers/queues, health/failure schedule, exact six-request fixture and divergent policy preset | **done** — deterministic round-robin and least-outstanding policies, finite worker/queue bounds, failure injection and recovery with InFlightBehavior.FAIL, 6-request hand-calculated fixture, and slow-node divergence preset covered by simulator tests, including queued failures and COMPLETE recovery without extra workers (v1.1.1); see `SIMULATION_REVIEW.md` |
| `P1-03` | Playground and guided playback | P0-03, P1-02 | M | Schema-driven inputs, start/step/back/reset/seek/speed, topology, request sequence, trace log, inspector, Java-computed metrics, error/limited states | **done** — descriptor limits drive validated controls; all four presets including node failure schedules preserved and executed; complete playback (start/step/back/reset/seek/speed); topology with real-time node failure visualization; selectable trace log; outcome inspector; 6-metric grid with failed count; explicit error/empty/stale/limited states verified by automated tests |
| `P1-04` | Request-flow teaching content | P1-02, P1-03 | M | Full lesson/questions/resources, architecture/sequence views, prediction and transfer prompts, trace-aligned explanations, source links | **in-progress** — original lesson, primary sources, architecture/sequence explanations, feedback questions, and an interview rubric are published; HLD-07A aligns the lesson and views with the FAIL/COMPLETE failure model (Java-verified numbers, health-check source, failure prediction question, content 1.1.0) and adds browser checks for the failure preset and keyboard playback ([work item](work-items/HLD-07A.md)); release review remains |
| `P1-05` | Reference module release review | P1-04, P0-04 | S | Browser journey, accessibility/manual mobile review, numeric reconciliation, measured trace/bundle baseline, model limits documented | **in-progress** — stale-result correctness, tab semantics, labels, route loading, numeric fixtures, and a production bundle baseline are verified; [HLD-09C-A](work-items/HLD-09C-A.md) adds native 200% zoom result-flow checks and screenshots across four published modules plus workshop Operations; broader manual browser, mobile, both-theme, zoom, reduced-motion, and screen-reader evidence remains in `RELEASE_REVIEW.md` |

Exit: `request-flow` can be published with all declared capabilities. Review whether the shell and engine support a second module without copy-paste before expanding.

## Phase 2: first complete learning release

| ID | Work package | Depends on | Size | Acceptance | Status / evidence |
| --- | --- | --- | --- | --- | --- |
| `P2-01` | Capacity estimator and lesson | P1-05 | M | Validated units, explicit assumptions, average/peak/bytes/concurrency calculations, sensitivity, small numeric fixtures, question feedback | **in-progress** — published lesson and practice, bounded Java estimator, OpenAPI generated types, three presets, transparent formulas, sensitivity range, and reconciled numeric fixtures; [HLD-07B](work-items/HLD-07B.md) adds blank-preserving validated inputs, pending-field locks, explicit unit conversions, headroom/sensitivity explanations, changed-condition examples and interview scaffolds (content 1.1.0); 93 Java / 97 frontend tests and the production build pass; real-HTTP and browser checks cover the worked changes, validation/retry, keyboard/history, and the full capacity viewport/theme matrix; manual zoom/screen-reader and newcomer review remain |
| `P2-02` | Cache-aside module | P1-05, P2-01 | L | Modeled keys/values/TTL/origin versions, cold/warm/update/outage presets, trace/metrics, full learning tabs, staleness and expiry boundary tests | **in-progress** — deterministic Java simulator with four presets (baseline, cold-burst, cache-unavailable, origin-unavailable), OpenAPI contracts, and 20 simulator tests cover timing, versions, missing keys, outage outcomes, and execution limits (v1.0.1); published lesson, questions, sources, and a Study/Playground/Practice page with a descriptor-driven playground are live; 16 playground tests cover preset-to-request serialization, stale-hit rendering, preset switching, edited inputs, client-side operation/range validation (including blank numeric fields), Java validation errors, and origin-unavailable outcomes; results now reference a dedicated `CacheAsideEvent` contract matching the emitted cache/origin event kinds; subsequent slices below complete the guided playback/architecture/sequence views; manual review remains; see `SIMULATION_REVIEW.md`; HLD-04 slice A publishes exact input limits (`CacheAsideLimits`) in the descriptor and OpenAPI, backed by the same Java constants as validation, and the playground validates against them; slice B adds each event's operation, key, and post-event cache/origin state plus an initial state ([decision 0006](decisions/0006-cache-event-key-state.md), [work item](work-items/HLD-04.md)); the review follow-up adds real-HTTP OpenAPI response checks and a frontend compatibility gate with retry regressions; HLD-05 adds playback: a Cache ← Application → Origin diagram, initial-state position, play/pause/step/reset/seek/speed, an event inspector, a cache/origin state table, and an operation filter, all rebuilt from `initialState` and per-event key state and tested against captured Java traces and in the browser ([work item](work-items/HLD-05.md)); HLD-06A adds a Guided tab with eight predict → reveal → explain → tradeoff checkpoints authored as content, each resolved against its Java preset by a test that also checks the numbers it teaches ([decision 0007](decisions/0007-guided-checkpoints.md), [work item](work-items/HLD-06A.md)); HLD-06B adds Architecture and Request sequence views, an interview scaffold, changed-condition follow-ups, a corrected wrong explanation, two Java-checked transfer questions, and a re-audited source list (content 1.1.0; [work item](work-items/HLD-06B.md)); manual zoom/screen-reader review and a newcomer teach-back remain |
| `P2-03` | URL shortener guided workshop | P2-01, P2-02 | M | Baseline/evolved design, two request flows, APIs/data model, collision/expiry/abuse treatment, experiment links, editable decisions and rubric | **in-progress** — [HLD-09A](work-items/HLD-09A.md) implements one draft Requirements stage, typed/validated Java delivery, lazy direct route, original → reference → self-check → revision, and shared saved-answer lifecycle. [HLD-09B1](work-items/HLD-09B1.md) adds Estimates/API, Java-checked numerical exercises, bounded retry/redirect policies, and stage navigation with history and saved answers. [HLD-09B2](work-items/HLD-09B2.md) adds Data/Baseline/Flows with bounded typed walkthroughs, atomic ownership/replay reasoning and expiry/uncertain-write paths (content 1.2.0). [HLD-09B3](work-items/HLD-09B3.md) adds Evolution/Failures, strict mapping-versus-eligibility paths and Java-checked model transfer exercises (content 1.3.0). [HLD-09B4](work-items/HLD-09B4.md) completes Operations/Defense with incident/rollout walkthroughs and simple interview explanations (content 1.4.0). All ten stages are authored. [HLD-09C-B](work-items/HLD-09C-B.md) adds Java-derived published-case discovery and independent home loading/error/retry; the current case stays draft and outside discovery. [HLD-09C-C](work-items/HLD-09C-C.md) rejects invalid prerequisite graphs at Java startup as well as in content checks. [HLD-09C-D](work-items/HLD-09C-D.md) audits all stages/sources and expands all-stage answer/zoom coverage, aligning the proposed SLO and authoritative expiry clock (content 1.5.0). Required newcomer/screen-reader evidence, prerequisite release review and publication remain |
| `P2-04` | Search, bookmarks, progress, practice | P1-05 | M | Published-content search; local versioned progress; recall feedback; export/import validation/conflicts; storage-error handling | **in-progress** — [HLD-08A](work-items/HLD-08A.md) saves shared Practice answers and reference-view state with stable IDs/content versions, download backups, preserved invalid data, and session fallback; older answers require fresh review. [HLD-08B](work-items/HLD-08B.md) saves Guided predictions/tradeoffs and adds strict import/conflict preview, scoped reset, retry, and bounds. [HLD-10A](work-items/HLD-10A.md) adds bounded Java published-content search, filters, excerpts and a lazy React search route with history/error/empty/keyboard behavior. [HLD-10B](work-items/HLD-10B.md) resumes saved reasoning at validated authored questions, checkpoints and workshop stages, with version/removal/storage/backup handling. [HLD-10C](work-items/HLD-10C.md) adds published-module bookmarks and independent catalog-validated reading lists, bounded preview/import/reset/backup, and safe storage failure handling. [HLD-10D](work-items/HLD-10D.md) adds a Java-resolved first path with prerequisite links, optional depth and current saved-answer/reference evidence; unavailable stages stay unlinked. Explicit completion evidence remains planned; checks are recorded in the work items |
| `P2-05` | First release hardening and packaging | P2-03, P2-04 | M | All four modules usable; clean local and container startup; deep links; end-to-end critical flows; resource/accessibility gates; truthful README | planned |

Exit: the complete first-release path in [PROJECT_PLAN.md](PROJECT_PLAN.md#4-first-release-a-complete-small-learning-path) is usable. Capture learner observations and revise confusing steps before the next content wave.
Use [the first release blueprint](RELEASE_ONE_BLUEPRINT.md) for worked fixtures and learner journeys.

## Phase 3: core HLD breadth

All entries depend on `P2-05` and the prerequisite closure in the curriculum. Build one complete module at a time within each wave.

| ID | Wave | Required outcome | Status |
| --- | --- | --- | --- |
| `P3-01` | Requirements, edge networking, APIs, scaling, data models and indexes | Learner can derive a baseline architecture and access patterns | planned |
| `P3-02` | Replication, partitioning, consistent hashing, transactions | Learner can explain read/write placement and preserve a stated invariant | planned |
| `P3-03` | Cache policies/failures, CDN, saturation | Learner diagnoses origin overload, skew, and queue growth | planned |
| `P3-04` | Queues/streams, idempotency, retries, breakers, rate limiting | Learner traces duplicates, retries, backpressure, and recovery | **in-progress** — a standalone distributed-rate-limiter topic now compares fixed window/token bucket, shared/local counter scope, overshoot, and backend failure policy; [HLD-07C](work-items/HLD-07C.md) corrects the unrelated RFC 9331 citation, scopes primary references, adds Java-verified boundary/refill/outage examples and practice, and clarifies window/burst allowance versus run totals and unknown quota on counter failure (content 1.1.0); manual zoom/screen-reader and newcomer review remain; queue, stream, retry, idempotency, and breaker modules plus the Phase 3 wave gate remain |
| `P3-05` | Architecture boundaries, observability, security/tenancy | Learner defends boundaries and diagnoses an incident with evidence | planned |
| `P3-06` | Notification, rate limiter (`rate-limiter-workshop`), chat, feed cases; timed practice | Four integrated cases plus 45-minute configurable interview flow and self-assessment | planned |

Exit: all R2 concepts and cases meet their publication gates. The core release must include executable experiments for replication lag, partition skew, duplicate delivery, retry amplification, and rate limiting. Theory-only publication does not satisfy those five experiment gates.

## Phase 4: advanced distributed systems and design studio

| ID | Work package | Depends on | Acceptance | Status |
| --- | --- | --- | --- | --- |
| `P4-01` | Consistency, partitions, quorums, clocks | P3-02, P3-04 | Precise histories/guarantees, conflict and partition fixtures, explicit modeling limits | planned |
| `P4-02` | Consensus, leases, discovery, IDs | P4-01 | Protocol-specific safety evidence, stale-owner/failure fixtures, primary-paper review | planned |
| `P4-03` | Outbox/CDC, sagas, object storage | P3-04, P3-05 | Crash-boundary experiments and recovery/reconciliation decisions | planned |
| `P4-04` | Deployments, regions, recovery, cost | P4-01, P3-05 | Mixed-version migration, restore exercise, RPO/RTO, user-priced sensitivity | planned |
| `P4-05` | R3 case studies | Corresponding curriculum prerequisites | All seven R3 cases authored and reviewed as bounded contributions | planned |
| `P4-06` | Architecture design studio | P2-03 plus editor decision/prototype | Typed nodes/edges, keyboard editing, notes, versioned import/export, assumptions and consistency warnings; no claim arbitrary graphs are executable | planned |

Keep studio and advanced content separable. Editor work must not block learning modules. Record a library choice only after evaluating accessibility, serialization, licensing, and bundle impact.

## Phase 5: specialization and real labs

| ID | Work package | Gate | Status |
| --- | --- | --- | --- |
| `P5-01` | Search, media/realtime, AI serving; R4 cases | Existing core/advanced modules stable; source-backed specialist review | planned |
| `P5-02` | Optional Java + infrastructure labs | Separate Compose profiles, repeatable datasets, resource estimates, cleanup, observed-versus-simulated comparison | planned |
| `P5-03` | Learning-quality review and maintenance | Transfer exercises reviewed, stale source claims updated, recurring bugs recorded, coverage generated | planned |

First lab candidates: Java service + PostgreSQL query/index experiment; Java + Redis cache expiry/stampede; Java consumer + message broker duplicate delivery. Pick one and finish it before adding another. Standard learning must remain usable without those infrastructure dependencies.

## Definition of done

For each changed capability, require applicable evidence:

| Area | Required evidence |
| --- | --- |
| Behavior | A meaningful input changes actual execution; intended invariants and failures verified |
| Explanation | Learner can give a plain-language account, a teammate briefing, and an interview answer using observed evidence |
| Content | Accurate outcomes, worked example, alternatives, sources, explanation aligned with implementation |
| API/contracts | Schema validation, generated types in sync, status/error cases, no silent fallback |
| UI | Complete primary flow, readable both themes, keyboard/focus, mobile, reduced motion, explicit error/empty/limited states |
| Resource limits | Invalid/large input and run budgets tested; repeated/concurrent runs isolated |
| Integration | Registry/capability/route coverage and a browser journey for a new module |
| Delivery | Relevant local checks pass; required CI passes before merge; docs describe current behavior |

Use [the experience and quality standard](EXPERIENCE_AND_QUALITY.md) to review each frontend and backend contribution in detail.

For documentation-only work, check internal links, IDs/dependencies, numbers, and consistency; do not run nonexistent application tests. For model changes, run semantic tests plus shared contract tests. For release gates, run the complete established suite and fresh-checkout smoke path.

## Handoff and maintenance

### Project license

The repository's original code and documentation use the [MIT License](../LICENSE),
with the project license also declared in the frontend manifest/lockfile and Java
POM. Third-party materials retain their own terms. Verification checks the standard
license text, metadata consistency, unchanged dependencies and documentation links;
required application CI runs on the contribution PR. This maintenance change does
not complete module publication or outstanding learner reviews.

### Visitor analytics

The deployed frontend mounts Vercel Web Analytics once at the application root
for production builds. Query strings and fragments are removed before page
locations are sent; no learner answers or simulation inputs are configured for
collection. The README records dashboard enablement and deployment verification.
This maintenance contribution does not change module completion or release gates.

### Learning network navigation

Cross-project navigation is implemented in `LearningNetworkNav`, mounted in
the app shell without changing module routes or simulation contracts. Native
same-tab links connect the Learning Hub and all four independent apps; the
current subject is marked accessibly. The component test pins destination and
navigation contracts. This bounded navigation task does not complete or change
the HLD module roadmap or its outstanding manual release gates.

- Each contribution updates one work item with changed artifacts, checks, limitations, and next dependency.
- Maintain catalog-derived completion counts after implementation. Planned scope is not shipped coverage.
- Record recurring or consequential failures in a concise `docs/INCIDENTS.md` once the first occurs: symptom, cause, fix, regression evidence.
- Keep architecture and content contracts authoritative; task notes do not silently override them.
- No schedule is committed. Re-estimate after the reference slice reveals actual content/model/UI cost.

**Next action:** complete the named manual/prerequisite gates in [the URL-shortener publication review](URL_SHORTENER_PUBLICATION_REVIEW.md); publish only after their evidence is recorded. [HLD-09C-D](work-items/HLD-09C-D.md) records the technical review, corrected clock/SLO explanations and all-stage answer/zoom checks. [HLD-09C-C](work-items/HLD-09C-C.md) closes the Java-only prerequisite graph validation gap. [HLD-09C-B](work-items/HLD-09C-B.md) provides catalog-derived published-workshop discovery without publishing the draft. [HLD-09C-A](work-items/HLD-09C-A.md) records actual native 200% zoom evidence for the named result/workshop flows. Ten authored draft stages are recorded in [HLD-09B4](work-items/HLD-09B4.md); failure paths are recorded in [HLD-09B3](work-items/HLD-09B3.md). Earlier Data/Baseline/Flows stages and walkthroughs are recorded in [HLD-09B2](work-items/HLD-09B2.md). The earlier Estimates/API stages and navigation are recorded in [HLD-09B1](work-items/HLD-09B1.md); the initial Requirements foundation is recorded in [HLD-09A](work-items/HLD-09A.md). The hosted backend deployment issue remains open in [the incident record](INCIDENTS.md). HLD-08B persistence/import/reset/recovery are recorded in [the work item](work-items/HLD-08B.md). HLD-08A Practice persistence and recovery are recorded in [the work item](work-items/HLD-08A.md). Rate-limiter source and teaching review is recorded in [HLD-07C](work-items/HLD-07C.md). Capacity review is recorded in [HLD-07B](work-items/HLD-07B.md). Request flow is recorded in [HLD-07A](work-items/HLD-07A.md). Cache work is recorded in [HLD-05](work-items/HLD-05.md), [HLD-06A](work-items/HLD-06A.md), and [HLD-06B](work-items/HLD-06B.md). HLD-01 and HLD-02 are recorded in [their](work-items/HLD-01.md) [work items](work-items/HLD-02.md); [HLD-03](work-items/HLD-03.md) has the automated browser, failure, layout, and launcher checks, with manual zoom/screen-reader review still pending. [HLD-04](work-items/HLD-04.md) records contract bounds, structured state, real-HTTP response validation, and runtime compatibility checks. [HLD-04C](work-items/HLD-04C.md) adds actual serialization and concurrent HTTP isolation evidence. Follow the [implementation plan](IMPLEMENTATION_PLAN.md#5-delivery-sequence-and-dependencies) through HLD-06 before the URL shortener workshop.
