# HLD-10E: Record reading and practice review separately

## Objective

A learner can explicitly record reading and reviews of their own reasoning without mistaking
visits, animation playback or revealed references for learning completion. Exact-answer evidence
helps them return to a changed assumption and explain it again after their reasoning changes.

## Preconditions

- Baseline `ff0c806`: HLD-10D merged as #56. Fresh `feat/explicit-learning-completion` from fetched
  origin/main; owner main has only unrelated `output/`, preserved. No pending HLD PRs at start.
- User resumed the broad module-completion goal; this closes an independent P2-04 progress slice.
- Read README, project/implementation/current roadmap plans, architecture, quality/learning
  standards, content specification, release blueprint and contribution/work-item instructions.
- Inspected current Practice storage/import controls, Java-resolved path metadata, nearby unit and
  browser journeys; use the established LLD-inspired shared module and path experience.

## Scope and design

- Explicit controls on published core path steps; separate reading/review counts.
- Strict bounded completion envelope, exact reviewed-answer snapshots, completion-only backups,
  full replacement preview/confirmation, module-scoped clear, session fallback and save retry.
- Existing Practice validation is exported and reused; answer storage shape/behavior is unchanged.
- ADR 0020 describes evidence semantics, conservative invalidation and import policy.
- No module publication, automatic grading, Java model/API changes, dependencies or new services.

## Acceptance

1. Visiting the path or saving/revealing an answer writes no completion record. Reference-only,
   empty, old-version, removed, wrong-kind and unknown-choice answers cannot be marked reviewed.
2. Explicit lesson reading and current-answer review actions persist separately across reload.
   Editing the text in the same millisecond, time, reference state, version or authored activity
   invalidates its old counted review. Draft steps never expose controls or destinations.
3. Backups preserve exact reviewed evidence and unknown historical IDs without inventing current
   counts. Reading/version counts and reviews remain distinct from saved-answer engagement.
4. Completion import previews name full replacement and current/incoming counts; Cancel preserves
   current marks and restores focus. Apply affects completion only. Stale/forged/other-tab previews,
   corrupt data, malformed/oversized files and failed imports preserve existing evidence.
5. Explicit module clear confirms the named scope, keeps other modules/answers/bookmarks and
   restores summary focus. Denied writes keep new session marks with download and retry; unsupported
   data/other-tab changes preserve prior raw bytes and never silently replace durable storage.
6. Both themes at 320/768/1440, reduced motion, keyboard and actual 200% zoom expose expanded
   controls with no page overflow. Manual human screen-reader/teach-back gates remain open.

## Verification evidence

| Check actually run | Result | Evidence |
| --- | --- | --- |
| Java `./mvnw -B verify` | PASS: 158 tests, packaged jar | `/tmp/hld-completion-java.log` |
| Frontend `npm test` | PASS: 273 tests in 29 files, including 12 completion/evidence and 3 new path interaction tests | `/tmp/hld-completion-unit.log`; final bound message recheck `/tmp/hld-completion-bounds.log` |
| Contract drift/content validation | PASS: generated types unchanged, 26 content fixtures | `/tmp/hld-completion-contracts.log` |
| Typecheck/lint/format/build | PASS; lazy path chunk 20.13 kB JS / 6.49 kB gzip, no new dependencies | `/tmp/hld-completion-type.log`, `/tmp/hld-completion-lint.log`, `/tmp/hld-completion-format-final.log`, `/tmp/hld-completion-build.log` |
| Real-Java path/completion journeys | PASS: 8 tests, including marks/reload/backup/edits and denied-write downloads | `/tmp/hld-completion-browser.log` |
| Native 200% zoom | PASS: 2 tests, both themes at actual 320/720 CSS widths, expanded reading/backup controls | `/tmp/hld-completion-zoom-final.log` |
| Screenshot refresh | PASS: both themes × 320/768/1440; expanded controls and explicit reading state | `/tmp/hld-completion-ui-final.log`; six images below |
| Plan/launcher syntax/diff checks | PASS: documentation/reference validator, `bash -n start.sh`, `git diff --check` | `/tmp/hld-completion-plan.log` |
| Guided resume followup | PASS: 3 repeated actual-Java journeys; typecheck/lint/format pass | `/tmp/hld-completion-resume.log`, `/tmp/hld-completion-followup-type.log`, `/tmp/hld-completion-followup-lint.log`, `/tmp/hld-completion-followup-format.log` |
| Required PR CI | Result recorded on the PR; all required checks must pass before merge | Exact contribution head checked before squash merge |

The first local native-zoom attempt was interrupted when concurrently packaging its running
Java jar caused runtime class-loading failures. Its test servers were explicitly stopped; the
rerun used the finished jar and passed both journeys. A first retry correctly rejected occupied
ports before cleanup. These failed attempts are not counted as passing checks. An initial
format check also found the browser file; it was reformatted and the final check passed.

Screenshots were generated again from the top of the page to avoid a full-page capture artifact
where a fixed offscreen skip link appeared at the previous scroll offset. This changes evidence
capture only. Mobile and desktop screenshots in both themes were visually inspected; the width
and focus assertions, rather than the images alone, verify interaction/layout behavior.

- [320 light](assets/hld-10e/learning-path-320-light.png)
- [320 dark](assets/hld-10e/learning-path-320-dark.png)
- [768 light](assets/hld-10e/learning-path-768-light.png)
- [768 dark](assets/hld-10e/learning-path-768-dark.png)
- [1440 light](assets/hld-10e/learning-path-1440-light.png)
- [1440 dark](assets/hld-10e/learning-path-1440-dark.png)

### Final-head CI resume precondition

The implementation head's CI run `38050168956` passed. Final documentation head `e491e6d`
failed one existing Guided resume test in run `38050213609`: after clicking Stale hit it typed
into the still-rendered Cold miss textarea before the router transition committed. The trace
has click completion at 45732 ms, fill start at 45735 ms, the previous heading in the fill
snapshot, and Stale hit committed after that fill. The saved resume target correctly resolved
the activity that actually received the text.

The test now waits for the selected Stale hit heading/focus before filling and checks the
actual durable `stale-hit-prediction` record before leaving. All original resume/history/focus
and no-automatic-run assertions remain. This strengthens the flow precondition and persistence
check without a production timing workaround or relaxed assertion. The focused real-Java
repeated verification and final CI result are recorded on the PR.

## Handoff and limits

Reading/reviews are self-reported, not proof of correct reasoning or whole-module/path mastery.
Marks can be recorded on published core path steps; optional Rate Limiter and draft workshop
remain outside these controls. Completion import intentionally replaces its separate envelope,
with confirmation, instead of merging marks. Backup includes reviewed-answer copies; retain the
answer backup separately. Review marks for changed/reset answers remain downloadable but do not
count. Actual deployed Java freshness and human prerequisite/publication reviews remain open.
Next unblocked first-release work: resource/admission hardening and clean-checkout runtime evidence,
while human screen-reader/newcomer reviews are obtained before URL Shortener publication.
