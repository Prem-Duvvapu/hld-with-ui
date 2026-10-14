# Work item: HLD-16B — Explore and explain a reservation race

## Objective

Let a learner predict competing reservations, edit the schedule, run Java, inspect a returned
prefix and explain why checking current stock at an atomic acceptance boundary protects the
stated stock/allocation rule. Support a simple interview explanation and a practical write review.

## Preconditions

- Fresh `feat/reservation-draft-experience` from PR #72 squash `ae4a88e`.
- [HLD-16A](HLD-16A.md) model/contracts/goldens and final required CI passed.
- Project, architecture, simulation, learning/content and quality standards reviewed.
- [Transaction handoff](../TRANSACTIONS_IMPLEMENTATION_PLAN.md) defines this bounded slice.
- Owner's unrelated `output/` assets preserved; root alone owns builds, servers and Git.

## Scope

Strict descriptor/run APIs, HTTP 1.7 canonical exports, lazy compatibility checks, one draft
catalog entry, eight original scenarios, Study and eight Practice questions. React renders
only Java snapshots and metrics. Existing schema/model 1.0/1.0.0 and four actual goldens remain
unchanged. No Guided/design tabs, published discovery or full isolation/rollback/retry coverage.

## Design

[Decision 0032](../decisions/0032-reservation-draft-experience.md) records the integration.
Two through four actors request bounded quantities, each with one read and one later attempt.
Stable UI keys preserve input focus and actor links when semantic IDs or step order change.
Run captures the exact submission; Java produces authoritative state. Manual playback starts
at the initial snapshot, and history-level metrics are labelled separately from selected flags.
Errors preserve inputs/prediction/prior evidence; edited inputs mark that evidence as stale.

The unsafe one-unit example allocates two units without a negative counter. The protected
example accepts one and rejects one without changing stock or allocations on rejection.
A two-unit example separates capacity from conservation. Unequal quantities expose a stale
assignment that restores stock. Original content cites four pinned PostgreSQL 18 primary pages;
it does not describe the teaching algorithms as database isolation modes.

## Acceptance

Real HTTP all-eight-preset evidence and exact unsafe/protected goldens; strict invalid-input
and 400/413/422/503/500 permit-release paths; canonical exports; edited strategy, quantities,
IDs/order/four-actor evidence; invalid input prevents POST; error/retry/pending/stale capture;
initial/manual prefix scope; local exact-question resume; keyboard focus, both themes, mobile,
reduced motion and native zoom; copied artifact current content/full results and exclusions.

## Verification evidence

| Actual check | Result | Evidence |
| --- | --- | --- |
| Full Java verify | PASS: 475 discovered, 474 executed, one existing opt-in skip; 14 new API/limit cases | `/tmp/hld-16b-java.log` |
| Canonical export/drift and content | PASS: stable generated outputs; 240 content/contracts cases | `/tmp/hld-16b-{drift,contracts}.log` |
| Frontend full gate | PASS: typecheck/lint/format, 574 units across 63 files and production build | `/tmp/hld-16b-{final-type,lint,format,units,build}.log` |
| Focused learning/client checks | PASS: 90 cases | `/tmp/hld-16b-focused.log` |
| Real Java browser flows | PASS: ten journeys, all eight scenarios/every prefix; edited inputs/errors/pending/resume/focus | `/tmp/hld-16b-browser.log` |
| Responsive/zoom | PASS: three views at 320/768/1440 in both themes with reduced motion; native 200% Chromium zoom/DPR | same browser log and six actual screenshots in `frontend/test-results/` |
| Copied jar outside checkout | PASS: current content, both full Java baselines, draft exclusion and owned cleanup | `/tmp/hld-16b-packaged.log` |
| Python failure checks | PASS: nine cases, including wrong/missing reservation presets and stale full results | `/tmp/hld-16b-python.log` |
| Plan/launcher/whitespace | PASS: 109 docs, 566 local links, 59 curriculum IDs, nine catalog identities; shell syntax/diff | `/tmp/hld-16b-plan.log` |

Initial typechecking caught narrow initial-state inference and unchecked tuple indexing; explicit
state typing and bounds-backed nonnull indexing fixed them. The first copied-jar smoke caught
lesson bytes changed by formatting after packaging; the rebuilt artifact passed exact comparison.
The full-page screenshot capture was adjusted to return to the top before capture, avoiding
out-of-viewport fixed-element artifacts. The actual UI checks had already passed. These are
verification corrections, not changes to the frozen Java algorithms or golden evidence.

## Handoff

Direct route `/draft/topics/transactions-isolation`; Playground/Study/Practice only.
Human/newcomer/screen-reader/hosted/publication gates remain open. The next unblocked
contribution is HLD-16C: Java-verified Guided checkpoints and authored inspectable Architecture
and Operation sequence, following the unchanged model and [handoff](../TRANSACTIONS_IMPLEMENTATION_PLAN.md).
Broader isolation/rollback/retries/idempotency, replication/partitioning/hashing and integrated
Notification/Chat/Feed/Booking cases remain pending. This contribution does not complete P3-02.

## Final delivery record

[PR #73](https://github.com/Prem-Duvvapu/hld-with-ui/pull/73) final head
`562d8c745e210a2e89281d7ea0ba0691b6a8eb62` passed required Quality, Browser journeys and
Packaged runtime plus GitGuardian/Vercel. Run `38599533781` tested merge `d07612a`:
475 Java cases (one existing skip), 574 units, 240 contracts, 212 ordinary browser journeys,
20 UI performance and 20 reading checks; launcher, copied jar/container and owned cleanup passed.
Squash `2fc1816894834ed86efbf4363aa43d9ee73f4f4a` merged 2026-10-14 16:47:04 UTC.
Owner main updated with `output/` preserved; owned branch deleted. [HLD-16C](HLD-16C.md)
adds the next bounded teaching views. Four hosted read-only requests through Vercel timed out
at the 15-second bound on this date; this does not identify its deployed commit or prove recovery.
Raw observations: `/tmp/hld-16b-hosted/`. The deployment incident remains open.
