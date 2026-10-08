# HLD-09B1: URL-shortener Estimates and API stages

## Objective

Turn a requirements brief into unit-aware estimates and an explicit create/redirect contract. Explain what changes when the workload changes, and defend expiry and uncertain-create behavior in a team discussion or interview.

## Preconditions

- Baseline `3ad489a` (HLD-09A, PR #42): four published modules, one draft workshop stage, strict Java delivery, and shared local answers.
- Read the project, architecture, simulation, learning, content, quality, and release specifications. Reuse the LLD-inspired shared shell and attempt → compare → revise interaction.
- Fresh `feat/url-shortener-estimates-api` branch in an isolated Linux worktree. Preserve the owner's unrelated `output/` directory.
- Prerequisite manual learning/accessibility gates remain open. The hosted Java backend was separately found to serve older content; see [incident record](../INCIDENTS.md).

## Scope and design

- Add original Estimates and API stages after Requirements, with primary citations, rubric criteria, and links to actual published experiments.
- Keep `url-shortener` draft, with content version 1.1.0 and unchanged schema/API contract. Preserve older answers while requiring fresh comparison and self-checks.
- Check worked numbers and changed assumptions against the actual Java estimator. The workshop explains estimates; the linked Calculator executes calculations.
- Use stable `?stage=` navigation, a single visible stage, previous/next actions, history, refresh, and stage-specific answer records. Preserve the shared storage lifecycle and keep personal text out of URLs/network requests.
- Define an illustrative API policy, including expiry, redirect caching, validation, error statuses, and bounded retry keys. No actual shortening endpoint or destination fetch is introduced.
- See [decision 0011](../decisions/0011-workshop-stage-navigation.md).

## Acceptance

1. Java delivers exactly Requirements, Estimates, and API at matching catalog/resource version 1.1.0; the case remains absent from ordinary published discovery.
2. Estimates state units, inputs, arithmetic, exclusions, and mean-concurrency limits. Peak, read ratio, and record size changes agree with Java semantics.
3. API content states create and redirect behavior, expiry/error policy, caching assumptions, and uncertain retry boundaries without presenting a real service or an exactly-once guarantee.
4. Stage links, direct URLs, refresh, Back/Forward, keyboard focus, and stage-specific attempts/revisions/checks work. Navigation does not invent completion or submit personal notes.
5. Existing old-version, denied/full storage, reset/import, loading/error/retry, mobile, themes, and reduced-motion journeys remain working.
6. Publication guards reject the incomplete seven-stage remainder and unresolved sources/experiments in later stages.

## Verification evidence

| Check actually run | Result | Evidence |
| --- | --- | --- |
| Java | Passed: full 116 tests; final six focused tests after preset-title review | `./mvnw -B verify` packaged the jar; `WorkshopEstimatesTest` verifies real preset values, authored arithmetic, sensitivity changes, publication refusal and API policy boundaries. Packaged JSON matches all three authored resources. |
| Frontend | Passed: 170 tests; contracts/generated drift, types, lint, format and production build | Full frontend gate. Workshop/page focused tests also passed 11/11. Lazy workshop JS: 9.49 kB / 3.41 kB gzip; CSS: about 4 kB / 1.1 kB gzip. Build sizes describe this artifact, not runtime performance. |
| Content negative fixtures | Passed: 10 | Incomplete publication, version, sources, dead experiments, duplicate/bounded activity IDs, unknown fields and resource paths; later API/Estimates stages checked too. |
| Plan, whitespace and launcher | Passed | `node scripts/validate-plan.mjs`: 50 docs, 194 links, 59 curriculum IDs, five catalog identities. `git diff --check`, launcher syntax, and actual smoke passed: Ctrl+C stopped all six descendants/released ports; occupied frontend port preserved the unrelated process. |
| Real-Java browser journeys | Passed: final 8/8 workshop journeys | The first run was interrupted by an environment restart. A full rerun passed 83/87 and exposed four stage-focus failures: animation-frame focus could run before router navigation committed. Focus now runs after the selected panel becomes visible; After fixing focus and wrapping API examples on narrow screens, all eight workshop journeys passed. The final typography/screenshot refresh also passed both theme journeys (2/2). The PR CI reruns the full suite on the committed revision. |
| UI review | Passed: responsive/theme/focus/reduced-motion flows | All three stages at 320/768/1440; inspected Estimates/API mobile/desktop screenshots in both themes. API examples wrap, and reference prose has a bounded reading width. |
| Manual 200% zoom, screen reader, newcomer teach-back | Not performed | Remain release/publication gates |
| Hosted backend | Failed before this contribution | Health 200; case endpoint 500; published topic versions still 1.0.0. Deployment access is unavailable in this environment. |

### UI evidence

| Stage | Mobile light | Mobile dark | Desktop light | Desktop dark |
| --- | --- | --- | --- | --- |
| Estimates | [320px](assets/hld-09b1/estimates-320-light.png) | [320px](assets/hld-09b1/estimates-320-dark.png) | [1440px](assets/hld-09b1/estimates-1440-light.png) | [1440px](assets/hld-09b1/estimates-1440-dark.png) |
| API | [320px](assets/hld-09b1/api-320-light.png) | [320px](assets/hld-09b1/api-320-dark.png) | [1440px](assets/hld-09b1/api-1440-light.png) | [1440px](assets/hld-09b1/api-1440-dark.png) |

Screenshots accompany interaction tests; they do not establish screen-reader or learning mastery evidence.

## Handoff

Next unblocked contribution: HLD-09B2, Data/Baseline/Flows:

1. **Data:** define code/target/expiry/takedown metadata, the unique code constraint and bounded collision retries, permanent non-reuse reservation, and caller/key/accepted-payload/result/deadline records. State the atomic write boundary needed for the API replay promise; no best-effort key cache can substitute for it.
2. **Baseline:** author a simple Client → Service → indexed Store architecture with protocol/ownership labels and an adjacent text equivalent. Keep the designed service distinct from this app's React/Java teaching API.
3. **Flows:** walk through create/commit/lost-response/replay, active redirect, expiry equality, unknown code, and dependency failure. Show causal failure branches and connect them to the API contract; do not invent executable traces or advertise a simulator.
4. Reuse current stage IDs/navigation/local answers, add original rubric/source content, verify every declared capability, and preserve draft status. Later cache evolution must explicitly reconcile expiry and immediate takedown with stale internal mappings.

 Seven stages remain: data, baseline, flows, evolution, failures, operations, defense. HLD-09C adds published-case discovery and publication after all required evidence. Hosted backend deployment must be checked independently of frontend deployment success.
