# HLD-10C: Save a module for later without inventing learning progress

## Objective

A learner can save a concept, reopen its current explanation/experiment, and back up or restore
that reading list without changing their answers or marking the concept complete.

## Preconditions

- Baseline `34db246`: HLD-10B merged through PR #54; no open HLD PRs at task start.
- Fresh `feat/bookmark-learning-modules` from fetched `origin/main`; owner checkout's unrelated
  `output/` remains untouched. Previous goal turn made verified progress: PR #54 merged.
- Read current README, project plan, roadmap, architecture, experience/quality, learning standard,
  HLD-10 implementation instructions and contribution workflow; inspect actual shell, routing,
  answer store/recovery controls and LLD's home/learning-path reference.
- P2-04 is in progress; manual publication gates are unavailable. This independent navigation
  work does not change URL-shortener status or waive prerequisite review.

## Scope and design

Published modules share Save module/Module saved with pressed state. Home and header link to a
lazy Saved modules page. Current Java topic/case collections independently validate every
destination; draft/unpublished, pending and failed checks have no guessed link. Old bookmarks
show changed-content guidance. Counts describe saved references, not completed activities.

Use the separate versioned, bounded navigation envelope in
[decision 0018](../decisions/0018-local-module-bookmarks.md). Exports/imports and confirmed reset
are expressly bookmarks only. Existing answers and their backup format remain unchanged.
One shared JSON-download helper now serves both real backup consumers.

## Acceptance

1. Visiting home, a module or `/bookmarks` with no saved state creates no answer/bookmark write.
2. Published module save/remove retains button focus/pressed state, survives refresh, and opens
   its current module by keyboard. A draft has no save control and cannot appear as a saved link.
3. Save alone does not create a Continue learning card or completion/answer evidence.
4. Actual answer bytes remain unchanged through bookmark backup, remove, preview/apply and reset.
5. Old content, removed IDs and partial catalog failure preserve the reading list/backup; successful
   independent collection entries stay usable and failed availability has explicit retry.
6. Strict file/envelope/count/UTF-8 bounds reject invalid data before mutation. Preview does not
   write; merge keeps local metadata; stale, forged/reused previews and observed external writes
   cannot replace current work.
7. Denied/quota/corrupt/unsupported storage keeps explicit changes in session with a visible warning,
   current/previous-data downloads and safe explicit retry; previous durable bytes stay untouched.
8. Reset defaults to keeping bookmarks, clearly names scope, and restores focus. Import/cancel and
   row removal also have stable keyboard destinations.
9. Both themes, reduced motion and 320/768/1440 layouts fit the list, tools and shared navigation;
   actual native 200% zoom preserves keyboard access and no overflow at 320/720 CSS pixels.

## Verification evidence

| Check actually run | Result | Artifact or reproduction |
| --- | --- | --- |
| Focused storage/component tests | PASS: 35 tests | `/tmp/hld-bookmarks-unit.log` |
| Full frontend contracts/type/lint/format/unit/build | PASS: unchanged generated API types; 18 invalid-content fixtures; type/lint/format; 247 unit tests in 27 files; production build | `/tmp/hld-bookmarks-contracts.log`, `/tmp/hld-bookmarks-quality-final.log`, `/tmp/hld-bookmarks-all-unit-final.log`, `/tmp/hld-bookmarks-build.log`; final browser startup builds the production assets |
| Real Java browser bookmark journeys | PASS: 7 tests; save/reload/keyboard, answer-byte preservation, backup/import/reset, stale/unpublished IDs, failed collections, denied/corrupt storage, both themes and 320/768/1440 layouts | `/tmp/hld-bookmarks-browser-final.log` |
| Native Chromium 200% zoom | PASS: 2 themed journeys; actual zoom/DPR/width, save/list/backup focus and no horizontal overflow at 320/720 CSS px alongside all modules and ten workshop stages | `/tmp/hld-bookmarks-native-zoom.log`; full CI rechecks the final head |
| Required full CI / launcher | Recorded on the contribution PR; must pass before merge | GitHub Quality and Browser journeys checks |
| Real newcomer/screen-reader publication review | Not performed | Remains an open release gate |

## Visual evidence

Final real-Java captures cover two published modules and an unavailable imported reference,
with keyboard focus on shared navigation. The unavailable ID is secondary to its status heading.
Mobile and desktop in both themes were visually reviewed; this is not a screen-reader/newcomer review.

| Width | Light | Dark |
| --- | --- | --- |
| 320 CSS px | [Mobile](assets/hld-10c/bookmarks-320-light.png) | [Mobile](assets/hld-10c/bookmarks-320-dark.png) |
| 768 CSS px | [Tablet](assets/hld-10c/bookmarks-768-light.png) | [Tablet](assets/hld-10c/bookmarks-768-dark.png) |
| 1440 CSS px | [Desktop](assets/hld-10c/bookmarks-1440-light.png) | [Desktop](assets/hld-10c/bookmarks-1440-dark.png) |

## Handoff

P2-04 remains in progress. Module bookmarks complement saved-answer resume; they do not save a
tab, playground inputs, trace or playback position. Answer and bookmark backups are separate,
explicitly labeled documents. First-path navigation and explicit activity completion remain
pending; those are the next independent contributions. URL Shortener remains draft.

The owner requested commit/push/merge and then stopping on 2026-10-10. Deliver this contribution
after required CI passes; do not begin the next work item until the owner resumes.
