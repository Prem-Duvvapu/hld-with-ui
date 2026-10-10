# HLD-10B: Continue saved reasoning at its authored activity

## Objective

A returning learner can reopen a saved explanation, cache prediction or URL-shortener design
stage, compare it against the current lesson, and revise it without hunting through modules.

## Preconditions

- Baseline `7521473`: four published modules, ten draft workshop stages, HLD-08 answer lifecycle
  and HLD-10A published search. No open HLD PRs at the start.
- P2-04 is in progress. Workshop publication/newcomer/screen-reader evidence stays open;
  this navigation work is independent of publication.
- Fresh branch `feat/resume-saved-learning`; owner checkout's unrelated `output/` preserved.
- Read README, project plan, current roadmap, architecture, experience/quality, learning standard,
  implementation/handoff plans, actual shell/answer consumers and nearby tests.

## Scope and design

Home leads with Continue learning when meaningful local work exists. Its card checks current
Java-delivered content before offering the actual Practice question, Guided checkpoint or
workshop stage. Other saved modules can be selected. No stored text appears in URLs or requests.

Use the existing version-1 store and 200-record/256-KiB backup bounds. No visit state, completion
counter or mastery score is added. Current references and outcomes stay authoritative; restored
Guided predictions need an explicit run to load Java evidence again.

Current authored IDs determine routes. A removed activity offers its current module; a removed
module has no guessed link. Old content remains visible with fresh-review guidance. An existing
saved draft can resume its labeled direct route without changing catalog/search publication.
The existing safe backup/import/reset controls remain available, including corrupt-data download
and visible session-only warnings. A reset that removes the card restores keyboard focus.

See [decision 0017](../decisions/0017-resume-recorded-learning.md).

## Acceptance

1. Opening home or a question with no answer creates no progress/write.
2. A saved explanation resumes its actual question and focus; refresh preserves the selector.
3. An Operations draft answer reopens Operations and stays absent from public case discovery/search.
4. A stale-hit prediction resumes that checkpoint after reload/Back; no automatic simulation POST.
5. Old content, removed activities/modules and late responses preserve records and honest routes.
6. Backend failure exposes retry without disabling ordinary browsing; storage failure/corruption
   exposes backup/recovery without replacing previous data.
7. Downloaded backup matches stored answers; confirmed reset affects only its named module and
   restores focus if navigation controls disappear.
8. Card/selector/backup controls fit 320/768/1440 CSS pixels in both themes with reduced motion.
9. Actual native 200% browser zoom preserves the resume link, backup keyboard flow and no overflow
   at 320/720 CSS pixels in both themes, alongside the four modules and ten workshop stages.

## Verification evidence

| Check actually run | Result | Artifact or reproduction |
| --- | --- | --- |
| Java `./mvnw -B verify` | PASS: 151 tests, zero failures/errors/skips; packaged jar | `/tmp/hld-resume-java.log` |
| Frontend contract/type/lint/format/unit/build | PASS: unchanged generated API types, 18 invalid-content fixtures, type/lint/format, 212 unit tests in 25 files, production build | `/tmp/hld-resume-frontend-final.log`; production build also exercised by browser startup |
| Real Java browser resume journeys | PASS: 7 tests; exact question/stage/checkpoint, refresh/history/focus, no automatic run, safe backup/reset/recovery, both themes and 320/768/1440 widths | `/tmp/hld-resume-browser-final.log` |
| Native Chromium 200% zoom | PASS: 2 themed journeys; actual zoom factor/DPR/width verified, keyboard link/backup controls and no horizontal overflow | `/tmp/hld-resume-native-zoom.log`; test-generated JSON/screenshots |
| Required full CI | Recorded on the contribution PR; must pass before merge | GitHub Quality and Browser journeys checks |
| Real newcomer/screen-reader publication review | Not performed | Remains an open release gate |

## Visual evidence

The browser journeys capture the final card with a real Java-resolved draft title, a second saved
module and keyboard focus on its selector. Mobile and desktop captures in both themes were
visually inspected; these are responsive layout checks, not screen-reader or newcomer review.

| Width | Light | Dark |
| --- | --- | --- |
| 320 CSS px | [Mobile](assets/hld-10b/continue-320-light.png) | [Mobile](assets/hld-10b/continue-320-dark.png) |
| 768 CSS px | [Tablet](assets/hld-10b/continue-768-light.png) | [Tablet](assets/hld-10b/continue-768-dark.png) |
| 1440 CSS px | [Desktop](assets/hld-10b/continue-1440-light.png) | [Desktop](assets/hld-10b/continue-1440-dark.png) |

## Handoff

P2-04 remains in progress. Bookmark controls, the first-release path and explicit activity
completion evidence are still unimplemented. The latest saved reasoning is used; last visited
pages, simulation runs and playback positions are not persisted. URL Shortener remains draft.
Next independent work is bookmarks and the first learning path; publication needs the existing
manual/prerequisite review evidence in [the publication checklist](../URL_SHORTENER_PUBLICATION_REVIEW.md).
