# Delivery roadmap and work queue

Planning baseline: 2026-09-22. Implementation evidence is recorded per work item; partial slices stay in progress until every acceptance criterion is met.

Statuses: `planned` → `in-progress` → `review` → `done`; `blocked` requires a named dependency or missing decision. Update the evidence column when changing status. Do not call a phase complete while its release gates remain unverified.

Sizes are relative work packages: S = focused change; M = several related changes; L = multiple vertical contributions. They are not promises of days or deadlines. Split L items before implementation using the task template.

## Phase 0: executable foundation

Goal: one coherent shell and a working contract path, without producing a broad library of unfinished modules.

| ID | Work package | Depends on | Size | Acceptance | Status / evidence |
| --- | --- | --- | --- | --- | --- |
| `P0-01` | Bootstrap React/TypeScript and Java/Spring toolchain | None | M | Locked dependencies, Maven Wrapper, clean builds, health endpoint, API proxy, root launcher with cleanup, exact setup docs | **done** — lockfile/wrapper committed; Java and React gates pass; health endpoint, proxy, launcher, and README commands implemented |
| `P0-02` | Catalog and HTTP/event/content contracts | P0-01 | M | OpenAPI/JSON Schemas, generated frontend types, examples validate, unique IDs and prerequisite DAG checks, published-capability checks | **done** — OpenAPI 3.1 and content schemas committed; frontend types generated; CI checks two inputs plus catalog IDs, DAG, paths, questions, sources, and capabilities |
| `P0-03` | Shared HLD module shell | P0-01, P0-02 | M | LLD-inspired tabs; URL-selected view; home/category navigation; deep-link and unknown route behavior; both themes; responsive keyboard navigation | **in-progress** — URL tabs, document titles, manual-activation keyboard semantics, route splitting, themes, and 320/768/1440 initial-state Chrome renders have automated coverage; manual zoom, completed flows, reduced-motion, and screen-reader review remains in `RELEASE_REVIEW.md` |
| `P0-04` | Repository quality gates | P0-01, P0-02 | M | CI runs applicable backend/frontend builds, tests, type/lint checks, content/contract validation; no success from missing tests; clean-checkout instructions verified | **in-progress** — CI runs contract drift/content checks, Java verify, and frontend typecheck/lint/format/tests/build; clean-checkout browser smoke remains |

Exit: a developer can start both applications, navigate the shell, fetch a validated draft catalog entry, and see honest unavailable states. No fake simulation is necessary to prove the shell.

## Phase 1: reference vertical slice

| ID | Work package | Depends on | Size | Acceptance | Status / evidence |
| --- | --- | --- | --- | --- | --- |
| `P1-01` | Bounded deterministic runner | P0-02, P0-04 | M | Virtual clock, stable scheduler, seeded RNG, request isolation, event/byte/time budgets, trace envelope, explicit limits/errors | **in-progress** — request-flow has stable virtual-time ordering, isolated runs, explicit input/event/virtual-time limits, and truthful `completed`/`limited` metadata; byte budget, generic runner context, and seeded failure schedules remain |
| `P1-02` | Request-flow/load-balancing model | P1-01 | M | Round-robin and least-outstanding, finite workers/queues, health/failure schedule, exact six-request fixture and divergent policy preset | **in-progress** — deterministic policies, finite capacity, overload, exact fixture, replay, and divergence tests pass; failure schedules wait for P1-01 runner contracts |
| `P1-03` | Playground and guided playback | P0-03, P1-02 | M | Schema-driven inputs, start/step/back/reset/seek/speed, topology, request sequence, trace log, inspector, Java-computed metrics, error/limited states | **in-progress** — descriptor limits now drive validated controls; presets, complete playback, topology, selectable event trace, outcomes, Java metrics, and explicit error/empty/limited states work; policy options and control rendering remain hand-authored |
| `P1-04` | Request-flow teaching content | P1-02, P1-03 | M | Full lesson/questions/resources, architecture/sequence views, prediction and transfer prompts, trace-aligned explanations, source links | **in-progress** — original lesson, primary sources, architecture/sequence explanations, two feedback questions, and an interview rubric are published; release review remains |
| `P1-05` | Reference module release review | P1-04, P0-04 | S | Browser journey, accessibility/manual mobile review, numeric reconciliation, measured trace/bundle baseline, model limits documented | **in-progress** — stale-result correctness, tab semantics, labels, route loading, numeric fixtures, and a production bundle baseline are verified; manual browser, mobile, both-theme, zoom, reduced-motion, and screen-reader evidence remains in `RELEASE_REVIEW.md` |

Exit: `request-flow` can be published with all declared capabilities. Review whether the shell and engine support a second module without copy-paste before expanding.

## Phase 2: first complete learning release

| ID | Work package | Depends on | Size | Acceptance | Status / evidence |
| --- | --- | --- | --- | --- | --- |
| `P2-01` | Capacity estimator and lesson | P1-05 | M | Validated units, explicit assumptions, average/peak/bytes/concurrency calculations, sensitivity, small numeric fixtures, question feedback | **in-progress** — published lesson and practice, bounded Java estimator, OpenAPI generated types, three presets, transparent formulas, sensitivity range, and reconciled numeric fixtures pass automated checks; browser accessibility/mobile/theme review remains |
| `P2-02` | Cache-aside module | P1-05, P2-01 | L | Modeled keys/values/TTL/origin versions, cold/warm/update/outage presets, trace/metrics, full learning tabs, staleness and expiry boundary tests | planned |
| `P2-03` | URL shortener guided workshop | P2-01, P2-02 | M | Baseline/evolved design, two request flows, APIs/data model, collision/expiry/abuse treatment, experiment links, editable decisions and rubric | planned |
| `P2-04` | Search, bookmarks, progress, practice | P1-05 | M | Published-content search; local versioned progress; recall feedback; export/import validation/conflicts; storage-error handling | planned |
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
| `P3-04` | Queues/streams, idempotency, retries, breakers, rate limiting | Learner traces duplicates, retries, backpressure, and recovery | planned |
| `P3-05` | Architecture boundaries, observability, security/tenancy | Learner defends boundaries and diagnoses an incident with evidence | planned |
| `P3-06` | Notification, rate limiter, chat, feed cases; timed practice | Four integrated cases plus 45-minute configurable interview flow and self-assessment | planned |

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

- Each contribution updates one work item with changed artifacts, checks, limitations, and next dependency.
- Maintain catalog-derived completion counts after implementation. Planned scope is not shipped coverage.
- Record recurring or consequential failures in a concise `docs/INCIDENTS.md` once the first occurs: symptom, cause, fix, regression evidence.
- Keep architecture and content contracts authoritative; task notes do not silently override them.
- No schedule is committed. Re-estimate after the reference slice reveals actual content/model/UI cost.

**Next action:** finish the `P0-03` browser/accessibility review, then complete `P1-01` runner bounds so request-flow failure schedules can be added safely.
