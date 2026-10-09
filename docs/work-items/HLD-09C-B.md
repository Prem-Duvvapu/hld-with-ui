# HLD-09C-B: published workshop discovery

## Objective

Let learners find an approved design workshop alongside foundation modules, using the canonical publication state rather than a frontend list. This connects concepts to a design exercise once its publication gates pass.

## Preconditions and scope

- Fresh `feat/published-workshop-discovery` from `902dfe5` (merged PR #48); 133 Java, 174 frontend and 95 browser tests passed in that CI run.
- Four published topics and the ten-stage draft URL-shortener resource. Owner worktree has unrelated `output/`, preserved.
- HLD-09C discovery is an independently verifiable technical contribution. Manual prerequisite/accessibility/newcomer gates and hosted-backend freshness remain open.
- Add one Java collection route, OpenAPI/generated types, an independent home section and relevant tests/docs. No content/model version, simulation, answer storage, dependencies or infrastructure change.

## Design and acceptance

- `GET /api/v1/case-studies` selects metadata from startup-validated loaded workshops, includes only `published` entries and sorts by canonical order then ID. It returns `[]` for the actual current catalog.
- Draft detail access remains available; planned cases are not loaded/delivered. Published cases never become topics.
- The home section uses existing card/theme/focus styles and generic case links. It describes guided design rather than executable shortening. Empty discovery hides the section; scoped loading/error/retry leaves foundation modules usable.
- Browser positive coverage explicitly mocks published collection metadata. Clicking the card loads the real Java draft detail and draft notice. This verifies the renderer without changing publication status or claiming hosted publication.
- [Decision 0014](../decisions/0014-published-case-discovery.md) records the boundary and compatibility behavior.

## Verification evidence

| Check actually run | Result | Evidence |
| --- | --- | --- |
| Focused Java | Passed: eight tests | Published, draft and planned resource behavior, detail vs discovery, real Spring collection routing and structured detail failures |
| Full Java verify | Passed: 135 tests, no failures/errors/skips | Java 17, packaged content/jar rebuilt; `/tmp/hld-discovery-java-verify.log` |
| Full frontend tests | Passed: 177 tests in 22 files | New metadata links, honest empty collection and recoverable failure; existing module/answer regressions retained |
| Contracts | Passed | Canonical content and negative fixtures; TypeScript regenerated from the additive OpenAPI route |
| Typecheck / lint / format / production build | Passed | The initial browser-test `replaceAll` was incompatible with the test compiler library; changed to the repository's split/join pattern and reran typecheck/build successfully |
| Browser discovery | Passed: four journeys | Real empty Java response validates against OpenAPI; six width/theme presentation combinations, reduced motion, keyboard card navigation and real draft detail; independent loading/503/keyboard retry then working foundation navigation |
| Agent visual inspection | Passed for two representative captures | 320 light and 1440 dark: readable cards, visible focus, no page overflow. Not manual review of all views or a screen-reader journey |
| Plan / whitespace / generated drift | Passed | 59 docs, 277 local links, 59 curriculum IDs and five catalog identities; clean diff; contracts regeneration matched the staged generated types |
| Full required CI | Passed before merge | [PR #49 CI](https://github.com/Prem-Duvvapu/hld-with-ui/actions/runs/37977329175) passed 135 Java, 177 frontend and 99 browser tests plus launcher smoke; merged as `15d8fa4`. Local results above do not claim the full browser suite ran locally |

## Presentation evidence

These six screenshots use explicitly mocked published discovery metadata from the real draft resource. They prove presentation, not publication. The draft stays outside actual discovery.

| Width | Light | Dark |
| --- | --- | --- |
| 320 | [image](assets/hld-09c-discovery/workshop-discovery-320-light.png) | [image](assets/hld-09c-discovery/workshop-discovery-320-dark.png) |
| 768 | [image](assets/hld-09c-discovery/workshop-discovery-768-light.png) | [image](assets/hld-09c-discovery/workshop-discovery-768-dark.png) |
| 1440 | [image](assets/hld-09c-discovery/workshop-discovery-1440-light.png) | [image](assets/hld-09c-discovery/workshop-discovery-1440-dark.png) |

Reproduce with `(cd frontend && npm run e2e -- --project=chromium e2e/workshop-discovery.e2e.ts)` after packaging Java.

## Handoff and limits

Published-workshop discovery is implemented; URL Shortener remains draft. An older deployed Java artifact lacks the new collection route and shows a recoverable workshop error while topics remain usable. Hosted Java deployment freshness is still tracked in [the incident record](../INCIDENTS.md). Real screen-reader/newcomer evidence and broader manual review remain open. Next unblocked contribution: finish stage/answer/source consistency review and its technical publication checklist; do not publish based only on ten headings or this renderer.
