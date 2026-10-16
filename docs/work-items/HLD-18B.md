# HLD-18B — Runnable Timeouts & Retries draft

## Objective

Let a learner edit a caller workload, run the Java retry model, inspect independent caller
and server-work snapshots, then explain timeout/retry policy in a project or interview.

## Preconditions

- HLD-18A merged in PR #78 as `4c8cdd8` after required CI run `38937779374` passed.
- Owner main is updated; unrelated `output/` is preserved.
- Fresh branch `feat/timeouts-retries-experience` starts at that main.
- Request-flow and queue-capacity technical prerequisites are implemented; publication is separate.
- Follow the [frozen model and staged plan](../TIMEOUTS_RETRIES_IMPLEMENTATION_PLAN.md).

## Scope and design

Expose the unchanged model through strict GET descriptor and POST run APIs with thirteen
Java-derived input limits and eight canonical presets. Preserve existing request/response/
shared-admission guards. Actual descriptor serialization becomes a checked example, with an
explicit root-only authoring flag; ordinary tests never rewrite it or the four model goldens.

Export canonical schemas through HTTP 1.11.0, generated types and a lazy reachable descriptor
schema. The API client captures input before asynchronous loading and validates shape,
references and retained reported facts without computing retry outcomes or metrics.

Add original lesson, four primary sources, eight Practice questions and one draft catalog
row with exactly Study/Simulation/Practice capabilities. The direct lazy route is
`/draft/topics/timeouts-retries`; published discovery, search and runnable paths exclude it.
Keep model/schema replay versions 1.0.0 / 1.0. No placeholder Guided/design tabs.

The Playground offers optional prediction, eight presets, editable requests and bounded
caller policy. Advanced controls cover worker/waiting capacity, recovery, backoff/jitter,
budget and seed. Blank inputs stay editable; invalid advanced fields become reachable with
associated feedback. Only explicit Run posts. Pending locks, stale results, prior results,
errors, tab/history preservation and explicit retry remain visible.

Playback chooses Java's initial/post-event snapshots, with manual stepping, seek and bounded
presentation playback. Caller states, FIFO/workers and sent attempts remain distinct. Known
zero and absent timestamps differ; same-time microsteps stay separate. Whole-run metrics
are labeled separately with denominators and no business-effect claim.

## Acceptance

- Real HTTP reproduces every canonical preset and four goldens; meaningful edited workloads run.
- Closed fields and exact tokens reject before execution; malformed/null/duplicate/trailing/
  coerced values cannot become defaults. Existing 400/413/422/503/500 semantics and recovery hold.
- Descriptor GET and health remain usable while a shared run slot is occupied; cross-model
  admission is tested in both directions. Oversize results return an error, never partial evidence.
- Client/contract tests cover exact versions, references, deliberate microstates, omissions,
  capture-before-await, old/invalid responses and final-state equality. No second simulator in TS.
- Real browser flows cover all eight presets, changed inputs, exact selected Java states,
  stale/pending/error/retry, no automatic POST, keyboard/focus, responsive widths, themes,
  reduced motion, native zoom and local Practice persistence.
- Copied-jar/container smoke checks named retry presets and exact canonical results, draft
  exclusions, content and owned cleanup. Relevant local gates and final-head required CI pass.
- Source review and model-backed numbers support one clear explanation and transfer questions;
  human screen-reader/newcomer, hosted verification and publication remain pending.

## Verification evidence

