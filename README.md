# HLD with UI

Part of the [Learning Hub](https://learning-hub-with-ui.vercel.app/).
The shared **Learning network** navigation offers Learning Home and same-tab
links between DSA, LLD, HLD, and CS fundamentals on every route. These remain
independent apps: themes, backend state, and progress are not synchronized.

Learn high-level system design by reading, experimenting, diagnosing failures, and defending design decisions. Built for day-to-day engineering and system design interviews.

The idea is simple: **see a system work, change one condition, explain what happened, then choose a design.** Each module will help you answer both “How does this work?” and “How would I explain it to my team or in an interview?”

**Status: four working learning modules.** The application includes a React/TypeScript learning shell, a Java/Spring Boot API, Request Flow & Load Balancing, Capacity Estimation, a deterministic Distributed Rate Limiter module, and a deterministic Cache-Aside module. A draft URL-shortener workshop offers ten authored stages from Requirements through Defense by direct link; publication checks and later roadmap modules remain pending.


## Visitor analytics

The deployed frontend uses [Vercel Web Analytics](https://vercel.com/docs/analytics/quickstart)
through `@vercel/analytics/react`, mounted once in the application root. Production
builds track page visits, including client-side navigation. Query strings and URL
fragments are removed before sending page locations; no custom events, practice
answers, notes, or simulation inputs are configured for collection. Development
builds do not mount analytics.

Enable **Web Analytics** for this individual project in Vercel, then deploy after
enabling it. Visit the deployed app and check its Analytics dashboard and browser
Network panel for the analytics script and page-view requests. Each app and the
Learning Hub have independent analytics. A plain local server or Docker deployment
does not supply Vercel's analytics endpoint; blocked/unavailable analytics must not
prevent learning or navigation. Live visitor totals require dashboard verification.

## Start here

Read the [project plan](docs/PROJECT_PLAN.md) for the product vision, learning experience, first release, and success criteria.

| Document | Purpose |
| --- | --- |
| [Agent instructions](AGENTS.md) | How to start, contribute, validate, and hand off work |
| [Contributing](CONTRIBUTING.md) | Branch, PR, CI, and local-check workflow |
| [Implementation plan](docs/IMPLEMENTATION_PLAN.md) | Step-by-step tasks, dependencies, acceptance fixtures, and release gates |
| [Current execution plan](docs/NEXT_IMPLEMENTATION_PLAN.md) | Current baseline, next contributions, acceptance fixtures, and first-release checklist |
| [Opus handoff](docs/OPUS_START_HERE.md) | Copy-and-paste prompt for the implementing agent |
| [Project plan](docs/PROJECT_PLAN.md) | What we are building and why |
| [Experience and quality](docs/EXPERIENCE_AND_QUALITY.md) | UI/UX and frontend/backend engineering standards |
| [Learning standard](docs/LEARNING_STANDARD.md) | Make every concept simple to understand and explain |
| [Curriculum](docs/CURRICULUM.md) | Ordered concepts, experiments, case studies, and learning paths |
| [SDE-2 interview priority](docs/SDE2_INTERVIEW_PRIORITY.md) | Evidence-based case order and recurring backend follow-ups |
| [First release blueprint](docs/RELEASE_ONE_BLUEPRINT.md) | Exact learning flows and worked fixtures for the first four modules |
| [Architecture](docs/ARCHITECTURE.md) | Proposed stack, modules, storage, and API boundaries |
| [Simulation specification](docs/SIMULATION_SPEC.md) | Deterministic execution, event contracts, metrics, and correctness |
| [Content specification](content/CONTENT_SPEC.md) | Lesson and case-study authoring requirements |
| [Delivery roadmap](docs/ROADMAP.md) | Work packages, dependencies, acceptance criteria, and current status |
| [Research and sources](docs/RESOURCES.md) | Related projects, primary references, and source policy |
| [Contribution template](docs/templates/WORK_ITEM.md) | A bounded task and evidence-based handoff |

The learning loop is **understand → predict → experiment → observe → explain → apply**. Every released module must make a learner better at making a concrete engineering decision.

The build order is: establish the React/Java foundation → finish one excellent request-flow module → add capacity estimation and caching → connect them in a URL shortener workshop → expand into queues, storage, reliability, and advanced distributed systems. The [roadmap](docs/ROADMAP.md) gives each step a completion gate.

The first complete learning experience will cover **request flow and load balancing**, followed by **capacity estimation**, **cache-aside**, and a **URL shortener design workshop**. See the roadmap for exact release gates.

## Development

Requirements: Java 17 or newer, Node.js 20.19 or newer, and npm.

```bash
npm ci --prefix frontend
./start.sh
```

Open `http://localhost:5173`. The launcher starts the frontend and backend, prints both URLs, and stops both when you press Ctrl+C. Override its ports with `FRONTEND_PORT` and `BACKEND_PORT`.

Run the same local checks as CI:

```bash
node scripts/validate-plan.mjs
bash -n start.sh
(cd backend && ./mvnw -B verify)
(cd frontend && npm run contracts:check && npm run typecheck && npm run lint && npm run format:check && npm test && npm run build)
```

The [CI workflow](.github/workflows/ci.yaml) runs these gates on pull requests and `main`.

API and content contracts live in [contracts](contracts/README.md). React API types are generated from OpenAPI, and CI rejects generated-type drift, malformed content, broken prerequisites, unresolved sources, and capabilities without a registered model.

## Deployment

The app deploys the same way as lld-with-ui and dsa-with-ui: the Java backend on Render's free tier and the React frontend as a static Vercel build.

1. **Backend (Render):** create a Blueprint from this repository. [render.yaml](render.yaml) builds [backend/Dockerfile](backend/Dockerfile) from the repository root, because the jar packages `content/` onto its classpath. Render injects `PORT`, which takes precedence over `BACKEND_PORT` and `SERVER_PORT`. The health check is `/api/v1/health`.
2. **Frontend (Vercel):** import the repository with `frontend` as the root directory (Vite preset, `npm run build`, output `dist`). [frontend/vercel.json](frontend/vercel.json) rewrites `/api/*` to the Render service and every other path to `index.html`, so deep links work and the browser stays same-origin with no CORS configuration.
3. If Render assigns a URL other than `https://hld-backend.onrender.com`, update the destination in `frontend/vercel.json` and redeploy the frontend.

Free Render services sleep when idle. The first request after a pause can exceed the client's 10-second timeout; retry once the service is awake.

## Implemented learning modules

**Request Flow & Load Balancing** follows the complete learning loop:

- study a plain-language model of routing, finite workers, queues, and rejection;
- run bounded deterministic experiments against the Java model;
- play, pause, step, and seek through the authoritative event trace;
- inspect latency, throughput, rejection, and per-request outcomes;
- use architecture, sequence, quiz, and interview-answer views to explain the result.

Request-flow v1.1.1 supports scheduled node failure/recovery. FAIL drops running and queued work; COMPLETE retains assigned work while blocking new routing to the failed node. Network delay, retries, and health-check delay remain excluded. The original v1.0.0 input supports runs without failure schedules. Its metrics describe a finite illustrative run, not a production benchmark.

**Capacity Estimation** turns explicit usage assumptions into a first-pass planning range:

- change traffic, read/write, payload, retention, latency, replication, and headroom assumptions;
- compare three presets and low/base/high traffic sensitivity;
- inspect every Java-computed formula, intermediate value, unit, assumption, and exclusion;
- connect traffic, retained data, bandwidth, and mean concurrency to design questions;
- practice the worked fixture and explain why mean concurrency does not prove burst capacity.

The estimator uses decimal units and intentionally does not recommend instance counts, cloud prices, or production capacity.

**Distributed Rate Limiter** makes enforcement tradeoffs observable:

- compare fixed-window and token-bucket decisions under virtual time;
- move state between one atomic shared counter and independent per-node counters;
- calculate aggregate overshoot rather than treating a configured limit as automatically global;
- test fail-open and fail-closed behavior during shared-counter failure;
- inspect every allowed, rejected, and bypassed decision and practice a two-minute design defense.

The model uses one identity, one-token requests, round-robin routing, and zero counter-network latency. These bounds keep the algorithm and state-placement decisions hand-checkable.

**Cache-Aside** traces hits, misses, TTL expiry, stale origin versions, concurrent cold misses, and cache/origin outages. Corrected model v1.0.1 uses a stable virtual event queue and bounded traces. Bypasses and failed GETs are explicit; limited runs identify incomplete requests. Only key `k` initially exists; UPDATE can create other keys. After a run you can step through the trace on a Cache ← Application → Origin diagram, with a state table and an event inspector. The **Guided** tab walks through eight predict → reveal → explain → tradeoff checkpoints, each verified against the Java trace by a test. **Architecture** and **Request sequence** tabs summarize the baseline. Manual zoom and screen-reader review remain open release gates.

## Draft URL-shortener workshop

Open `/case-studies/url-shortener` on your local app, or [try the draft workshop](https://hld-with-ui.vercel.app/case-studies/url-shortener) after the frontend and Java deployment includes this change. It is deliberately excluded from home discovery. The home page reads published workshops from Java through `/api/v1/case-studies`; the collection is currently empty. Workshops will appear after their catalog publication and release review.

The **Requirements** stage helps you describe create/redirect behavior, expiry and ownership correctness, workload/service objectives, abuse policy, and non-goals before drawing components. Write an original attempt, reveal one worked reference, self-check, then write a separate revision. Both answers stay visible and save on this browser using the same backup/import/reset controls as Practice. Reference reading remains available when saving is blocked.

The **Estimates** stage works through read/write demand, storage, bandwidth, and mean concurrency using the real Capacity Calculator. Change peak factor, read percentage, or record size and explain which outputs change. The **API** stage specifies create/redirect behavior, input validation, expiry at an authoritative decision time, cache policy, errors, and a bounded retry contract. Requirements and Operations use the same proposed correctness/latency objective. An already authorized redirect may finish after expiry or takedown; this limit is explicit. These are design decisions, not executable shortening endpoints.

Use the stage navigation to focus on one decision at a time. Direct links such as `/case-studies/url-shortener?stage=estimates` and `?stage=api` survive refresh; Back/Forward and saved answers let you return to your reasoning. Content version 1.5.0 preserves older notes but asks for fresh reference review and self-checks.

The **Data** stage explains ownership, unique code reservations and atomic create/replay records. **Baseline** shows the client, stateless service, primary store and separate destination request. **Flows** lets you inspect create, active redirect, lost-response replay and expiry equality one decision at a time, with participant diagrams and a complete text equivalent. These are illustrative design walkthroughs, not executed database operations.

**Evolution** compares strict mapping-cache hit/miss paths and explains why authoritative eligibility reads still matter. **Failures** covers hot links, cache/primary outages, stale expiry/takedown state and uncertain creates, with actual Java experiment links.

**Operations** teaches SLO boundaries, privacy-aware signals, incident mitigation, protected control paths and compatible rollout/restore. **Defense** provides 30-second/two-minute explanations, an adaptable discussion outline and changed-requirement follow-ups. Three new illustrative paths can be stepped through with a full textual equivalent. The workshop is a learning exercise and creates no short links. The [publication review](docs/URL_SHORTENER_PUBLICATION_REVIEW.md) records stage/source checks and the outstanding manual learning/accessibility reviews. The workshop remains draft until those gates and its prerequisite release reviews pass. See [HLD-09B4](docs/work-items/HLD-09B4.md) for evidence and [the delivery incident](docs/INCIDENTS.md) for the hosted backend deployment issue.

## Find an explanation

Use **Search** in the header, or open `/search`. Search published titles, summaries and lesson text, then narrow by level or learning activity. All whitespace-separated terms must match; results link directly to Study or a published workshop stage. Java returns at most 20 matching pages and the total match count. Blank text, no matches, invalid filters and backend failures have explicit states; draft/planned modules and saved answers are excluded. Search criteria survive refresh and browser history in the URL. The first learning path is available from home.

## Follow a learning path

Choose **Start learning** on home, or **Explore the first learning path** when returning.
The path orders Request Flow → Capacity → Cache-Aside → URL Shortener, with published
prerequisite links and optional Rate Limiter depth. Java resolves titles, versions,
publication state and answer identities from the packaged catalog/content.

The URL Shortener step is clearly unavailable until publication review passes; the path
does not link to the draft. Existing direct draft links and saved-answer resume still work.
Counts distinguish available steps, steps with current saved answers and reference views.
Old or removed activity records stay in backups and do not count as current work. The
suggestion selects the first available step without a current answer; it does not judge
correctness or completion. No page visit saves progress or runs an experiment.
See [HLD-10D](docs/work-items/HLD-10D.md). Explicit completion remains pending.

## Continue saved work

After you save a Practice answer, Guided prediction or workshop decision, home offers
**Continue learning**. Reopen the actual question, checkpoint or stage, or choose another
saved module. The card checks the current lesson before linking; older answers ask for fresh
review, and removed activities stay in your backup. An existing draft answer can resume its
labeled draft route without publishing the workshop. Guided evidence needs an explicit Java
run again. Page visits never mark a module complete.

The home card also offers the existing safe answer backup/import/reset controls. Storage
warnings remain visible when those tools are collapsed. This is saved reasoning on this browser;
playground runs and the last page visited are not stored. See [HLD-10B](docs/work-items/HLD-10B.md).

## Save a module for later

Choose **Save module** in a published module header, then open **Bookmarks** or home's
**Saved modules** link. The reading list checks the current catalog before linking. Removed
or unpublished modules remain in your backup; changed content asks for fresh review.
A bookmark does not create an answer, completion mark, or Continue learning activity.

**Back up or manage bookmarks** downloads a separate bookmark JSON file, previews imports
while keeping existing saves, and confirms a reset of bookmarks only. Answer backups stay
unchanged. Storage failures keep your actions for the session with downloads and explicit retry;
unreadable previous data is preserved. Bookmarks are local to this browser, with no account sync.
See [HLD-10C](docs/work-items/HLD-10C.md).

## Saved learning answers

The **Practice** tab saves your choices, written explanations, and reference-view
state automatically on this browser. They survive reloads and route changes;
answers are not sent to the backend or analytics. **Download answers** saves a
JSON backup. **Import answers or reset this module** opens backup tools: choose
a file, review conflicts, then apply. Existing nonempty answers stay unless you
choose an imported alternative. A saved-module selector also lets you remove
retired module answers from a full backup. Reset needs confirmation and affects
only saved answers for the module named in the confirmation.

If browser storage fails, the app keeps new answers in the current session and
asks you to download them before leaving or reloading. Unreadable or unsupported
saved data is kept untouched, with **Download previous data** when available.
Answers from older content remain visible with a review notice; they do not
automatically count as reviewed for the updated lesson. No completion or mastery
is inferred.

The cache **Guided** tab also saves predictions and tradeoff choices. After a
reload, explicitly select **Run and reveal** to generate Java evidence again;
playground inputs and simulation traces are not stored. **Try saving again** can
recover session answers after storage access/quota returns. Import/reset errors
preserve existing answers. Backups accept at most 200 records / 256 KiB, with
4,000 characters per explanation. An edit exceeding the total answer limit is
refused visibly; download a backup and reset a module to free space.

## References

**[lld-with-ui](https://github.com/Prem-Duvvapu/lld-with-ui) is the primary product reference**, as selected by the project owner: hands-on modules, guided simulations, diagrams, and design details in a consistent shell. [dsa-with-ui](https://github.com/Prem-Duvvapu/dsa-with-ui) and [cs-fundamentals-with-ui](https://github.com/Prem-Duvvapu/cs-fundamentals-with-ui) provide supporting practices. The user-provided [system design resource collection](https://github.com/ashishps1/awesome-system-design-resources) is a discovery index; lessons will include primary sources and original explanations.

## License

This project's original code and documentation are licensed under the [MIT License](LICENSE).
Copyright (c) 2026 Prem Duvvapu.

Third-party dependencies and materials remain subject to their own licenses and notices;
the project license does not replace those terms.
