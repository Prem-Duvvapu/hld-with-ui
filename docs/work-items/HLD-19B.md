# HLD-19B: Explain repeated writes through an editable Java workbench

## Objective

A learner can compare the same calls under unprotected, split and atomic publication,
then explain a missing response, original receipt, race, payload conflict or expiry using
actual Java snapshots. Add the runnable draft without advertising unfinished Guided/design.

## Preconditions

- HLD-19A merged in PR #81, squash `bef3f52`; its pure model and nine golden pairs stay unchanged.
- The idempotency handoff freezes schema 1.0 / model 1.0.0 and the exact bounded program.
- Start from current main on `feat/idempotency-experience`; owner `output/` is unrelated.
- Follow ModuleShell, shared Study/Practice, tokens and saved-answer lifecycle.

## Scope

Strict descriptor/run API, Java-derived limits, canonical HTTP/generated/lazy contracts,
editable calls and ordered steps, initial/post-step playback, original Study and nine Practice
questions. One canonical draft topic and direct route; four modules remain published.
Guided checkpoints, Architecture and authored sequences are the next bounded contribution.

## Design

Server lookup uses the typed tenant/key pair; operationId only groups audited intent.
React selects complete returned snapshots and never computes model transitions or metrics.
Private work, append-only effects, active/expired key history, cached server receipts and
caller observations remain distinct. Equal-time actions retain authored order; no expiry
event is invented between actions. Explicit run captures input before asynchronous validation.
Meaningful edits leave previous results visibly stale; pending state locks mutation, and
transport errors retain inputs for explicit retry. See decision 0041 for the integration.

## Acceptance

- Nine descriptor inputs and HTTP outputs agree with the actual configured Java evidence.
- Closed parsing rejects malformed/coerced/unknown/duplicate input and bad complete programs.
- Shared request, whole-response and admission guards recover without changing model policy.
- Mode-only comparison and meaningful edits reach Java and alter actual execution.
- Keyboard step moves, initial/ordered snapshot playback, stale/pending/error/retry and shared
  Study/Practice/history/save behavior work through the real browser.
- Both themes, 320/768/1440 widths, reduced motion and actual native 200% zoom are checked.
- Copied jar delivers exact draft content and all nine model results outside the checkout.

## Verification evidence

| Actual check | Result | Evidence |
| --- | --- | --- |
| Configured GET descriptor authoring, then ordinary comparison | PASS: nine original presets, eleven Java-derived limits and explicit default | `/tmp/hld-19b-author.log`; actual `contracts/examples/idempotency-descriptor.json` |
| `./mvnw -B verify` | PASS: 979 discovered, 978 executed, one existing opt-in skip; sixteen added API/resource tests | `/tmp/hld-19b-java.log` |
| Final lesson package and API/content agreement | PASS: all eleven IdempotencyApiTest cases after final prose revision; jar repackaged | `/tmp/hld-19b-final-content-java.log` |
| Canonical generation, generated-file drift comparison and `npm run contracts:validate` | PASS: 1052 fixtures; eleven catalog identities, 76 questions, 56 checkpoints and ten workshop stages | `/tmp/hld-19b-generate-final.log`, `/tmp/hld-19b-contracts-validate.log`; generated HTTP/types/lazy schema matched the index |
| Frontend typecheck, lint, format and unit tests | PASS: full 856-test/87-file suite after input-label fixes; thirty affected shared Practice/page/Playground cases after the final shared-label/layout fix | `/tmp/hld-19b-fe-tests.log`, `/tmp/hld-19b-final-types.log`, `/tmp/hld-19b-final-lint.log`, `/tmp/hld-19b-final-focused.log`; required CI covers the final complete suite |
| Final production build and complete format check | PASS on the final source | `/tmp/hld-19b-build-verified.log`, `/tmp/hld-19b-format-release.log` |
| Plan, content, launcher syntax and whitespace | PASS: 131 docs, 689 local links, 59 curriculum IDs and eleven catalog identities; final content/prerequisite/capability validation | `node scripts/validate-plan.mjs`, `node frontend/scripts/validate-content.mjs`, `bash -n start.sh`, `git diff --check` |
| Real Java and production-browser flows | PASS: all 22 new journeys, including all nine exact Java runs and every initial/post-step snapshot; mode-only comparisons, meaningful edits, invalid order/focus, pending/error/explicit retry, saved-answer reload/history and hidden playback pause | `/tmp/hld-19b-browser-final.log` |
| Responsive/themes/reduced motion and native zoom | PASS: Playground/Study at 320/768/1440 in both themes; all three views at actual 200% zoom, physical widths 640/1440 and verified CSS widths 320/720 and doubled DPR; six responsive checks refreshed after the primary-button style change | `/tmp/hld-19b-browser-final.log`, `/tmp/hld-19b-visual-final.log` |
| Copied executable jar and failure harness | PASS: final exact draft content, all nine full model results, discovery exclusions and owned cleanup; twelve harness tests including missing/changed preset and altered snapshot rejection | `/tmp/hld-19b-runtime-final.log`, `/tmp/hld-19b-runtime-harness.log` |

The first frontend run exposed five unstable field names when help/error text entered a
label. Dedicated label spans and descriptions fix that without weakening the assertions.
Browser reload then exposed the same issue in shared Practice: saved text was durable but
could become part of its textarea's name. A focused restored-answer regression protects
that shared fix. Native zoom exposed implicit grid minimum sizing for long Practice
questions; bounded tracks, controls and word wrapping now keep the page within its viewport.
The final visual refresh also applies the shared primary-button style to the run action.

Agent visual review inspected the following intentional screenshots. These are review
artifacts, not proof of human newcomer or screen-reader review:

- [320 light](../evidence/HLD-19B/idempotency-320-light.png)
- [320 dark](../evidence/HLD-19B/idempotency-320-dark.png)
- [1440 light](../evidence/HLD-19B/idempotency-1440-light.png)
- [1440 dark](../evidence/HLD-19B/idempotency-1440-dark.png)

Required final-source CI and actual squash delivery are verified after push and retained
in the contribution PR's delivery record. A preview check does not prove hosted backend
freshness or publication. No replay version or original input/result pair changed.

## Handoff

Next unblocked contribution is HLD-19C: Java-resolved Guided checkpoints and inspectable
Architecture/manual sequences. Human newcomer/screen-reader, hosted freshness, prerequisite
release and publication review remain separate. No physical durability, SQL recovery,
automatic retry or external provider guarantee is modeled.
