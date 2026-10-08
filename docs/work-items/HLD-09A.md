# HLD-09A: Draft URL-shortener Requirements stage

## Objective

Turn a vague short-link request into a brief that states required behavior, correctness, measurable assumptions, and non-goals. Compare an original attempt with a reasoned reference, then revise and retain the learner's explanation.

## Preconditions

- Baseline `db0225c` (HLD-08B, PR #41). Four published modules and shared answer lifecycle are working.
- Read repository contribution rules, project/roadmap, architecture, learning/content/experience standards, release blueprint, and HLD-09A plan. Reuse the LLD-inspired shared shell and attempt → compare → revise flow.
- Fresh `feat/url-shortener-requirements` branch in an isolated Linux worktree. Preserve the owner's untracked `output/` directory.
- Prerequisite modules exist; their outstanding manual release gates still prevent final workshop publication.

## Scope and design

- Add one canonical draft `url-shortener` case entry, authored resource, primary sources, strict JSON Schema/OpenAPI, generated types, Java delivery, and a lazy direct route.
- Complete Requirements: original draft → reveal → self-check → separate revision → reload/export/import. Reuse the existing bounded answer adapter and lifecycle controls.
- Discuss create/resolve behavior, ownership, expiry on cached reads, uncertain create retries, illustrative traffic/service objectives, abuse policy, non-goals, and changed-condition follow-ups.
- Link to real capacity, cache, and request-flow modules with exact preset instructions. No automatic input transfer or invented experiment.
- Keep the workshop draft and outside published discovery. No shortening API, destination fetching, storage service, new dependency, or simulated architecture.
- See [decision 0010](../decisions/0010-draft-workshop-content-and-answers.md).

## Acceptance

1. Java serves the versioned draft by explicit case ID; unknown/planned/topic IDs return structured 404. Published topic discovery still returns four topics.
2. Startup/content checks reject wrong versions/IDs, bad paths, missing sources, unavailable experiment links, duplicate/oversized activities, and premature publication.
3. Learners can write an attempt, read the reference without a mandatory answer, self-check, and revise. The original remains visible; viewed-only and attempted states are distinguished.
4. Reload and backup round trips retain attempts, revisions, self-checks, and review metadata. Older versions require fresh review. Denied/full storage keeps reading usable with an honest notice.
5. Page supports direct refresh, history, one real shell view, loading/error/retry/404, both themes, mobile, keyboard and reduced motion. Personal notes stay out of requests and URLs.
6. Requirements and source claims are original, scoped, and aligned with implemented modules. Remaining nine stages and manual review stay visibly unfinished.

## Verification evidence

| Check actually run | Result | Evidence |
| --- | --- | --- |
| Contract/content negative fixtures | Passed: 8 | Publication, version, sources, missing experiment, duplicate stages, activity bounds, unknown fields, cross-case path |
| Java | Passed: full 108 tests, then final 14 focused tests after two guard regressions were added | `./mvnw -B verify`, then scoped verify/package; final suite contains 110 tests for CI. Packaged resource equals authored content. |
| Frontend | Passed: 168 tests plus types/lint/format/content/generated drift and production build | Full frontend gate; final nine workshop/page unit tests include full-store reference reading and older content. Lazy workshop route: 7.77 kB JS / 2.89 kB gzip, plus 2.42 kB CSS / 0.76 kB gzip (build artifacts, not runtime benchmarks). |
| Real-Java browser journeys | Passed: full 85/85, including six new cases | Requirements lifecycle, HTTP schema, errors/history, backups, 320/768/1440 × light/dark, keyboard/reduced motion. Final metadata guard also passed targeted units/type/build; full PR CI verifies the committed revision. |
| Plan, whitespace, launcher syntax | Passed | `node scripts/validate-plan.mjs` (47 docs, 175 links, 59 curriculum IDs, 5 catalog identities), `git diff --check`, `bash -n start.sh scripts/start-smoke-test.sh`; actual smoke passed both scenarios: Ctrl+C stopped all six descendants/released ports; occupied frontend port preserved the unrelated process. |
| Manual 200% zoom, screen reader, newcomer teach-back | Not performed | Remain release/publication gates |

### UI evidence

| Flow | Mobile light | Mobile dark | Desktop light | Desktop dark |
| --- | --- | --- | --- | --- |
| Draft and invariant | [320px](assets/hld-09a/workshop-320-light.png) | [320px](assets/hld-09a/workshop-320-dark.png) | [1440px](assets/hld-09a/workshop-1440-light.png) | [1440px](assets/hld-09a/workshop-1440-dark.png) |
| Self-check and revision | [320px](assets/hld-09a/workshop-review-320-light.png) | [320px](assets/hld-09a/workshop-review-320-dark.png) | [1440px](assets/hld-09a/workshop-review-1440-light.png) | [1440px](assets/hld-09a/workshop-review-1440-dark.png) |

Screenshots inspected at mobile/desktop in both themes. Interaction evidence comes from the browser journeys, not the screenshots alone.

## Handoff

Next: HLD-09B, a bounded Estimates/API stage contribution using the real capacity estimator and explicitly specified create/redirect semantics. Nine stages remain planned: estimates, API, data, baseline architecture, flows, evolution, failures, operations, defense. HLD-09C adds published-case discovery derived from Java/the canonical catalog and publishes only after the full journey and prerequisite release gates pass. Search/bookmarks/resume remain future work.
