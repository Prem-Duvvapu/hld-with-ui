# Agent contribution instructions

## Current state

The React/TypeScript frontend and Java backend implement request flow, capacity estimation, rate limiting, and cache-aside. A draft URL-shortener workshop with Requirements through Defense (ten authored stages) is available by direct case-study route and remains outside published topic discovery. A draft Queues & Tail Latency topic provides Java experiments, snapshot playback, eight Guided checkpoints, Architecture, Job sequence, Study and Practice at `/draft/topics/queues-tail-latency`; it remains outside published discovery and does not model durable delivery or retries. The draft Delivery, ACKs & Duplicate Work topic at `/draft/topics/queues-delivery` connects the Java model to strict APIs, editable broker-consumer-ledger playback, eight Java-verified Guided checkpoints, Architecture, Message sequence, Study and eight Practice questions. Both queue topics remain outside published discovery. A draft Data Models & Access Patterns topic at `/draft/topics/data-access-models` offers a bounded Java access analysis, seven scenarios, editable queries and records, Study and eight Practice questions. Eight Java-verified Guided checkpoints, inspectable Architecture and three authored Operation sequence paths complete its six draft views. Human/hosted review and publication remain pending. It models logical access work and sequential uniqueness, with no physical database, concurrency, durability or idempotency guarantee; it remains outside published discovery. A draft Transactions & Isolation topic at `/draft/topics/transactions-isolation` connects the bounded Java reservation model to strict APIs, eight editable scenarios, initial/post-step snapshot playback, Study and eight Practice questions. Eight Java-verified Guided checkpoints, inspectable Architecture and three authored manual Operation sequences complete its six core draft views. These are technical draft artifacts; human/hosted/publication gates remain pending. The same draft now includes a second Atomicity & abort Playground at `?experiment=atomicity`, with eight Java scenarios, private/published snapshots, Study extensions and eight added Practice questions (sixteen total). Each experiment now has eight Java-targeted Guided checkpoints, inspectable Architecture and three manual Operation sequence paths, selected by the same experiment choice. Human/hosted/publication gates remain pending. The first model compares stale-read assignment with an atomic current-stock reservation. The second compares split writes with private preparation and revision-checked publication/discard, reporting conservation and aborted-effect history separately. No SQL isolation modes, real database rollback/recovery, retries, durability or idempotency are modeled. It remains outside published discovery. Consult the roadmap and actual code for remaining release gates. Do not describe planned features or unperformed checks as implemented.

The draft Timeouts & Retries topic at `/draft/topics/timeouts-retries` connects the separate Java model to strict APIs, eight editable scenarios, caller/queue/worker/attempt snapshot playback, Study and eight Practice questions. [HLD-18A](docs/work-items/HLD-18A.md) records the merged foundation; [HLD-18B](docs/work-items/HLD-18B.md) records actual integration verification. HLD-18C adds eight Java-targeted Guided checkpoints, inspectable Architecture and three manual Request sequences, completing its six core draft views; consult its work item for actual checks. Targets distinguish original request identity from actual attempt identity. Human/hosted/prerequisite review and publication remain pending. It models bounded backoff, seeded jitter, overall deadlines and a finite batch retry budget, with no cancellation, business-effect ledger, idempotency, actual network or durability guarantee. It remains outside published discovery; four modules remain published. Follow [the retry handoff](docs/TIMEOUTS_RETRIES_IMPLEMENTATION_PLAN.md) for the next contribution.

The owner considers **lld-with-ui the best existing project**. Use it as the primary product reference: shared module shell, hands-on operations, guided simulation, architecture/sequence diagrams, and design details. Other sibling repositories are secondary references. Their repository-specific agent rules do not automatically govern this repository.

## Read before working

1. Read `README.md`, `docs/PROJECT_PLAN.md`, and the current phase in `docs/ROADMAP.md`.
2. Read `docs/ARCHITECTURE.md` for code work; also read `docs/SIMULATION_SPEC.md` for experiments.
   Read `docs/EXPERIENCE_AND_QUALITY.md` for any frontend, API, or module work.
3. Read `content/CONTENT_SPEC.md` for lessons, questions, and case studies.
   Follow `docs/LEARNING_STANDARD.md` so each module can be understood and explained simply.
   Read `docs/RELEASE_ONE_BLUEPRINT.md` when changing a first-release module.
4. Inspect actual code, scripts, nearby tests, and `git status` before changing anything. The running implementation is evidence; resolve documentation drift explicitly.

## Work selection

- Follow the user's task. Otherwise choose the earliest unblocked roadmap item and complete its acceptance criteria.
- Make one bounded vertical contribution. Use `docs/templates/WORK_ITEM.md` when a task needs a written handoff.
- A lesson, simulator, API, and renderer must agree on IDs and capabilities. Missing capabilities must remain visibly unavailable.
- Add shared abstractions only when a concrete module needs them. The first slice must validate the architecture before bulk content production.
- Update the relevant roadmap row with status and evidence. `done` requires working artifacts and the applicable checks, not just scaffolding.
- Record consequential architecture changes in `docs/decisions/NNNN-short-title.md`: context, decision, alternatives, consequences, migration, verification. Create that directory when the first decision is recorded.

## Git workflow

- Create a fresh branch from current `main` for every distinct change or work item; never commit directly to `main`.
- Keep a PR focused, push the branch, and open a pull request targeting `main`.
- Run relevant local checks and wait for required CI checks to pass before merging. Address review feedback on the same branch.
- Squash merge completed PRs and delete their branches. Then update local `main` before starting the next change.
- Follow [CONTRIBUTING.md](CONTRIBUTING.md) for commands, PR content, and current checks. User instructions about whether to publish or merge a specific change still govern the task.

## Engineering rules

- Use stable semantic IDs, explicit schemas, and a single catalog source. Do not create separate hand-maintained frontend and backend topic lists.
- Java owns simulation behavior. React renders traces and controls playback; it must not manufacture outcomes or recompute authoritative metrics.
- Use virtual time and seeded randomness. No sleeping, wall-clock timing, external network calls, or shared mutable state inside a simulator.
- Label illustrative models and estimates. Never present a simulation as a measured production benchmark or claim to emulate a named database without specifying the modeled subset.
- Keep simulator inputs bounded and traces within declared limits. Reject unknown fields/types where they could silently change behavior.
- Preserve exact replay within a recorded model version. Do not promise replay across incompatible versions.
- Write original explanations and diagrams; cite primary sources for technical claims. Check license and attribution before copying any code or assets.
- Keep lessons usable with keyboard, mobile layouts, both themes, reduced motion, and a textual equivalent of diagrams.
- Keep secrets, generated build outputs, local IDE settings, and unrelated user work out of contributions.
- No new services, authentication, paid dependencies, cloud infrastructure, or AI tutor by default. Follow the documented phase and justify additions with a real requirement.

## Verification and handoff

Run the actual relevant commands once available. Required gates are listed in `docs/ROADMAP.md`; never report a proposed command as executed. Test simulator semantics and meaningful input changes, including failure conditions. Content checks must validate references, prerequisites, and publication capabilities, not just heading counts.

For UI changes, check the primary user flow, responsive behavior, focus, reduced motion, and loading/error/empty states. Report any verification you could not perform.

Finish with: what changed, which learning outcome it supports, checks and results, limitations, and the next unblocked work item. Update docs in the same change when contracts or behavior change. Commit, push, publish, and deployment follow the user's requested scope.
