# Work item: HLD-14B — inspect delivery, acknowledgment and durable work

## Objective

Let a learner predict and inspect duplicate or missing work, connect broker acknowledgment
with an independent durable effect, and explain the application boundary requiring protection.

## Preconditions

- Fresh `feat/queue-delivery-draft-experience` from `c463716` (PR #66), with no open PR;
  owner checkout's unrelated `output/` is preserved.
- HLD-13A/B/C queue prerequisite and HLD-14A pure delivery model/contracts passed their
  technical gates. Both queue learning experiences remain unpublished.
- Project, architecture, simulation, quality, content and learning requirements reviewed.
  LLD remains the primary experience reference. Four primary delivery references reviewed
  on 2026-10-12; explanations, diagrams and numeric fixtures are original.

## Scope

Strict descriptor/run HTTP integration; generated API types and canonical runtime compatibility;
explicit draft React Playground/Study/Practice; returned broker/consumer/ledger playback;
editable model inputs; one worked lesson, eight Practice questions and four sources; real Java
browser checks and packaged artifact checks. No model behavior or versions change.

## Design

[Decision 0027](../decisions/0027-delivery-draft-experience.md) defines the draft and compatibility
boundary. Use nine Java presets: baseline, lost ACK, crash-before, crash-after, early ACK/crash,
exact lease deadline, overlapping attempts, virtual ceiling and no recovery. Java supplies all
metrics and typed entity changes. React replaces complete records by ID across every preceding
event, exposes text equivalents and independently displays lease/effect/ACK status.

Playground predictions remain page-local. Practice uses the existing saved-answer/backup
lifecycle and can resume its exact draft question from home. Runs remain explicit; hidden
playback pauses and stale inputs/results remain distinguishable. HTTP body/result/admission
guards apply with explicit recovery and no automatic retry.

## Acceptance

- Canonical catalog ID, descriptor, contracts, lesson and renderer agree; four published
  topics stay unchanged and the delivery draft remains excluded from discovery/search/path.
- Real HTTP presets match direct Java and the canonical baseline; strict malformed input,
  limits, concurrency, isolation and recovery preserve truthful errors.
- Lost ACK has two deliveries/two effects/ACK 155 ms; crash-before compares early loss with
  late-confirmation retry; crash-after retains the first effect; lease 100/101 ms differs.
- Overlap preserves a post-dead-letter effect; virtual/stall prefixes show unknown values
  and unavailable empty statistics without inventing completion.
- Playback applies complete entity replacements, clears omitted pointers, preserves all
  world changes under message focus, and never recomputes authoritative metrics.
- Meaningful input changes affect actual Java output. Validation focuses its invalid control;
  errors, loading and incompatible responses preserve input/prediction and permit explicit retry.
- Real browser checks cover keyboard, reduced motion, mobile/tablet/desktop, both themes,
  tab/history state and saved Practice resume. Human review remains explicitly separate.
- Relevant local gates and required final-head CI pass before squash merge.

## Verification evidence

| Check actually run                                    | Result                                                                                                                                            | Evidence                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Baseline/branch/open PR inspection                    | PASS: fresh branch from `c463716`, no open PR, unrelated owner output preserved                                                                   | Git / GitHub at start                                                                                              |
| Java verify                                           | PASS: 318 discovered, 317 executed, one existing opt-in performance skip; 12 new real HTTP cases                                                  | `/tmp/hld-delivery-ui-java.log`                                                                                    |
| Final Java package                                    | PASS after content formatting and new-source Java formatting                                                                                      | `/tmp/hld-delivery-ui-package-final.log`                                                                           |
| Generated contracts/content                           | PASS: 75 fixtures, seven catalog entries, 35 questions, 16 existing checkpoints, ten workshop stages                                              | `/tmp/hld-delivery-ui-contracts.log`                                                                               |
| Full frontend gate                                    | PASS: typecheck, ESLint, Prettier, 387 unit tests and production build                                                                            | Actual terminal gate; `/tmp/hld-delivery-ui-build.log`                                                             |
| Real Java delivery browser journeys                   | PASS: 17 cases, all nine presets, failure/limit contrasts, replacement/filter, explicit retry, history and exact saved-question resume            | `/tmp/hld-delivery-ui-browser.log`                                                                                 |
| Final primary-button/layout and lazy validation check | PASS: three cases; refreshed both-theme 320/768/1440 checks plus actual network proof that delivery validation stays absent on a published lesson | `/tmp/hld-delivery-ui-browser-final-layout.log`                                                                    |
| Copied jar/runtime content and canonical results      | PASS: both queue draft baselines, delivered lesson/questions, public boundaries and cleanup                                                       | `/tmp/hld-delivery-ui-packaged-final.log`; initial pre-format jar correctly failed byte comparison and was rebuilt |
| Runtime failure/ownership checks                      | PASS: six actual failure cases                                                                                                                    | `/tmp/hld-delivery-ui-runtime-failures.log`                                                                        |
| Independent semantics/content/contracts review        | PASS after timing-response correlation and scheduled enqueue labeling fixes                                                                       | Separate read-only agent reviews; all numeric lesson/question claims checked                                       |
| Plan/launcher/whitespace                              | PASS: 95 docs, 494 links, 59 curriculum IDs, seven catalog entries; launcher syntax and diff clean                                                | `node scripts/validate-plan.mjs`; `bash -n start.sh`; `git diff --check`                                           |
| Required final-head CI                                | Required before squash; actual head/run/results retained on the PR                                                                                | Quality, Browser journeys, Packaged runtime                                                                        |

Production output separates the delivery page (33.39 kB raw / 9.97 kB gzip at this build) and
canonical compatibility chunk (169.06 kB / 47.09 kB). The real network check verifies lazy
loading on the named published lesson; these sizes are build observations, not mobile speed
or heap/hosted-capacity measurements.

## Screenshots and review boundary

Actual completed Java flow captures are retained for [desktop light](assets/hld-14b/delivery-1440-light.png),
[desktop dark](assets/hld-14b/delivery-1440-dark.png), [mobile light](assets/hld-14b/delivery-320-light.png),
[mobile dark](assets/hld-14b/delivery-320-dark.png), [tablet light](assets/hld-14b/delivery-768-light.png)
and [tablet dark](assets/hld-14b/delivery-768-dark.png). Desktop/mobile images in both themes
were visually inspected; six-size/theme browser overflow and keyboard checks passed.
A screenshot is not a human screen-reader or newcomer teach-back review. Native zoom and
hosted-backend freshness were not verified for this new module.

## Handoff

This is a working vertical draft with three tabs, not complete delivery core teaching or a
published module. Next: HLD-14C, Java-verified Guided checkpoints and authored Architecture /
message sequence views, then technical review and the outstanding human/prerequisite gates.
Transactions, idempotency, retry amplification, notifications, chat, feed and booking remain
future contributions in their dependency order.
