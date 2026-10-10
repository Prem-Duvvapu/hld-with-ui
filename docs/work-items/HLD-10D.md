# HLD-10D: Follow the first system-design learning path

## Objective

A new learner can find an approachable prerequisite order, choose the next exercise, and
connect their saved reasoning to current activities without invented completion claims.

## Preconditions

- Baseline `f32c516`: HLD-10C merged as #55; current main has no open HLD PRs.
- Owner explicitly resumed the broad goal. Previous delivery changed authoritative state;
  the intervening status-only turn added no implementation. Resume with the independent P2-04 path.
- Fresh `feat/first-system-design-path` from fetched origin/main in the existing Linux worktree.
  Owner checkout's unrelated `output/` is preserved.
- Read README/project plan, current roadmap/implementation instructions, architecture,
  experience/quality/learning standards, content specification, first-release blueprint and template.
  Inspect LLD's LearningPath as the primary product reference; no sibling rules inherited.

## Scope and design

- Packaged `learning-paths.json`, a closed schema, Java startup validation and read-only API.
- React lazy `/learning-paths/:id`, a home entry point, ordered steps/prerequisites and optional depth.
- Current catalog metadata and authored answer IDs/choice values define saved-work counts.
- URL Shortener remains a visibly unavailable upcoming path slot without a route; no publication.
- Existing answers/bookmarks, their backups, simulations and analytics collection remain unchanged.
- ADR 0019 records navigation suggestions and the distinction from completion evidence.

## Acceptance

1. Home Start learning opens the first path; returning users keep Continue learning and can open
   the path independently. Refresh and Back/Forward retain real destinations.
2. Java validates known unique IDs, bounded definitions and prerequisite order at startup; content
   validation rejects extra fields, malformed versions, missing/reordered/duplicate references.
3. Request Flow → Capacity → Cache → URL Shortener is authored once; canonical published metadata
   resolves titles/prerequisites/versions. The draft has no destination/activity metadata or link.
4. Optional published Rate Limiter depth stays outside the main path and has a real Study link.
5. Counts distinguish available steps, steps with current answers, and references viewed. Empty,
   old-version, removed-ID, wrong-kind and unknown-choice answers do not count as current answers.
   Earlier records remain downloadable; no page visit writes or automatically runs Java behavior.
6. Real answer edits/resets update the suggested first step without a current answer. This is
   navigation guidance; completion and mastery are not inferred.
7. Loading/error/retry/404/incompatible and empty-availability states are explicit; late responses
   cannot replace another route. Retry success restores stable heading focus.
8. Both themes, 320/768/1440 widths, reduced motion, keyboard and actual 200% zoom preserve access
   with no page overflow. Screenshots are review artifacts, not proof of human learning/accessibility.

## Verification evidence

| Check actually run | Result | Artifact |
| --- | --- | --- |
| Java verify | PASS: 158 tests, packaged jar | `/tmp/hld-path-java-full.log` |
| React tests | PASS: 257 tests in 28 files, including 10 new path tests | `/tmp/hld-path-unit-final.log` |
| Content validation | PASS: 26 invalid-content fixtures including 8 path fixtures | `/tmp/hld-path-contracts-final.log` |
| Frontend typecheck/lint/format/build | PASS; path is a lazy 7.30 kB JS chunk (2.80 kB gzip), existing production bundle builds | `/tmp/hld-path-type-final.log`, `/tmp/hld-path-lint-final.log`, `/tmp/hld-path-format-check.log`, `/tmp/hld-path-build-final.log` |
| Real Java path browser journeys | PASS: 6 tests; OpenAPI response, home/Study/history/refresh, actual answer/export, older/removed/reference-only evidence, retry/404, both themes × 320/768/1440 | `/tmp/hld-path-browser-final.log`; full CI rechecks final test refinements |
| Native Chromium 200% zoom | PASS: 2 tests; actual zoom/DPR/320/720 CSS px, path/optional keyboard focus and no overflow alongside existing module/workshop/resume/bookmark flows | `/tmp/hld-path-zoom.log` |
| Required full CI / launcher | Recorded on the contribution PR; must pass before merge | GitHub Quality and Browser journeys |
| Real newcomer/screen reader and workshop publication | Not performed; release gates stay open | URL_SHORTENER_PUBLICATION_REVIEW.md |

## Required-CI follow-up

Initial CI `38047895391` passed Quality and 123/125 browser tests, but did not pass the required
browser gate. Its trace shows the resume test pressed Back immediately after the URL changed,
before the intermediate checkpoint rendered; it now asserts Warm hit heading focus first.
The search check sampled card/action rectangles in separate browser tasks during scrolling;
it now samples both together and retains both original containment assertions.

Inspection also found a real Guided control bug: Next/Previous updated local state while router
selection still governed the displayed checkpoint. All three selection controls now use one
function that updates the actual checkpoint URL. A router-backed component test and the existing
real-Java history browser journey assert next/previous destinations, heading focus, unchanged
answer bytes and no automatic Java run. No production focus assertion or layout requirement was
removed. Follow-up local checks passed: 10 Guided component tests, typecheck/lint/format, and all 9
repeated real-Java browser checks (three runs each of Guided history/Next/Previous and the two
search themes). Artifacts: `/tmp/hld-path-guided-unit.log`, `/tmp/hld-path-ci-fix-type.log`,
`/tmp/hld-path-ci-fix-lint.log`, `/tmp/hld-path-ci-fix-format-check.log`,
`/tmp/hld-path-ci-fix-browser.log`. Passing follow-up CI is still required before merge.

## Visual evidence

Six captures from the successful Java-backed browser run show the unavailable workshop slot,
actual zero saved-answer count, prerequisites, optional depth and visible keyboard focus.
Mobile and desktop in both themes were visually inspected. This is not a real screen-reader or newcomer review.

| Width | Light | Dark |
| --- | --- | --- |
| 320 CSS px | [Mobile](assets/hld-10d/learning-path-320-light.png) | [Mobile](assets/hld-10d/learning-path-320-dark.png) |
| 768 CSS px | [Tablet](assets/hld-10d/learning-path-768-light.png) | [Tablet](assets/hld-10d/learning-path-768-dark.png) |
| 1440 CSS px | [Desktop](assets/hld-10d/learning-path-1440-light.png) | [Desktop](assets/hld-10d/learning-path-1440-dark.png) |

## Handoff

P2-04 remains in progress. The first path is implemented; explicit activity completion is the next
independent contribution. Module-page path Previous/Next navigation is also future work.
First-release release reviews, workshop publication, hosted backend freshness, and the requested
Queues/Retry/Idempotency plus Notification/Chat/Feed/Booking breadth remain outstanding.
