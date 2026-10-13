# Work item: HLD-14C — explain delivery failures with selected Java evidence

## Objective

Complete the delivery draft's core teaching flow: predict a failure outcome, inspect its exact
message/attempt event, explain the independent broker/consumer/ledger state, then defend a choice.

## Preconditions

- Fresh `feat/queue-delivery-guided-teaching` from `1363cc6` (PR #67), clean implementation
  checkout, no open PR; owner `output/` preserved.
- PR #67 final-head CI passed on merge `3335f2f`, with 317 Java cases executed, 387 frontend
  units, 179 browser journeys, 20 UI performance and 20 reading-load groups, runtime/container,
  memory and launcher checks. New delivery remains draft.
- Project, architecture, simulation, content, learning and quality standards reviewed; LLD
  remains the primary product reference. Existing primary references support the unchanged model.

## Scope

Eight canonical Guided checkpoints; explicit message/attempt target family; typed Java/content
validation and numerical teaching tests; shared Guided adapter; authored Architecture and three
Message sequence paths; six-tab integration and saved checkpoint resume. No simulator behavior,
model/schema version, new services or publication change.

## Design

[Decision 0028](../decisions/0028-delivery-guided-message-attempt-targets.md) defines paired
semantic targeting, legacy compatibility and authored/live evidence boundaries. Root checkpoints
cover baseline effect-before-ACK, lost-ACK repeated work, crash-before cancellation, crash-after
preserved effect, early-ACK missing effect, deadline equality, effect-after-dead-letter and an
unobserved future effect at the virtual ceiling. No-recovery remains Playground/Practice coverage.

Use all preceding complete Java replacements to reconstruct selected state; do not shallow merge
omitted nullable fields or filter away unrelated world transitions. Reuse existing saved answer,
explicit run, preset reuse, pending reset/version and scoped error behavior. Static diagram
selection is a reading interaction; no Java POST or fabricated outcome follows it.

## Acceptance

- Exactly one closed selector family; reject incomplete/mixed delivery pairs, inconsistent IDs,
  unsupported kinds/occurrences and consumer/enqueue events without attempt capability.
- Existing cache/job JSON and teaching stay unchanged. Canonical generation has no drift.
- Every authored checkpoint resolves against its real Java preset and selected state, ledger,
  timestamps, independent lease/effect/ACK status and final/prefix populations agree.
- Six working views retain explicit run association, tab/history state and hidden playback pause.
  Missing targets show no unsupported explanation; reload restores reasoning without traces.
- Shared saved-answer lifecycle preserves predictions/choices, exact home resume and reset/version
  guards; it never reinstates deleted answers after a pending run.
- Architecture explains ownership and absent atomic/deduplication boundary. Baseline, lost-ACK and
  early-ACK/crash sequence paths provide keyboard selection and complete text equivalents.
- Real Java browser checks cover meaningful Guided evidence, all eight checkpoints, failures,
  reduced motion, focus, 320/768/1440 and both themes; all applicable gates pass before merge.

## Verification evidence

| Check actually run                            | Result                                                                                                                           | Evidence                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Baseline/branch/open PR inspection            | PASS: fresh branch from `1363cc6`, no open PR, owner output preserved                                                            | Git / GitHub at start                                                    |
| Java verify                                   | PASS: 332 discovered, 331 executed, one existing opt-in performance skip; 14 new methods                                         | `/tmp/hld-delivery-guided-java.log`                                      |
| Final Java package                            | PASS after prompt/lesson formatting                                                                                              | `/tmp/hld-delivery-guided-package.log`                                   |
| Contracts/content                             | PASS: 99 cases; seven canonical entries, 35 questions, 24 checkpoints, ten workshop stages                                       | `/tmp/hld-delivery-guided-contracts-final.log`                           |
| Full frontend gate                            | PASS: typecheck, ESLint, Prettier, 407 units and production build                                                                | Actual terminal gate; `/tmp/hld-delivery-guided-build-final.log`         |
| Real Java browser journeys                    | PASS: 25 cases, seven new Guided/concept journeys plus 18 retained delivery regressions                                          | `/tmp/hld-delivery-guided-browser.log`                                   |
| Copied jar                                    | PASS: exact delivered metadata/lesson/questions/checkpoints and both queue baselines, exclusions and cleanup                     | `/tmp/hld-delivery-guided-packaged.log`                                  |
| Independent semantic/content/lifecycle review | PASS: all eight selected states/numbers and three authored paths agree; null/malformed and legacy mixed-selector guards added    | Read-only cross-reviews; actual guard regressions                        |
| Plan/launcher/whitespace                      | PASS: 97 docs, 507 links, 59 curriculum IDs, seven catalog entries including screenshot links                                    | `node scripts/validate-plan.mjs`; `bash -n start.sh`; `git diff --check` |
| Required final-head CI                        | PASS: final head `e90e254`, tested merge `90011ae`, CI `38442615491`; 186 browser journeys plus 20 UI and 20 reading-load groups | [PR #68](https://github.com/Prem-Duvvapu/hld-with-ui/pull/68)            |

The first full frontend run exposed a Node `node:test` fixture accidentally discovered by
Vitest. It was renamed to the repository's `.fixtures.mjs` convention while remaining imported
by the 99-case Node contract gate; the actual frontend gate then passed all 407 app tests.
This fixes runner classification without skipping the capability checks. The first contract
drift attempt preceded staging intentional generated artifacts; staging resolved that check.

## Screenshots and limits

All three new views were checked at 320/768/1440 in both themes, with reduced motion,
keyboard operation and bounded page width. Representative actual screenshots were visually
inspected across desktop/mobile and both themes:

- [Guided desktop light](assets/hld-14c/delivery-guided-1440-light.png) and [mobile dark](assets/hld-14c/delivery-guided-320-dark.png).
- [Architecture desktop light](assets/hld-14c/delivery-architecture-1440-light.png) and [mobile dark](assets/hld-14c/delivery-architecture-320-dark.png).
- [Message sequence desktop light](assets/hld-14c/delivery-sequence-1440-light.png) and [mobile dark](assets/hld-14c/delivery-sequence-320-dark.png).

The other size/theme captures are retained alongside these. These checks are not human
screen-reader/newcomer review, real-device measurements or new-module native zoom evidence.
Hosted backend freshness and production capacity are not established by the local/CI artifact.

## Handoff

The implementation head `4f9befe` passed [CI run 38301128473](https://github.com/Prem-Duvvapu/hld-with-ui/actions/runs/38301128473),
including Quality, Browser journeys and Packaged runtime. Final evidence head `e90e254`
also passed CI `38442615491` on tested merge `90011ae`. PR #68 was squash merged as
`dc75e17` on 2026-10-13; its branch was deleted and owner main fast-forwarded. Local `/tmp` logs are transient;
[PR #68](https://github.com/Prem-Duvvapu/hld-with-ui/pull/68) retains final-head CI and delivery evidence.

Publication still requires human reviews, the first-release gate and published prerequisite
closure. Next: technical completion review of the delivery core, then the earliest required
storage/transaction prerequisite before executable idempotency protection. Keep the full requested
Notification/Rate Limiter/Chat/News Feed/Booking scope and its dependency graph intact.
