# HLD-17C — Atomicity Guided and design views

## Objective

Predict what related writes publish or discard, inspect the actual Java prefix,
and explain why a consistent final counter does not prove atomicity or safe history.

## Preconditions

HLD-17B merged as `9ce815c` with required CI run 38627023176 passing.
The owner main is updated; unrelated owner `output/` is preserved. This change
uses fresh branch `feat/atomicity-guided-design` in the Linux implementation worktree.
Four modules remain published. The transaction topic remains an explicit draft.

## Scope and design

Append eight atomicity Guided checkpoints with actual step IDs and closed Java outcome
kinds, original prediction/explanation/tradeoff prompts, and Java-executed fixtures.
Keep the original eight reservation activity IDs and model evidence. Reuse the
existing step selector family with model-specific capability validation.

Add a separate Atomicity Guided adapter and run cache, sharing the canonical topic's
saved-answer namespace. Preset IDs overlap across the two models: they must never
share an undifferentiated cache. Lift atomicity descriptor loading to the topic so
Playground and Guided share one lazy descriptor and retain independent sessions.
The experiment choice applies to Playground, Guided, Architecture and Operation sequence.
A resume link naming an authored atomicity checkpoint resolves its model without running it.
Unknown/missing capabilities remain visibly unavailable. Authored diagrams and manual
sequences make no POST and invent no time; the exact Java snapshot remains authoritative.

Content advances to 1.3.0, HTTP to 1.10.0; model/schema versions are unchanged.
No SQL isolation levels, real database rollback, durability, retry, idempotency,
external effects or publication are added.

## Acceptance

- Eight new targets each resolve exactly one actual Java outcome with verified stock,
  revision, private/base history, actor reason and separate selected-prefix checks.
- Reservation targets remain eight and unchanged; all old selector families resolve.
- Explicit reveal, independent model caches, saved answers, reset/version/error behavior,
  model-aware resume and Back/Forward work without automatic runs.
- Architecture ownership and three causal paths have inspectable text equivalents.
- Real Java browser flows, keyboard/focus, reduced motion, 320/768/1440 widths,
  both themes and native 200% zoom are checked; human screen-reader/newcomer and
  hosted verification remain explicitly pending.
- Local gates, copied-runtime smoke and required final-head CI pass before squash merge.

## Verification evidence

Implementation and remaining checks are in progress.

| Actual check | Result | Evidence |
| --- | --- | --- |
| `npm run contracts:check` | PASS: 445 contract/content fixtures; 9 catalog entries, 59 questions, 48 checkpoints, 10 stages | `/tmp/hld-17c-contracts.log` |
| Original-evidence comparison | PASS: original 8 reservation checkpoints, 16 questions and 12 model golden artifacts unchanged | Compared working resources to main `9ce815c` |
| Plan/launcher syntax | PASS: 117 docs, 620 links, 59 curriculum IDs, 9 catalog identities; launcher syntax | `node scripts/validate-plan.mjs`, `bash -n start.sh` |
| `./mvnw -B verify` | PASS: 686 discovered, 685 executed; one existing opt-in skip. Fifteen added cases include all 8 Java targets and all 18 authored sequence states. | `/tmp/hld-17c-java.log` |
| Frontend typecheck/lint/format, unit tests and production build | PASS: 693 tests in 73 files. Corrected inferred JSON optional-property typing and an unused test import. | `/tmp/hld-17c-{types,fe-lint,fe-format,fe-units,fe-build}.log` |
| Real Java Chromium targeted module suite | 25 of 27 initially passed; both existing nine-view reservation matrices exhausted 30s during full-page PNG capture, with UI assertions passing. Set that capture matrix to 90s without removing assertions; targeted 4 theme/layout runs passed. All27 scoped journeys are covered by those successful runs. | `/tmp/hld-17c-browser.log`, `/tmp/hld-17c-layout-captures.log` |
| Actual visual inspection | PASS: 12 new Guided/Architecture/Sequence captures across 320/1440 and both themes inspected. The targeted layout rerun also retained desktop captures. | Four intentional PNG review assets in this directory's evidence links below; all captures retained in `/tmp/hld-17c-captures/` |
| Copied jar smoke | PASS: current canonical content/checkpoints, all existing/new model baselines, draft exclusions, workshop/path/404 and owned cleanup. Initial invocation omitted required `--jar` and exited with usage2; corrected actual jar invocation passed. | `/tmp/hld-17c-runtime.log` |

Native 200% zoom passed both theme journeys across physical 1440/640 windows
(CSS720/320), both experiments and all six views, including new atomicity Guided/design
interactions. See `/tmp/hld-17c-zoom.log`. Required final-head CI/delivery remain pending;
actual remote run and merge evidence will be recorded in the PR.

Representative actual review captures:

- [Mobile Guided, light](../evidence/HLD-17C/atomicity-guided-320-light.png)
- [Mobile Guided, dark](../evidence/HLD-17C/atomicity-guided-320-dark.png)
- [Desktop Architecture, light](../evidence/HLD-17C/atomicity-architecture-1440-light.png)
- [Desktop Architecture, dark](../evidence/HLD-17C/atomicity-architecture-1440-dark.png)

Human screen-reader/newcomer review, hosted backend recovery/verification and publication
remain unperformed gates. Automated viewport/focus/zoom checks do not replace them.

## Next work

Next bounded contribution: HLD-18A, a pure Java `timeouts-retries` foundation. Its existing
request-flow/queue-capacity technical prerequisites are available; its question is whether
timed-out work continues while retries add load. Then integrate its React learning
experience and continue idempotency and the requested cases. Full SQL isolation, hosted/
human/publication gates and the remaining curriculum are still pending.
Publication and human/hosted gates remain separate.
