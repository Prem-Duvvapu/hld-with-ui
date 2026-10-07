# HLD-08B: Restore learning answers and save Guided predictions

## Objective

Let a learner keep predictions and explanations across sessions, restore an answer backup without silently replacing newer work, and deliberately start a module's answers again.

## Preconditions

- Baseline `d94fd3d`, HLD-08A merged. Four modules and shared Practice persistence are working.
- Read repository rules, current plans/roadmap, architecture, simulation/content contracts, learning and experience standards, and decision 0008.
- New branch `feat/answer-import-and-guided` in an isolated Linux worktree. Owner's untracked `output/` remains untouched.

## Scope and design

- Extend the existing adapter with validated preview/apply, explicit conflict selection, scoped reset, and save recovery.
- Reuse schema/key version 1 for Practice and derived Guided prediction/tradeoff IDs. Validate ID collisions from authored content, preserving one catalog source.
- Share storage controls between Practice and Guided. Java still owns simulation behavior; saved answers never fabricate or automatically run a trace.
- Record [decision 0009](../decisions/0009-answer-import-and-guided-state.md). No backend/API/model or dependency changes.
- Fix a demonstrated tablet overflow in recovery actions and the repeated capacity screenshot-only scroll assertion. Calculator/formula/history assertions remain intact.

## Acceptance

1. Guided predictions/choices survive reload and route changes. Revealed evidence requires an explicit current Java run; no automatic POST on load.
2. Export/reset/import restores accepted Practice and Guided answers with IDs, versions, Unicode, and reference-view metadata.
3. Preview and cancel make no writes. Local nonempty conflict answers remain the default; imported alternatives require an explicit choice.
4. Malformed, unsupported, oversized, duplicate, or stale input leaves existing work unchanged. Different content versions never silently renew review.
5. Quota/access failures during import/reset produce no success message and preserve accepted memory/disk data; retry can recover when access returns.
6. Reset confirmation names the module and count; other modules/preferences remain. A saved-ID selector allows removal of retired-module answers when a full imported backup blocks new edits. A late Java response cannot recreate reset answers.
7. Accepted data stays bounded/exportable; over-limit edits are visibly refused without replacing existing accepted answers.
8. Actions have useful keyboard focus, responsive layouts, both themes, reduced motion, and clear empty/error states.

## Verification evidence

| Check actually run | Result | Evidence |
| --- | --- | --- |
| Targeted storage suites | Passed: 47 tests | Existing storage + `practiceStorage.lifecycle.test.ts` |
| Targeted Guided + Practice suites | Passed: 15 tests | Restoration/no auto-run, pending edit, reset-before-response, older content and existing Practice regressions |
| Full frontend gate | Passed: 159 tests, contracts/type/lint/format/build | `npm run contracts:check`, `typecheck`, `lint`, `format:check`, `test`, `build` |
| Java verify | Passed: 96 tests and packaged jar, local Java 17 baseline | `./mvnw -B verify`; `/tmp/hld-08b-java-verify.log` |
| Content validation and negative fixtures | Passed: real content, collision rejection, overlong activity rejection | `node frontend/scripts/validate-content.mjs`; isolated copies avoided changing live packaged content |
| Plan/launcher syntax/whitespace | Passed | `node scripts/validate-plan.mjs`, `bash -n start.sh`, `git diff --check` |
| Full real-Java browser suite | Passed: 78/78 before the final retired-module selector | Clean run against completed artifacts. A provisional run was discarded after a concurrent local jar rebuild interrupted class loading. Backend/preview artifacts were kept stable during the clean browser run; the final recovery edge is checked separately below and in PR CI. |
| New browser journeys | Passed: 9/9 across runs | Eight import/conflict/rejection/transaction/Guided Java/responsive keyboard journeys in the clean full run, plus one final retired-module recovery case (200 imported records → named reset → new answer → reload). Final suite contains 79 tests; full PR CI must pass before merge. |
| Launcher smoke | Passed: both scenarios | `bash scripts/start-smoke-test.sh`; Ctrl+C cleaned all six descendants and both ports; occupied frontend port preserved the unrelated process |
| Manual 200% zoom, screen reader, newcomer teach-back | Not performed | These remain release gates |

### UI screenshots

| Flow | Mobile light | Mobile dark | Desktop light | Desktop dark |
| --- | --- | --- | --- | --- |
| Import preview | [320px](assets/hld-08b/answer-import-320-light.png) | [320px](assets/hld-08b/answer-import-320-dark.png) | [1440px](assets/hld-08b/answer-import-1440-light.png) | [1440px](assets/hld-08b/answer-import-1440-dark.png) |
| Reset confirmation | [320px](assets/hld-08b/answer-reset-320-light.png) | [320px](assets/hld-08b/answer-reset-320-dark.png) | [1440px](assets/hld-08b/answer-reset-1440-light.png) | [1440px](assets/hld-08b/answer-reset-1440-dark.png) |

## Handoff

Next: HLD-09A, one draft URL-shortener Requirements stage with contract/API/route and saved answers. Publish the workshop only after its complete stages and release gates pass. Search/bookmarks/progress and workshop drafts remain planned; this contribution does not infer completion or close manual learning/accessibility review.
