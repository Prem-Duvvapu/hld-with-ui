# HLD-19A — Verify the idempotency effect and saved-result boundary

## Objective

Establish Java evidence for why the effect and its retained result need one protected
publication boundary, and when changed keys or expiry permit repeated effects.

## Preconditions

- PR #80 merged as `bdf18dc` after required CI `38946555748` passed.
- Technical queue-delivery, reservation/atomicity and retry prerequisites exist; human/hosted
  reviews and publication are separate. Owner considers LLD the primary product reference.
- Fresh `feat/idempotency-model` branch; owner main and unrelated `output/` preserved.
- The [frozen plan](../IDEMPOTENCY_IMPLEMENTATION_PLAN.md) defines the model and later UI stages.

## Scope and design

Pure request-local Java model and validator, nine canonical tiny scenarios, immutable state
and step outcomes, separate public ledger/key history/private work/caller observation,
standalone closed schemas and Java-produced input/result examples. Compare the same valid
program under no protection, split effect/result publication and atomic publication/recheck.
Operation identity is audit-only; server lookup uses tenant/key. Time and expiry are authored
virtual integers; there is no randomness or real infrastructure.

This contribution registers no API, catalog topic or frontend capability. The next runnable
slice must expose real behavior and content together rather than placeholder tabs.

## Acceptance

- Verify duplicate/lost-response, split crash/race, atomic replay/recheck, both payload-conflict
  boundaries, retained receipt identity, expiry equality and tenant/key scope with exact facts.
- A mode-only change changes the actual result for the same workload; no frontend outcome logic.
- Reject null/unknown/out-of-bound versions/identities/steps/references and incomplete programs
  before state changes. Defensive ownership and concurrent executions remain isolated.
- Java serialization and standalone schemas agree on closed fields, versions, bounds, nullable
  absence, enum/action/phase capabilities and authoritative snapshots. Ordinary tests never write.
- Maximum-boundary input/output is measured; all declared references and ceilings hold.
- Relevant local checks and required CI pass before focused PR squash delivery. Update roadmap,
  architecture/simulation evidence and handoff honestly; no full module/publication claim.

## Verification evidence

| Actual check | Result | Evidence |
| --- | --- | --- |
| Independent domain/validation/ownership tests | PASS: 149 cases; exact scenario metrics and intermediate facts, strict grammar, mode-only changes, expiry/replacement, crash history, tuple identities and concurrent isolation | `/tmp/hld-19a-domain.log` |
| Explicit configured Java authoring | PASS: nine input/result pairs cover all sixteen kinds; existing models' examples unchanged | `/tmp/hld-19a-author.log` |
| `./mvnw -B verify` | PASS: 963 discovered / 962 executed / one existing opt-in skip; 152 added cases including serialization | `/tmp/hld-19a-java.log` |
| `npm run contracts:check` | PASS: 1043 fixtures before the two mode-capability review fixes; generated HTTP/types remained unchanged | `/tmp/hld-19a-contracts.log` |
| Final new-model contract fixtures and content validation | PASS: all 423 new fixtures after four review regressions; ten catalog entries, 67 questions, 56 checkpoints and ten workshop stages validated | `/tmp/hld-19a-standalone-final.log`, `/tmp/hld-19a-content-final.log` |
| Frontend typecheck/lint/format/test/build | PASS: 785 tests / 82 files and production build; final lint/format after review edits | `/tmp/hld-19a-types.log`, `/tmp/hld-19a-lint-final.log`, `/tmp/hld-19a-format-final.log`, `/tmp/hld-19a-fe-units.log`, `/tmp/hld-19a-fe-build.log` |
| Copied executable jar | PASS: existing packaged lessons/checkpoints/model baselines, workshop/path, discovery exclusions, structured 404 and owned cleanup; no idempotency endpoint claimed | `/tmp/hld-19a-runtime.log` |
| Plan, launcher syntax, whitespace | PASS: 128 docs, 679 local links, 59 curriculum IDs and ten catalog identities | `/tmp/hld-19a-plan-final.log`, `bash -n start.sh`, `git diff --check` |

Maximum legal-ID/12-call/48-step serialization was measured in memory in all three modes:

| Mode | Input bytes | Result bytes | Effects / published units |
| --- | ---: | ---: | ---: |
| NO_DEDUP | 8255 | 226721 | 12 / 12000 |
| SPLIT_EFFECT_RECORD | 8266 | 307718 | 12 / 12000 |
| ATOMIC_EFFECT_RECORD | 8267 | 267471 | 12 / 12000 |

These explicit fixtures fit the current configured default byte limits and round-trip exactly;
this does not prove a universal maximum or introduce an HTTP guarantee. No giant trace is
committed. Nine small scenario pairs total about 208 KiB after formatting.

Read-only semantic review found no producer mismatch. Cross-review found two permissive
schema branches: retained modes allowed EXECUTED without its resolved record reference,
and atomic crash history could borrow split-write public-effect evidence without committed
resolution. The schema now requires the appropriate retained execution history while
preserving real split crashes, cleared crash receipts and expired cached replay references.
Four focused fixtures verify that distinction. The first format check caught the newly
added fixture formatting; final lint/format passed after formatting it. Assertions were retained.

Required final-head CI, including the complete updated contract/browser/runtime suites,
and actual PR delivery remain pending. Record their real results in the PR after completion.
No API, catalog, OpenAPI component, frontend type or renderer has been registered. Human,
hosted and publication checks for the existing drafts remain separate and are not completed here.

## Handoff

Next: HLD-19B strict API and runnable draft with editable calls/steps, original Study/Practice
and actual snapshot playback. Then Guided/design and Notification composition. No physical
durability, actual SQL transaction, payment/provider/broker or exactly-once guarantee is modeled.
