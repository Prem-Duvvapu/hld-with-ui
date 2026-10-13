# Work item: HLD-15B — Explain access paths and write rules from Java evidence

## Objective

Let a learner predict the work, reveal one exact Java outcome, explain why it happened, and
defend an access or uniqueness decision in a project discussion or interview.

## Preconditions and scope

Fresh `feat/data-access-guided-teaching` from PR #69 squash `4e2e740`. Eight checkpoints over
seven unchanged presets complete Guided alongside authored Architecture and Operation sequence.
The draft topic has six views. HTTP 1.6.0, content 1.1.0, unchanged model/schema 1.0.0/1.0.
Owner output assets are unrelated and preserved. No service/dependency or publication added.

## Design and acceptance

[Decision 0030](../decisions/0030-guided-data-access-outcome-targets.md) records the fourth
semantic target family. Checkpoints select actual ordered outcomes by operation ID and kind.
The final insert and query reuse one Java result. Guided shows selected-operation evidence,
never later outcomes or whole-workload totals as selected state. The shared saved-answer,
version, reset, pending, retry and exact resume lifecycle remains in use.

Authored views explain five logical responsibilities and baseline read / accepted insert /
rejected conflict paths. Numbers agree with Java fixtures; ordered text and native controls
make them usable without a diagram. They make no run and imply no timing or physical engine.

## Verification

| Check actually run                     | Result                                                                                                    | Evidence                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Java full verify                       | PASS: 384 discovered, 383 executed, one existing opt-in performance skip; 17 new cases                    | `/tmp/hld-15b-java.log`                           |
| Canonical generation/drift and content | PASS: 159 cases; eight catalog entries, 43 questions, 32 checkpoints, ten workshop stages                 | `/tmp/hld-15b-contracts.log`                      |
| Frontend                               | PASS: typecheck, lint, format, 497 units in 58 files, production build                                    | `/tmp/hld-15b-{type,lint,format,units,build}.log` |
| Real Java browser flows                | PASS: 29 journeys across data-access, delivery and capacity queues; seven new data Guided/design journeys | `/tmp/hld-15b-browser.log`                        |
| Mobile table correction                | PASS: both theme layout checks repeated at 320/768/1440 with actual keyboard horizontal scrolling         | `/tmp/hld-15b-table-browser.log`                  |
| Actual native 200% zoom                | PASS: both themes, all six data-access views, 1440/640 physical widths → 720/320 CSS widths               | `/tmp/hld-15b-zoom.log`                           |
| Copied jar runtime                     | PASS: actual canonical content, unchanged Java baselines, draft exclusions and owned cleanup              | `/tmp/hld-15b-packaged.log`                       |
| Documentation/launcher                 | PASS: 102 docs, 536 links, 59 curriculum IDs, eight catalog identities; shell syntax and diff whitespace  | `/tmp/hld-15b-final-plan.log`                     |

The first typecheck found two test typing issues: a widened delivery-kind literal and an
array iterator incompatible with the E2E TypeScript target. Corrected types/indexed iteration
passed subsequent checking. Review also corrected the cached-checkpoint browser assumption:
a new checkpoint still requires an explicit reveal click, which reuses the result without POST.
All eight actual targets were verified with exactly seven Java requests.

Screenshot review found cramped mobile table columns. A minimum table width inside the
existing focusable scroll region preserves readable values; keyboard scrolling is exercised.
Capture checks wait for native scrolling to finish before resetting it; both final capture
checks passed again (`/tmp/hld-15b-final-captures.log`). The correction changes
no Java outcome, counts or saved-answer lifecycle.

### Technical teaching review

Independent Java, contract and frontend source reviews reconciled all eight targets,
2/6/12-entry contrasts, 12→13 populations, conflict b2, 1/1/1 maintenance and b2,b5,b3 ordering.
Authored views correctly describe a derived ordered view, request-local state and sequential
write rules. The original lesson retains teammate/interview prompts, follow-ups, a wrong
explanation, self-checks and seven primary resources. Three outcome kinds have authored
checkpoints; ID lookup remains available in Playground/Practice. No false all-kind checkpoint
coverage is claimed. This completes the bounded technical core; human release review is separate.

### Retained UI evidence

Actual captures after the mobile correction, covering reduced motion and keyboard focus:

- Guided: [desktop light](assets/hld-15b/data-access-guided-1440-light.png), [mobile dark](assets/hld-15b/data-access-guided-320-dark.png).
- Architecture: [desktop light](assets/hld-15b/data-access-architecture-1440-light.png), [mobile dark](assets/hld-15b/data-access-architecture-320-dark.png).
- Operation sequence: [desktop light](assets/hld-15b/data-access-sequence-1440-light.png), [mobile dark](assets/hld-15b/data-access-sequence-320-dark.png).

Local logs are transient; the PR/CI records provide durable revision evidence. Required
final-head CI must pass before squash. Automated zoom/screenshot checks are not human
screen-reader or newcomer teach-back evidence.

## Limitations and next work

The topic remains draft. Human newcomer/screen-reader review, physical-device
review and hosted backend freshness are separate gates. No transactions, concurrent write
guarantees, crash durability, index engine or idempotency were added. After reviewing this
core's technical evidence, the next prerequisite contribution is the transaction foundation.
Broader P3 foundations and requested service case studies remain pending.

Final local typecheck, changed-file lint and full frontend format checks passed after the
zoom and scroll checks were added. The six-view page chunk is 37.38 kB raw / 11.49 kB gzip;
these build sizes are not browser-load or production-performance measurements.

## Final delivery record

[PR #70](https://github.com/Prem-Duvvapu/hld-with-ui/pull/70) merged at
2026-10-13 19:28:44 UTC. Final head `ae9b2210b1710509921bbf57d29a938aeb94f331`
passed [CI 38453836517](https://github.com/Prem-Duvvapu/hld-with-ui/actions/runs/38453836517),
testing merge `13afc01`. All required checks passed: 383 executed Java cases plus one
existing opt-in skip, 497 frontend units, 159 contract cases, 202 browser journeys,
20 UI performance and 20 lesson-load groups, copied jar/container, memory and launcher.
Squash commit `c4d5d008c0fc1670e35f5ec6992e81c0670b09bd`; owner main updated and
its unrelated output assets preserved.

## Hosted observation — release gate remains open

Read-only checks through the production frontend proxy at 2026-10-13 19:21–19:28 UTC
returned health 200 and the four published topics. The data-access descriptor returned
404 (`No simulation has id data-access-models`); its draft topic and delivery draft topic
returned 500. An unknown draft ID also returned 500, whereas current source/API tests
expect structured 404. This is a hosted compatibility failure: the backend does not serve
the current draft contract. Its exact deployed commit is unknown because health contains
no revision identifier. The verified jar/container evidence does not establish that hosted
deployment. Refresh and verify the Java deployment before claiming this draft works live;
keep its release gate pending. Transient observations: `/tmp/hld-hosted-check.json` and
`/tmp/hld-hosted-diagnostics.json`. No deployment or infrastructure change was performed.
