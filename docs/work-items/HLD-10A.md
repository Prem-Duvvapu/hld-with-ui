# HLD-10A: find a published explanation

## Objective

Help a learner find a concept such as stale reads or token buckets without knowing its module title, then open the relevant lesson or published design stage. This is the search portion of HLD-10; bookmarks/resume and the first-release path remain separate work.

## Preconditions and scope

- Fresh `feat/published-content-search` from `073d8cb` (PR #50): CI passed 142 Java, 177 frontend and 99 browser tests plus launcher smoke.
- Four published topics and ten authored draft URL-shortener stages. Publication/manual gates stay open; this independent search contribution indexes only published resources.
- Existing Java/React/OpenAPI pipeline, shared styles and API error/timeout behavior. Owner `output/` remains untouched.
- Add a Java search service/controller/contracts and a lazy React page/header link, tests and documentation. No simulation/model/content version, answer-store, dependencies, infrastructure or publication change.

## Design and acceptance

- Build a document list from the canonical Java catalog and packaged content at startup: topic lessons and workshop stages, including authored rubric/walkthrough narrative. Drafts/planned entries and learner answers are excluded.
- Search literal whitespace-separated terms, ignoring case/compatibility forms; every term must occur. Title before summary before body ranking, then canonical order/ID and authored stage order. No fuzzy/semantic matching claim.
- Validate 2–100 UTF-16 code units or blank, optional level/activity enums, and unknown/repeated parameters. Return at most 20 hits with the full match count; immutable returned list and bounded plain Unicode excerpts. Source formatting is not HTML execution.
- Link topics to Study and cases to stable stages. Future published-stage behavior uses an explicit unit mock; the actual workshop stays draft.
- Explicit form submission and URL refresh/history, preserved form focus, no-result/empty/loading/validation/error/retry, stale-draft notice and rejection of older responses. Ambiguous browser links require clearing instead of silently choosing one query.
- Preserve existing themes and header navigation; inspect mobile/tablet/desktop with reduced motion. See [decision 0015](../decisions/0015-published-content-search.md).

## Verification evidence

| Check actually run | Result | Evidence |
| --- | --- | --- |
| Focused Java | Passed: nine tests | Ranking/body terms, all-term/filter semantics, 25-match/20-return bounds, order, Unicode/literal punctuation, future stable-stage route and real packaged API/draft/invalid-filter behavior |
| Full Java verify | Passed: 151 tests, no failures/errors/skips | Latest stage narrative/order fixtures included; `/tmp/hld-search-java-verify.log` |
| Full frontend tests | Passed: 183 tests in 23 files | Explicit submit/focus, no blank request, unsubmitted clear, filters, no results, error/retry, ambiguous direct links and older response suppression |
| Typecheck / lint / format / production build | Passed | Initial RTL `exact` option was a test API mismatch and corrected; typecheck/lint/format passed on final files, and the final browser server built the production frontend successfully |
| Browser | Passed: five journeys | Final packaged-Java/production frontend run includes corrected card-action bounds, word-boundary excerpts and ambiguous-link reset; real contract, draft exclusion, keyboard/Study/history/reload, mocked failure/recovery and six width/theme combinations |
| Agent visual inspection | Passed for corrected 320 / 1440 in both themes | Result action lies inside its card; readable excerpts/controls/focus; full-page captures start at document top. Not a real screen-reader/newcomer review |
| Contract drift / plan / whitespace | Passed | Generated types match; 18 content fixtures passed. Final plan validation: 62 docs / 291 local links / 59 curriculum IDs / five catalog identities. Clean diff |
| Required CI | Passed on implementation commit `e73c2b0` | [PR #51 run 37990344060](https://github.com/Prem-Duvvapu/hld-with-ui/actions/runs/37990344060): 151 Java / 183 frontend / 104 browser tests and both launcher smoke scenarios; Quality, Browser journeys, security and Vercel preview checks passed. Final documentation commit must also pass required checks before merge |

Initial checks caught a literal-punctuation formatting bug, a loading-vs-completed test assertion, a numbered-tab test locator mismatch and a floating shared card action. Fixed the underlying formatting/layout issues and corrected the test assumptions before publication. Browser coverage now checks the action stays within its card at each width/theme.

## Presentation evidence

These final real-Java screenshots show search presentation, not release or workshop publication. Captures retain keyboard focus and native rendering; the viewport is returned to document top before a full-page capture.

| Width | Light | Dark |
| --- | --- | --- |
| 320 | [image](assets/hld-10a-search/search-320-light.png) | [image](assets/hld-10a-search/search-320-dark.png) |
| 768 | [image](assets/hld-10a-search/search-768-light.png) | [image](assets/hld-10a-search/search-768-dark.png) |
| 1440 | [image](assets/hld-10a-search/search-1440-light.png) | [image](assets/hld-10a-search/search-1440-dark.png) |

Reproduce: `(cd backend && ./mvnw -B verify)` then `(cd frontend && npm run e2e -- --project=chromium e2e/search.e2e.ts)`.

## Handoff and limits

Search is the first HLD-10 contribution. Catalog counts are match counts, not completed activities or mastery. Bookmarks, Continue learning and the first-release path remain pending. URL Shortener stays draft; real screen-reader/newcomer review and hosted-backend freshness remain open. An older backend lacks the endpoint and shows a recoverable search error while normal module links stay usable. Next independent work: bookmarks/resume; continue stage/answer/source publication review without waiving its manual gates.