| Actual check | Result | Evidence |
| --- | --- | --- |
| Canonical API/type/lazy-descriptor generation | PASS: HTTP 1.11.0; only five reachable descriptor definitions | `/tmp/hld-18b-generation.log` |
| Explicit descriptor authoring | PASS: actual configured GET; ordinary test compares without writing | `/tmp/hld-18b-descriptor-author.log` |
| `./mvnw -B verify` | PASS: 794 discovered, 793 executed, one existing opt-in skip; 14 new API/resource tests | `/tmp/hld-18b-java-final.log` |
| `npm run contracts:check` | PASS: 601 fixtures, ten catalog entries, 67 questions, 48 checkpoints and ten workshop stages | `/tmp/hld-18b-contracts.log` |
| Frontend typecheck/lint/format and build | PASS; final review changes compiled/built | `/tmp/hld-18b-{types,lint,format}-review.log`, `/tmp/hld-18b-fe-build-final.log` |
| Frontend tests | PASS: complete suite 738 / 79 files, then all 47 retry tests after two added review regressions | `/tmp/hld-18b-fe-units.log`, `/tmp/hld-18b-review-units.log` |
| Copied executable jar | PASS: current lesson/content and four named retry inputs/full results, all existing baselines, draft exclusions and cleanup | `/tmp/hld-18b-runtime-final.log` |
| Runtime harness tests | PASS: eleven tests, including missing/changed retry presets and corrupted snapshot rejection | `/tmp/hld-18b-runtime-tests.log` |
| Real Java Chromium and native zoom | PASS: all seven unique new journeys covered; six passed in the full scoped run, then both lifecycle journeys passed after selector correction and added pending assertions | `/tmp/hld-18b-browser-final.log`, `/tmp/hld-18b-browser-lifecycle-final.log` |
| Actual visual inspection | Four representative Playground captures inspected at 320/1440 in both themes; 18 full responsive captures retained | Evidence links below and `/tmp/hld-18b-captures/` |

The first API equality checks compared in-memory LongNode with parsed wire IntNode for the
same integral seed. Normalizing expected evidence through actual JSON serialization/parsing
retained complete equality and the full rerun passed. Type checking caught an overly narrow
initial-state inference and an unsupported Testing Library option; corrected without changing
model behavior. Source review corrected accepted-timeout and retry-planning wording, stale
policy notices and an empty advertised Practice payload; selected Java IDs now highlight cards.

The first new browser assertion counted Practice before mounting. A second persistence check
used exact label matching that excluded a textarea populated from saved text, selecting the
next blank question. Debug evidence proves the answer was saved and restored; the test now
uses its semantic question ID and textbox role, retaining an explicit durable-storage check.
Temporary diagnostic logging was removed. Final plan validation passes: 123 documents, 651
local links, 59 curriculum IDs and ten catalog identities; launcher syntax and whitespace pass.
Required final-head CI run `38942545292` passed: all 793 executed Java cases (one existing
opt-in skip), 740 frontend tests / 79 files, 601 contract fixtures, 238 browser journeys,
20 UI performance and 20 reading/cache groups, jar/container and cleanup gates. PR #79
squash merged as `dd5946e` at 2026-10-16 18:00:18 UTC. Owner main was synchronized, unrelated
`output/` preserved and only the completed owned branch removed. The PR records full remote
delivery evidence; subsequent HLD-18C source does not change that historical verification.

Representative review captures:

- [Mobile Playground, light](../evidence/HLD-18B/retries-playground-320-light.png)
- [Mobile Playground, dark](../evidence/HLD-18B/retries-playground-320-dark.png)
- [Desktop Playground, light](../evidence/HLD-18B/retries-playground-1440-light.png)
- [Desktop Playground, dark](../evidence/HLD-18B/retries-playground-1440-dark.png)

Native zoom used actual browser zoom 2 at physical widths 1440 and 640, verifying CSS widths
720 and 320 and doubled device pixel ratio. New Playground/Study/Practice remained usable in
both themes with reduced motion and keyboard activation. Automated evidence does not replace
human screen-reader/newcomer review, hosted verification, prerequisite release closure or publication.

## Handoff

Next is HLD-18C: eight Java-resolved Guided checkpoints, inspectable Architecture and three
authored manual sequences. Then continue idempotency and the requested integrated cases.
This model has no cancellation protocol, business-effect ledger, real networking, durable
storage, SQL isolation or idempotency guarantee. Technical draft coverage does not close
human/hosted/prerequisite/publication gates or complete the full curriculum.
