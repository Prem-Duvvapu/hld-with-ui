# HLD-09B2: URL-shortener Data, Baseline and Flows

## Objective

Help a learner explain who owns a short code, which writes must commit together, how a retained-key retry recovers an uncertain result, and why expired/unverifiable mappings cannot redirect. Make the same explanation usable in day-to-day design reviews and interviews.

## Preconditions

- Baseline `f28e55d` (PR #43): four published modules and three draft workshop stages.
- Fresh `feat/url-shortener-data-flows` branch in the isolated Linux worktree; preserve the owner's unrelated `output/` directory.
- Project, architecture, content, learning, quality, release and roadmap specifications inspected. LLD remains the product reference for diagrams and guided reasoning.
- Existing manual release gates and the hosted-backend [incident](../INCIDENTS.md) remain open.

## Scope and design

- Add `data`, `baseline`, `flows`, yielding six authored stages at content version 1.2.0. Keep draft status and exclusion from published topic discovery.
- Define permanent code reservations, immutable links and independently retained create results; bounded unique-insert collisions and one atomic commit. Pin primary references to PostgreSQL 16 mechanisms without installing/executing a shortening database.
- Add the simplest baseline participant walkthrough and separate create, active resolve, lost-response replay and expiry-equality paths. Explain conflict, pending deadline, exhausted collision, unknown code and unavailable dependency paths in prose.
- Add typed optional walkthroughs across canonical resources, schemas, OpenAPI, immutable Java delivery, generated types and validators. See [decision 0012](../decisions/0012-authored-workshop-walkthroughs.md).
- Render manual SVG selection, decision inspector and full text equivalent. Preserve original → compare → check → revise, stage-specific answers, keyboard/mobile/themes/reduced-motion behavior. No runtime outcomes, shortening endpoints, SQL execution or automatically inferred completion.

## Acceptance

1. Packaged Java delivers exactly six stages at matching version; missing diagrams on legacy stages remain usable; the draft remains undiscoverable as a published topic.
2. Diagrams have bounded arrays/text, unique IDs and valid participant references. Unknown authored fields and incomplete publication fail checks.
3. Code collisions never reassign ownership; reservations survive link cleanup; create/replay records commit together; recorded replay does not revive an expired/revoked link.
4. Active 302, expiry equality/unknown/revoked 404 and dependency 503 have distinct causal explanations. Store freshness does not overclaim concurrent takedown ordering.
5. Viewer controls, transcript, step positions, stage navigation, local answers and reload work with keyboard, both themes, responsive layouts and reduced motion. No POST of notes or viewer decisions.

## Verification evidence

| Check actually run | Result | Evidence |
| --- | --- | --- |
| Java full gate | Passed: 121 tests | `./mvnw -B verify` packaged the jar; final eight focused delivery/diagram checks also passed after introduction/catalog review. An initial content assertion used different wording for the same five-attempt bound; corrected to match the explicit policy. |
| Frontend focused tests | Passed: 11 | Workshop state and viewer tests |
| Content fixtures | Passed: 15 | Existing authoring/publication guards plus invalid endpoints, duplicate nodes/steps, unknown fields and step limits |
| Frontend full gate | Passed: 174 tests | Generated contracts, typecheck, lint, format and production build passed. Final viewer edits also receive scoped type/lint/unit/browser checks and full PR CI. Workshop chunk: 13.43 kB / 4.65 kB gzip before the final scroll handling; no runtime benchmark claim. |
| Real-Java browser and screenshots | Passed: 10 workshop journeys after grid fix; final two viewer journeys passed | The initial full run passed 85/89 and exposed page overflow when a grid auto track inherited the SVG minimum width. Explicit `minmax(0, 1fr)` confines scrolling to the diagram. Final review keeps the selected sender visible on narrow screens and preserves focus. Full PR CI runs all 89 journeys. |
| Plan and launcher | Passed | `node scripts/validate-plan.mjs`: 52 docs, 208 links, 59 curriculum IDs and five catalog identities; syntax, `git diff --check`, and real launcher smoke passed (all six descendants stopped, ports freed, occupied unrelated process preserved). |
| Manual zoom/screen reader/teach-back | Not performed | Remain release/publication gates |
| Hosted backend | Unresolved | Fresh Vercel-proxied topics/case requests each timed out after 15 seconds; this does not verify backend freshness or recovery. |

### UI evidence

| View | Mobile light | Mobile dark | Desktop light | Desktop dark |
| --- | --- | --- | --- | --- |
| Baseline | [320px](assets/hld-09b2/baseline-320-light.png) | [320px](assets/hld-09b2/baseline-320-dark.png) | [1440px](assets/hld-09b2/baseline-1440-light.png) | [1440px](assets/hld-09b2/baseline-1440-dark.png) |
| Flows | [320px](assets/hld-09b2/flows-320-light.png) | [320px](assets/hld-09b2/flows-320-dark.png) | [1440px](assets/hld-09b2/flows-1440-light.png) | [1440px](assets/hld-09b2/flows-1440-dark.png) |

Browser coverage checks 320/768/1440, both themes and reduced motion. Screenshots are inspected evidence of layout, not a substitute for screen-reader/teach-back review. Historical HLD-09B1 screenshots are preserved; routine browser runs now write that file's screenshots to test-results.

## Handoff

After this slice, four authored stages remain: Evolution, Failures, Operations, Defense. Next bounded contribution: HLD-09B3 Evolution/Failures; reconcile immediate revocation and expiry with internal-cache staleness before advertising an evolved success path. HLD-09C publication requires all ten stages and release evidence. Queues/retries/idempotency, foundations and remaining integrated cases remain part of the active goal.
