# HLD-19C: Explain the boundary of an idempotent write

## Objective

A learner can predict what survives a lost response, crash, competing save or expired
key, inspect the exact Java state, then explain the mechanism and its limits to a teammate
or interviewer. Complete the existing draft's Guided, Architecture and Call sequence views.

## Preconditions

- HLD-19B merged in PR #82, squash `d25de1a`, after all three CI jobs passed on
  `1c91158` (run `44595024420`). That source passed 978 executed Java tests plus one
  opt-in skip, 863 frontend tests, 1052 contract fixtures and 266 browser journeys.
- Fresh branch `feat/idempotency-guided-design` starts from that main. Owner `output/`
  remains unrelated and untouched.
- Follow the frozen idempotency handoff, shared module/Guided lifecycle and learning standard.

## Scope

Eight Java-targeted checkpoints; inspectable architecture; three authored manual call
paths with 27 initial/post-step states; canonical selector contracts and compatibility;
saved-answer/history behavior; content, integration and browser checks. Content advances
to 1.1.0 while existing Practice identities and storage format remain unchanged.

The pure simulator, schema 1.0 / model 1.0.0, nine preset inputs and original result pairs
remain unchanged. Four modules remain published. This contribution does not publish the draft.

## Design

The existing closed step selector gains the actual idempotency outcome kinds. Java tests
resolve every target and verify its selected prefix, keeping current evidence separate
from later outcomes and whole-run summaries. React selects returned evidence; it has no
second simulation engine. Original manual paths are visibly authored illustrations and
their complete states are compared with Java. Inspectable ownership connects caller,
handler, private proposal, public ledger, retained result and response observation.

## Acceptance

- All eight stable targets resolve exactly once to their intended preset outcome.
- Missing responses, original receipts, split crash/save gaps, current-key rechecks,
  payload races, expiry equality and tenant/key scope have accurate prefix evidence.
- Canonical, Java and frontend selector families preserve old models and reject invalid
  or foreign targets at their applicable validation boundary.
- Guided requires an explicit reveal, preserves shared notes/reset/version/history,
  locks pending execution and withholds unsupported evidence on failure or mismatch.
- Three manual paths have exact Java-checked initial/post-step states, keyboard controls,
  focus recovery and full text equivalents; opening design views makes no simulation request.
- Six implemented tabs agree with catalog/content, saved links and copied-runtime delivery.
- Primary flows work at 320/768/1440, both themes, reduced motion and native 200% zoom.

## Verification evidence

| Actual check | Result | Evidence |
| --- | --- | --- |
| `./mvnw -B verify` | PASS: 997 discovered, 996 executed, one existing opt-in skip; eighteen new cases cover targets and teaching evidence | `/tmp/hld-19c-java.log` |
| Eight Guided targets and 27 manual states | PASS: typed complete states, exact serialized presence/absence, ordered step IDs, kinds and virtual times agree with actual Java | `IdempotencyGuidedCheckpointsTest` and `IdempotencyGuidedTargetTest` in the full Java run |
| Canonical generation and generated-file comparison | PASS: HTTP 1.14.0/types agree with the index; all six lazy descriptor exports remain unchanged | `/tmp/hld-19c-generate.log`, `/tmp/hld-19c-generated-drift.log`; `git diff --exit-code` for generated artifacts |
| `npm run contracts:validate` | PASS: 1070 fixtures; eleven catalog identities, 76 questions, 64 checkpoints and ten workshop stages | `/tmp/hld-19c-contracts.log` |
| Frontend typecheck and lint | PASS on the new views, compatibility and browser source | `/tmp/hld-19c-types-playback.log`, `/tmp/hld-19c-lint-playback.log`; final browser-source typecheck/lint also passed |
| Complete formatting and frontend unit suite | PASS: 927 tests / 90 files after the queued-tick fix | `/tmp/hld-19c-format-playback.log`, `/tmp/hld-19c-fe-tests-final.log` |
| Production build | PASS after the playback fix | `/tmp/hld-19c-build-final.log` |
| Real Java and production browser | PASS: all thirty scoped journeys, eight exact Guided prefixes, all 27 manual states, mismatch/pending/error/retry and saved-work/reset/version/history | `/tmp/hld-19c-browser-final.log` |
| Responsive, keyboard, reduced motion and native zoom | PASS: all six views checked; new views at 320/768/1440 in both themes, manual focus recovery, actual native 200% zoom at CSS widths 320/720 with doubled DPR | `/tmp/hld-19c-browser-final.log`; six intentional review images below |
| Copied executable jar | PASS: exact new checkpoint content, draft discovery exclusions, all nine unchanged idempotency results and owned cleanup | `/tmp/hld-19c-runtime.log` |
| Plan, launcher syntax and whitespace | PASS: 133 docs, 703 local links, 59 curriculum IDs and eleven catalog identities | `node scripts/validate-plan.mjs`, `bash -n start.sh`, `git diff --check` |

The first typecheck found the new browser helper importing the existing display-label
module outside the explicit node-project file list; the file is now included and typecheck
passes. One resolver test needed final formatting. A formatting observation overlapped the
contract generator's intermediate output; generation and final checks were then run
sequentially. No application behavior or assertion tolerance was changed for those fixes.

The initial browser run passed 29 of 30 journeys, including both native-zoom flows, but
exposed a real queued playback tick during a tab change. Its trace shows the position
advancing after the Playground became hidden. A new regression invokes the already queued
callback after hiding, returning and restarting: it fails against the old implementation
and passes with the fix. Position, active-panel ownership, playing state and playback session
now update together; a stale callback checks that current ownership before applying a tick.
No Java behavior, model version or browser assertion tolerance changes.

The first desktop review images also showed sticky navigation stitched across a tall panel.
Capture now starts at the document origin and uses a full-page screenshot, preserving the
real fixed/sticky positions. This is a capture correction, with no production layout change.

Final frontend and all thirty scoped browser checks passed; refreshed images were visually
inspected. Required final-source CI remains the merge gate; its actual source/job results
and squash delivery will be retained in the contribution PR. No preview check proves
hosted backend freshness or human publication review. Regression evidence:
`/tmp/hld-19c-race-before.log` (expected failure), `/tmp/hld-19c-race-after.log` (PASS),
`/tmp/hld-19c-browser.log` (initial 29 passes / one playback failure).

## Intentional visual evidence

Agent review inspected these final actual-browser images. This is not human newcomer or
screen-reader review. Mobile architecture/sequence and desktop Guided were also checked
in the browser; their routine artifacts remain in ignored test results.

- [Guided, 320 light](../evidence/HLD-19C/idempotency-guided-320-light.png)
- [Guided, 320 dark](../evidence/HLD-19C/idempotency-guided-320-dark.png)
- [Architecture, 1440 light](../evidence/HLD-19C/idempotency-architecture-1440-light.png)
- [Architecture, 1440 dark](../evidence/HLD-19C/idempotency-architecture-1440-dark.png)
- [Call sequence, 1440 light](../evidence/HLD-19C/idempotency-sequence-1440-light.png)
- [Call sequence, 1440 dark](../evidence/HLD-19C/idempotency-sequence-1440-dark.png)

## Handoff

Human newcomer/screen-reader, hosted freshness, prerequisite release and publication review
remain separate. No physical durability, SQL isolation, actual network, automatic retry or
external provider guarantee is modeled. After this technical slice, the next composition
item is the bounded Notification Service workshop, following its prerequisite plan.
