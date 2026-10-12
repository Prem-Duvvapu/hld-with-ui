# Work item: HLD-14A — distinguish delivery from committed work

## Objective

Provide the authoritative Java experiment for later delivery teaching: predict whether a crash or
lost ACK changes delivery attempts, durable ledger appends and broker confirmation independently.

## Preconditions

- Fresh `feat/queue-delivery-domain` from `0c65a07` (PR #65); implementation checkout clean,
  no open PR, owner `output/` preserved. Four published topics and two draft experiences remain.
- HLD-13A/B/C capacity model, Java API, complete core teaching and required final-head CI reviewed.
  Independent technical review found no remaining blocker. Human publication reviews remain open.
- Relevant project/roadmap, architecture/simulation/content/learning/quality instructions,
  full delivery handoff, current queue model/guards/tests and four primary references reviewed.

## Scope

Immutable domain input/state/events/outcomes, direct validation, concrete phased scheduler,
atomic transition admission, typed state changes, ledger and honest metrics. Standalone closed
schemas with actual Java baseline examples and negative fixtures. No HTTP or UI capability is
advertised by this domain contribution; delivery's integration follows on the verified model.

## Design

Broker → one processing slot per consumer → independent durable ledger. ACK-before and ACK-after
change timing; token expiry can requeue without fencing a still-running append. A crash cancels
uncommitted effects and unsent ACKs while committed records survive. No deduplication is present.
[Decision 0026](../decisions/0026-atomic-delivery-transition-batches.md) pins independent state axes,
same-time phases, unsorted inputs, local batch admission, guarded prefixes and metric populations.

## Acceptance

- All eight hand-calculated no-fault/crash-before/crash-after/lost-ACK × two-policy rows agree.
- Exact expiry/ACK and effect/crash boundaries, exhausted attempts, overlapping consumers,
  transport-loss-before-stale and no-future-progress states agree with the handoff.
- Typed changes reconstruct initial → final state and ledger without parsing narration;
  every intermediate event exposes only changes already made in that admitted transition.
- Count/byte/time guards cannot commit partial ACK, expiry or crash batches, invisible ledger work,
  future actions or reached selectors. Invalid timers do not extend the observation window.
- Direct validation covers all bounded inputs, references, identities, duplicates, nulls,
  chronological failure alternation and safe seed. Inputs and outputs cannot leak mutable lists.
- Replay and simultaneous calls on one simulator instance preserve isolated results.
- Actual configured JSON matches canonical examples and event-array/whole-result bounds;
  schemas reject malformed fields/types, unsupported versions and inconsistent event capabilities.
- Existing model/API/browser/runtime checks and required final-head CI pass before merge.

## Verification evidence

| Check actually run | Result | Artifact or reproduction |
| --- | --- | --- |
| Baseline and open PR inspection | PASS: local/origin `0c65a07`, no open PR, owner unrelated `output/` preserved | Git/`gh pr list` at start |
| Initial domain compile | PASS | `/tmp/hld-delivery-compile.log` |
| First actual serialization/validation | PASS: 30 cases; explicit opt-in authored the canonical actual baseline | `/tmp/hld-delivery-first-tests.log` |
| Full domain suite | PASS: 53 cases before the observation-window case; all eight expected rows and guarded/replay/isolation evidence | `/tmp/hld-delivery-domain-tests.log` |
| Final Java verify | PASS: 306 discovered, 305 executed, one existing opt-in performance skip; 54 new delivery cases | `/tmp/hld-delivery-java-final.log` |
| Actual maximum-ID/max-attempt serialization | PASS: all 100 attempts settle under default trace budget; 620 events, 475,968 event-array bytes, 595,862 complete-result bytes in the recorded fixture | Actual configured serializer output in final Java log; ceilings are not heap/throughput claims |
| Frontend/content/contracts gate | PASS: 335 unit cases, 75 contract/content cases (32 new), type/lint/format and production build | `/tmp/hld-delivery-frontend-final.log` |
| Existing cache/queue browser regression | PASS: 29 real production-browser cases, including both themes and mobile/tablet/desktop | `/tmp/hld-delivery-browser-regression.log`; delivery renderer not yet registered |
| Copied jar and ownership/failure checks | PASS: unchanged published/draft APIs and complete baselines; six cleanup/failure cases | `/tmp/hld-delivery-packaged.log`; not a delivery HTTP check |
| Independent domain review | PASS: no remaining concrete semantic defect; two additional pending-ACK crash regressions implemented | Read-only independent review and exact passing fixtures |
| Planning/launcher syntax/diff | PASS: 92 docs, 480 local links, 59 curriculum IDs, six catalog identities; launcher syntax and diff clean | `node scripts/validate-plan.mjs`; `bash -n start.sh`; `git diff --check` |
| Required final-head CI | Inspect before squash merge; actual head/run/results retained on the PR | Quality, Browser journeys and Packaged runtime |

## Scope and verification limits

The guarded baseline explains one delivery, one effect and an ACK at 55 ms. Lost ACK produces
an extra delivery and effect; ACK-before/crash-before can settle with confirmation but no effect.
These are original modeled fixtures, not observed broker/email/payment behavior. The output schema
and mapper do not establish strict raw HTTP numeric/duplicate-key parsing; that belongs to the next
registered API slice. No new frontend renderer or production dependency was introduced.

The first byte estimate unnecessarily censored the maximum input despite a small actual result.
Counting printable ASCII/structural names accurately while retaining conservative non-ASCII escaping,
nullable fields and numeric widths lets the full 100-attempt case settle. Actual JSON array bounds,
synthetic Unicode escaping and all atomic-prefix checks remain strict and pass.

Java delivery sources were formatted with the official temporary Google Java Format 1.22.0 tool
using four-space AOSP style; no formatter jar, project dependency or unrelated source change is tracked.
The larger custom observation-window case proves the standalone timestamp envelope beyond the
60,000 ms default without inventing a completion in the ordinary limited result.

## Handoff

Next: register descriptor/run API and explicitly scoped draft content with strict JSON parsing,
real-HTTP failure/limits/isolation and packaged checks; then connect the React broker/consumer/ledger
playback and original lesson. Delivery remains unavailable in the UI until those contributions.
Idempotency additionally needs transactions/isolation; this append model cannot claim exactly-once effects.
