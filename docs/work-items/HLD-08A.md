# HLD-08A: Save practice answers across reloads

## Objective

Let a learner return to their own explanation, compare it with the reference, and revise it over multiple sessions without losing it during navigation or refresh.

## Preconditions

- Main baseline `15719f6` (HLD-07C). Four Java-delivered modules and their shared Practice view are working.
- Read agent/contribution rules, project/roadmap, architecture, experience/learning standards, content specification, release blueprint, and HLD-08 delivery requirements.
- Inspected LLD's local-progress hook and export utility as a product reference. HLD uses its own strict schema and recovery rules.
- Fresh branch `feat/saved-practice-answers`, isolated Linux worktree. Owner's untracked `output/` and sibling DSA handoff work remain untouched.

## Scope

- One storage adapter and one real consumer: shared Practice answers across the four existing modules.
- Store text/choice, reference-view state, stable identity, content version, and update time.
- Add save/failure status, previous-version review, answer downloads, and exact previous-data download when preservation is needed.
- No API or simulation/model version changes. Guided predictions, workshop drafts, imports/reset, bookmarks, and progress are later work.

## Design

See [decision 0008](../decisions/0008-local-practice-answers.md). Browser storage is a local convenience, not an account or cross-device sync. Unknown records are retained, invalid data is never silently overwritten, and failed writes fall back to the session. Existing reference explanations remain editable alongside the learner's answer. Showing a reference with an empty explanation records only a reveal, not an attempted answer or completion.

## Acceptance

1. Choice and written answers survive tab changes, route changes, and reload.
2. Stored explanation revisions and reference state restore for the same content version.
3. Older-version answers remain visible; previous feedback does not silently become current review.
4. Denied storage and quota failures keep editing usable, show a warning, and offer a download.
5. Corrupt, unsupported, duplicate, or oversized data remains unchanged; the original is recoverable where readable.
6. Downloaded answers preserve semantic IDs, versions, Unicode, and reference-view state. Import remains visibly outside this slice.
7. Another tab's different-activity edits are preserved; detected same-activity conflicts stop durable writes.
8. Mobile themes, keyboard/focus, reduced motion, empty state, and failure states remain usable.

## Verification evidence

| Check actually run | Result | Evidence |
| --- | --- | --- |
| Targeted storage + Practice Vitest suites | Passed: 24 tests | `npm test -- src/features/learning/PracticeView.test.tsx src/features/learning/practiceStorage.test.ts` |
| Full frontend gate | Passed: 126 tests; contracts/type/lint/format/build | `npm run contracts:check`, `typecheck`, `lint`, `format:check`, `test`, `build` |
| Java verify, local Java 17 baseline | Passed: 96 tests, jar packaged | `./mvnw -B verify`; `/tmp/hld-08a-java-verify.log` |
| Plan/launcher syntax/whitespace | Passed: 43 docs, 147 links, 59 curriculum IDs, four catalog identities | `node scripts/validate-plan.mjs`, `bash -n start.sh`, `git diff --check` |
| New real-browser persistence cases | Passed: 12/12 | `npm run e2e -- saved-practice.e2e.ts`, isolated 18380/14373 ports |
| Full local browser suite | 69/70 first run; remaining capacity case passed isolated | Existing screenshot positioning assertion saw scrollY 84 instead of 0 under concurrent load; isolated rerun passed its screenshot, formula/history, and stale-input checks. No app or test changes made for this transient failure. Full CI result will be linked in the PR. |
| 320px and 1440px light/dark reduced motion and keyboard | Passed: both visual cases at both widths | Saved-practice browser checks; storage actions/cards readable, visible focus and no overflow. |
| Manual 200% zoom, screen reader, newcomer teach-back | Not performed | These remain release gates; automated checks are not substitutes. |

### UI screenshots

- [Mobile light](assets/hld-08a/saved-practice-mobile-light.png)
- [Mobile dark](assets/hld-08a/saved-practice-mobile-dark.png)
- [Desktop light](assets/hld-08a/saved-practice-desktop-light.png)
- [Desktop dark](assets/hld-08a/saved-practice-desktop-dark.png)

## Handoff

Next: HLD-08B, connect Guided predictions and add validated import/conflict preview and scoped reset. Search/bookmarks/progress and the URL shortener remain planned. Manual screen-reader/newcomer checks remain open release gates; no module is marked mastered or release-complete by this change.
