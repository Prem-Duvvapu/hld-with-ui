# HLD-18A — Timeouts and retries Java foundation

## Objective

Show that a caller can stop waiting while accepted server work continues, and that
retry sends, executed work and business effects are different facts. Compare bounded
retry policy, backoff, seeded jitter, overall deadline and a shared finite retry budget.

## Preconditions

- Request-flow and queue-capacity technical foundations exist; publication is separate.
- Atomicity Guided/design PR #77 merged as `ff0daa1` after required CI run `38934926502` passed.
- Fresh branch `feat/timeouts-retries-model` starts at that updated main.
- Owner main is synced; unrelated owner `output/` is preserved.
- The [semantic handoff](../TIMEOUTS_RETRIES_IMPLEMENTATION_PLAN.md) freezes exact behavior.

## Scope

Pure `com.hld.retries` input/validation/model/result/presets, standalone closed schemas,
four actual Java golden pairs, meaningful semantic/ownership/serialization/schema tests,
model decision and roadmap evidence. No API, model registration, catalog preview or UI
is advertised by this foundation. Those require the next actual vertical contribution.
Existing models, replay versions, goldens, saved IDs and published discovery stay intact.

## Design and acceptance

One finite worker/FIFO dependency and one retry owner use virtual time only. Caller and
server-work states are orthogonal; timeout/deadline never silently cancel accepted work.
Declared callback phases make completion at a deadline win deterministically. Stale timers
cannot revive a caller or extend the final observation after all actual work has drained.
Java owns all counts, snapshots, chosen jitter, reasons and amplification denominators.

Execute all eight canonical presets, equality and +1 boundaries for each deadline mechanism,
FIFO/worker order, queued timeout drainage, late response with a newer active attempt,
budget checks at planning and dispatch, seed replay/meaningful change, zero capacity/budget,
malformed/maximum inputs, immutable ownership and concurrent isolation. Compare configured
Java JSON with standalone schemas; measure the maximum fixture in memory without claiming
production performance or committing a giant stress trace.

Bounds: at most 12 originals × 5 attempts = 60 actual attempts, 192 callbacks, 384 emitted events,
80,000ms complete virtual drain. Internal assertions expose model bugs; no censored trace
or fabricated completion substitutes for complete finite behavior.

## Verification evidence

| Actual check | Result | Evidence |
| --- | --- | --- |
| Explicit four-pair Java authoring | PASS: actual baseline/backoff/deadline/jitter inputs and complete results; all eleven kinds covered | `/tmp/hld-18a-golden-author.log`; `RetrySerializationTest` |
| `./mvnw -B verify` | PASS: 780 discovered, 779 executed and one existing opt-in performance skip. The new retry package contributes 94 passing cases. | `/tmp/hld-18a-java-final.log` |
| Maximum-boundary configured serialization | PASS: 12 maximum-length IDs, 60 sends, 48 retries, 234 events; input 1305 bytes, result 2507629 bytes, complete virtual drain at 15000 ms; exact JSON round trip | Logged by ordinary `RetrySerializationTest`; this fixture is not a universal worst-case byte proof |
| `npm run contracts:check` | PASS: generated existing API/types/descriptor artifacts unchanged; 596 contract/content fixtures; 9 catalog entries, 59 questions, 48 checkpoints and ten workshop stages | `/tmp/hld-18a-contracts.log` |
| Frontend typecheck/lint/format | PASS | `/tmp/hld-18a-types.log`, `/tmp/hld-18a-lint.log`, `/tmp/hld-18a-format-final.log` |
| Frontend unit tests and production build | PASS: 693 tests in 73 files; TypeScript/Vite production build passes | `/tmp/hld-18a-fe-units.log`, `/tmp/hld-18a-fe-build.log` |
| Copied executable jar smoke | PASS: canonical published/draft baselines and content, discovery/path/workshop exclusions, structured 404 and owned cleanup | `/tmp/hld-18a-runtime.log`; retry itself has no HTTP route in this foundation |

The first full Java invocation exposed an AssertJ collection assertion that rejects an empty
comparison list. Replaced it with an explicit disjointness assertion, retaining duplicate,
queue and worker ownership checks; the full rerun passed. The first format check requested
formatting only in contracts/README; the corrected full format check passed. Existing model
versions, inputs/results, saved IDs, catalog, generated API and frontend application code are unchanged.

Final plan validation passes (120 documents, 637 local links, 59 curriculum IDs and nine
catalog identities); launcher syntax and whitespace checks pass. Required final-head CI and
delivery remain pending; actual remote results and squash evidence will be recorded in the PR. No new UI was added, so new-module keyboard,
responsive, theme, reduced-motion and learning-flow checks belong to HLD-18B. Existing app
regressions remain covered by required browser CI. Human/hosted/publication gates remain open.

## Limitations and next work

This models completion of dependency work, not a persisted payment/notification effect.
No network, cancellation protocol, side-effect ledger, retry tree, database, durability or
idempotency is implemented. Fixed service time per original and FIFO mean do not invent
an older same-request completion after that request succeeds through a newer attempt.

Next: HLD-18B strict APIs and the real React Playground/Study/Practice draft, then HLD-18C
Guided/design views, idempotency and requested integrated cases. Human/hosted/publication
and the full curriculum remain pending.
