# HLD-09C-D: URL Shortener technical publication review

## Objective

Review the ten-stage workshop for accurate, simple explanations and reliable saved reasoning before publication. The owner requested completing URL Shortener review/publication and merging required pending PRs. Required human/prerequisite evidence cannot be manufactured.

## Preconditions and scope

- Fresh `fix/url-shortener-publication-review` from `ca82f74` (merged search PR #51).
- Four published concept modules, ten draft workshop stages, shared answer storage, Java catalog and authored walkthrough renderer already implemented.
- Owner `output/` remains untouched. No open PRs existed when checked during this contribution.
- Review stage/source contracts, correct learning inconsistencies, exercise every answer and diagram at supported presentation settings, record exact remaining publication gates. No extra curriculum, dependencies or services.

## Changed behavior and learning outcome

- Align Requirements and Operations on one proposed correctness/latency objective and denominator; preserve independent estimator mean and p95 diagnostic meanings.
- State the authoritative expiry clock and decision point, with a slow-clock example and honest earlier-authorized response completion limit. Prose, invariant and walkthrough details agree.
- Content 1.5.0 preserves IDs/notes and requires fresh reference/self-check review. No Java simulation, teaching API or saved-answer schema change.
- Check all 64 stage answer records through export/reset/malformed-import/valid-import/reload. Extend native 200% zoom to every stage and walkthrough in both themes at 720/320 CSS pixels with keyboard focus, reduced motion, text equivalents and no page overflow.
- Record all fifteen primary-source checks, the stage review and executable human-review procedure in [the publication report](../URL_SHORTENER_PUBLICATION_REVIEW.md). See [decision 0016](../decisions/0016-workshop-eligibility-clock-and-objective.md).

## Verification evidence

| Check actually run | Result | Evidence |
| --- | --- | --- |
| Java verify | Passed: 151 tests | `/tmp/hld-url-review-java.log`; estimator, cache/queue/rate-limit transfer fixtures and typed workshop/API/startup guards |
| Frontend tests | Passed: 183 tests in 23 files | `/tmp/hld-url-review-frontend.log`; answer lifecycle, old content, errors and renderer/navigation |
| Contract/content checks | Passed: 18 negative fixtures | `/tmp/hld-url-review-contracts.log`; ten stages, references/prerequisites/capabilities and generated types |
| Final typecheck/lint/format/build | Passed | Final logs in `/tmp/hld-url-review-*-final.log`; final browser server built the production frontend |
| Browser review | Affected checks passed; full final CI required | First full attempt: 102 passed, two new-test errors and one interruption. Corrected navigation/title/assertion assumptions. Both broadened native zoom tests passed; final all-stage backup and two Operations/Defense tests passed (`/tmp/hld-url-review-browser-focused.log`, `/tmp/hld-url-review-answers-final.log`). No full local pass is claimed |
| Plan/whitespace/launcher | Passed | 65 docs / 304 links before four screenshot links; final validation recorded in PR. Clean whitespace diff; launcher smoke passed both cleanup/occupied-port scenarios |
| CI | Tracked in the contribution PR | Required Quality and Browser checks must pass on the final head before merge; the PR records the final run and results |
| Real screen reader / newcomer / prerequisite release review | Not performed or supplied | Publication remains draft; see report for precise procedure and evidence needed |

## Presentation evidence

Agent inspected these final browser captures. These are presentation evidence, not screen-reader/newcomer certification. Historical HLD-09B4 images remain untouched; ordinary test runs now write to per-test output.

- [Operations mobile light](assets/hld-09c-d/operations-320-light.png)
- [Operations desktop dark](assets/hld-09c-d/operations-1440-dark.png)
- [Defense mobile dark](assets/hld-09c-d/defense-320-dark.png)
- [Defense desktop light](assets/hld-09c-d/defense-1440-light.png)

## Handoff

Technical corrections/review support accurate teammate/interview explanations and preserve learners' notes. Publication is not a status-only change: the learning/quality standards and prerequisite release rows require real evidence. Keep catalog draft until those gates pass; then verify actual case home discovery/search as part of its focused publication PR. Hosted backend freshness remains unresolved separately. No work on bookmarks or later cases is included.
