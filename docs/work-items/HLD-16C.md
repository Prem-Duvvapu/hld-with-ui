# Work item: HLD-16C — Predict, reveal and explain the reservation boundary

## Objective

Complete six core draft views around the reservation experiment, so a learner can identify a
stale observation, inspect the correct acceptance boundary and explain it to a teammate or
interviewer with selected Java evidence and clearly labelled authored diagrams.

## Preconditions

- Fresh `feat/reservation-guided-design` from PR #73 squash `2fc1816`.
- [HLD-16B](HLD-16B.md) final-head CI and core API/UI evidence passed; owner assets preserved.
- [Transaction plan](../TRANSACTIONS_IMPLEMENTATION_PLAN.md) freezes this bounded contribution.
- Required architecture, simulation, experience/content and learning standards reviewed.

## Scope

Eight Guided checkpoints over five existing Java presets; the concrete fifth closed stepId
selector with preserved legacy families; inspectable Architecture and three authored manual
Operation sequences. Topic content 1.1.0, HTTP 1.8.0, unchanged model/schema 1.0.0/1.0.
Only the existing catalog-owned draft receives Guided/checkpoint metadata. No new service,
model behavior, golden output, published discovery or full transaction curriculum claim.

## Design

[Decision 0033](../decisions/0033-guided-reservation-step-targets.md) records the target family.
Each checkpoint resolves one actual returned step/kind, then shares Playground's exact
post-state renderer. Java owns all stock, allocations, observations and flags. The first unsafe
acceptance has a preserved selected prefix even though the later history fails. Empty stock
selects A's rejection while B still has a read observation of zero.

The existing saved-answer lifecycle supplies predict/reveal/compare/revise/tradeoff, preset
caching, version/reset/retry behavior and exact saved checkpoint resume. Architecture explains
ownership and the acceptance boundary. Unsafe/conditional/serial manual sequences have five
original authored scenes each, complete text and keyboard controls; reading them sends no POST.

## Acceptance

All eight Java targets and numerical explanations agree; all three outcome kinds/five presets
covered. Closed semantic family/ref/capability and unchanged legacy construction/wire/renderer
behavior; explicit reveal/cache and saved-answer/reset/version/error/missing-target checks;
actual Java browser evidence, selected prefix scope and exact resume; authored no-run/text
paths; both themes/widths/reduced motion/native zoom; copied artifact current checkpoint content;
required final-head CI, followed by focused squash delivery.

## Verification evidence

| Actual check | Result | Evidence |
| --- | --- | --- |
| Full Java verify | PASS: 489 discovered, 488 executed, one existing opt-in skip; 14 new cases | `/tmp/hld-16c-java.log` |
| Canonical/content | PASS: generated drift, 259 checks including 19 new capability/content fixtures | `/tmp/hld-16c-{drift,contracts}.log` |
| Frontend full gate | PASS: typecheck/lint/format, 600 units in 66 files and production build | `/tmp/hld-16c-{type,lint,format,units,build}.log` |
| Focused Guided/resolver/resume | PASS: 46 cases | `/tmp/hld-16c-focused.log` |
| Real Java browser | PASS: nine distinct cases; eight initial passes plus corrected authored-path rerun | `/tmp/hld-16c-{browser,browser-final}.log` |
| Layout/zoom | PASS: three new views at 320/768/1440, both themes/reduced motion; all six views native 200% zoom/DPR | browser log; six captures visually inspected in `/tmp/hld-16c-captures/` |
| Copied jar | PASS: current content/eight checkpoints, both complete baselines, exclusions/cleanup | `/tmp/hld-16c-packaged.log` |
| Plan/launcher/whitespace | PASS: 111 docs, 579 links, 59 curriculum IDs, nine catalog identities; shell syntax/diff | `/tmp/hld-16c-plan.log` |

Typechecking corrected three test-only unsupported Testing Library options. The first browser
ownership assertion raced lazy page loading; it now waits for six actual buttons. Its status
assertion also now checks the exact displayed `B: ACCEPTED`/`B: REJECTED` text. The affected
flow was rerun rather than broadening unrelated local tests. Model behavior and goldens did
not change. Required complete final-head CI still gates delivery.

## Handoff

Six views for this bounded draft experiment do not complete transactions/isolation. Human
newcomer/teach-back/screen-reader/hosted and publication gates remain pending. Next design a
bounded isolation/abort/retry continuation before executable idempotency, following the
remaining curriculum section of the [transaction plan](../TRANSACTIONS_IMPLEMENTATION_PLAN.md).
Replication, partitioning, hashing and integrated Notification/Chat/Feed/Booking remain pending.

## CI correction

The first PR #74 run `38613726160` passed packaged runtime/security/Vercel but Quality's
page test read the title before React's title effect ran (599/600 units passed). The assertion
now waits for the actual title update; it retains the same expected title and timeout. No
application behavior changed. The focused page suite and required new final-head CI verify
this correction; do not merge based on the superseded run.
