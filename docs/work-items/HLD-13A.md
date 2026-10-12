# Work item: HLD-13A — authoritative queue capacity model

## Objective

Provide the executable Java basis for explaining waiting, rejection and latency under a
finite worker pool. This is the first implementation of the missing `queues-tail-latency`
prerequisite for delivery/retry/idempotency learning; the learner-facing module is not complete.

## Preconditions

- Fresh branch `feat/queue-capacity-model` from `f19c8f5` (PR #62); no open PR at start.
- Request flow and capacity prerequisites exist; decision 0022 permits draft development.
  P2-05 human/hosted release gates remain open and are not closed by this model.
- Inspected shared budgets/emitter/context, nearby simulator/serialization tests, contract
  validators, current roadmap and the LLD/HLD module references.
- Owner's unrelated untracked `output/` is preserved.

## Scope

- Concrete pure Java model/input/state/event/outcome/metrics/result records and limits.
- Standalone model JSON Schemas and baseline examples; actual Java serialization reconciles
  the result example. Extend the existing contract gate and negative fixtures.
- Meaningful semantic, input, serialization, budget, replay and concurrency tests.
- No HTTP endpoint, catalog entry, Spring model registration, React route or published topic.

## Design

Four jobs arrive at 0 ms, one worker needs 10 ms per job. One waiting slot admits two jobs
and rejects two: completions at 10/20 ms, waits 0/10 ms, successful mean latency 15 ms.
Three waiting slots admit all four: completions at 10/20/30/40 ms, mean latency 25 ms.
Buffering changes latency/rejection while worker capacity remains fixed.

[Decision 0023](../decisions/0023-queue-capacity-model.md) specifies per-job service times,
same-time ordering, immutable typed snapshots, populations and prefix-consistent bounds.
The next UI renders authoritative data; it must not implement a second queue simulator.

## Acceptance

- Exact baseline and larger-buffer fixtures, zero waiting slots, more workers, service-time
  variation and completion/arrival ties prove meaningful behavior differences.
- Input/state immutability, validated version/range/order/identity boundaries and safe seeds.
- Per-input populations reconcile; only completed jobs contribute successful latency
  distributions; missing samples remain unavailable.
- Event/byte/virtual-time limited runs preserve the last emitted state and honest work counts.
- Actual application-Jackson events stay inside small/default declared byte ceilings.
- Sequential replay and parallel runs on the same simulator preserve isolation.
- Checked standalone contract examples and negative shape/version/type/state fixtures.
- Existing runtime remains unchanged; required final-head CI passes before merge.

## Verification evidence

| Check actually run | Result | Artifact or reproduction |
| --- | --- | --- |
| Main/worktree/open PR inspection | PASS at start: `f19c8f5`, implementation worktree clean, no open PR | Git/`gh pr list` on 2026-10-12 |
| New model and independent tests | PASS: 44 domain cases and 3 configured-serializer cases | Targeted runs, then full verification; separate main/test agent ownership plus root review |
| `cd backend && ./mvnw -B verify` | PASS: 230 discovered, 229 executed, 1 opt-in performance case skipped; 0 failures/errors; jar packaged | Executed on 2026-10-12, Java 17.0.20.1 |
| Actual serializer/example reconciliation | PASS: tracked baseline is real Java output. Maximum 100 longest-ID jobs, 8 workers: 292 events / 696,710 event-array bytes / 717,324 complete-result bytes, completed; 2/512/4,096/32,768-byte budgets stop honestly | `QueueCapacitySerializationTest`; default trace cap 2 MiB, result comparison against default 4 MiB HTTP ceiling; no HTTP queue endpoint exercised |
| `cd frontend && npm run contracts:check` | PASS: generated current API types unchanged; both draft model examples validate; all 36 negative/content fixtures pass | Executed on 2026-10-12, Node 20.19.4 |
| `cd frontend && npm run lint` and `npm run format:check` | PASS | Executed on 2026-10-12 |
| `node scripts/validate-plan.mjs` | PASS: 85 docs, 433 links, 59 curriculum IDs, 5 catalog identities | Executed on 2026-10-12 |
| `git diff --check` | PASS | Executed on 2026-10-12 |

The initial targeted run found a test comparison between Jackson LongNode/IntNode values
with identical JSON numbers. Parsing both actual serialized inputs corrected the test;
subsequent serializer and full verification passed. The final tracked result is always
required and compared; the test does not silently skip missing evidence.

No frontend UI changed, so local React/browser suites were not repeated. Required final-head
CI still runs frontend type/tests/build, all existing real browser/launcher journeys,
performance evidence and packaged-jar/container checks before merge. Those are regression
gates, not evidence of an accessible queue module.

## Handoff

This contribution is model-only development, not published learning coverage. Four topics
and the draft URL-shortener workshop remain the usable application. Next introduce explicit
draft topic delivery and the queue-capacity React/teaching experience, including keyboard,
mobile/theme, playback, error/limited state and human learning/accessibility review.
