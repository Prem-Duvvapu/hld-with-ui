# HLD-17B — Explore related writes that commit or abort

## Objective

A learner can predict an abort, edit its action boundary, inspect actual Java published and
private state, and explain the transaction boundary needed by an everyday stock or budget
operation. This integrates the verified atomicity foundation into the existing draft topic.

## Preconditions

- Fresh `feat/transaction-atomicity-experience` from main `11cfa23`, after merged
  [PR #75](https://github.com/Prem-Duvvapu/hld-with-ui/pull/75). Its required CI passed.
- [HLD-17A](HLD-17A.md) supplies original Java behavior, eight scenarios and canonical goldens.
  Reservation model 1.0.0 and its eight Guided checkpoints remain separate evidence.
- Required project, architecture, simulation, content, learning and quality documents reviewed.
  The actual LLD shared page is the product reference; HLD keeps its own tokens and contracts.
- The owner checkout's unrelated `output/` assets are preserved. Root owns Git, builds,
  generation and servers; parallel contributors own disjoint source paths.

## Scope

Strict descriptor/run endpoints for `transaction-atomicity`, HTTP 1.9 contracts and generated
frontend types; a second named Playground experiment; original Study extensions and eight
new Practice questions. The canonical `transactions-isolation` topic is content 1.2.0 with
two simulation IDs and sixteen questions. It remains a draft outside published discovery.

`?experiment=atomicity` chooses the second experiment; the default is Reservation race.
Existing Guided, Architecture and Operation sequence explicitly teach reservation. Atomicity
has Playground, Study and Practice; its authored Guided/design views remain the next slice.
No SQL engine, services, dependencies, automatic retries, idempotency or publication is added.

## Design

[Decision 0035](../decisions/0035-two-transaction-experiments.md) keeps both experiments in
one topic while preserving exact model replay. The atomicity descriptor publishes seven
Java-derived limits and eight actual presets. Direct model routes retain shared HTTP guards:
malformed input 400, request budget 413, whole-result budget 422 and occupied admission 503.
Valid modeled abort, insufficient stock and conflict are complete 200 analyses.

React captures the submitted input before asynchronous validation/network work and checks
closed schemas, static programs, IDs, references and reported equality. Java owns every
stock change, revision, flag, decision and metric. Independent lazy descriptor/renderer
loading and retained visited panels preserve each experiment's drafts, results and snapshot.
A failed new descriptor can be retried without losing the reservation workbench.

Each selected Java state separates published stock/allocation/revision from per-actor base
history, private proposals, already-published stock and terminal reasons. Four selected flags
remain separate from the whole-history summary. Known zero is distinct from absent work.
Inputs stay editable and blank-preserving; pending runs lock controls and keep a labelled
previous result. Actor/step semantic IDs are distinct from stable UI keys.

## Acceptance

- Baseline initial stock 1, quantity 1, BEGIN → stock → ABORT: split writes leave published
  0/0 at revision 1, conservation and absence of aborted effects fail. Protected work keeps
  published 1/0 at revision 0 and clears its private workspace.
- Commit, post-record abort, empty stock and conservative revision conflict display their
  actual Java reasons and states. Split commit may have consistent final flags with a failed
  earlier prefix; conservation alone cannot certify an aborted operation left no effects.
- All eight descriptor scenarios render every initial/post-step snapshot. Edited quantity,
  mode and commit order change actual Java evidence. Illegal programs send no request.
- Strict real HTTP cases reject malformed/duplicate/trailing/coerced/unknown/missing input
  before model execution; inclusive/chunked request bounds, complete-response rejection,
  cross-model admission and recovery preserve actual current status codes.
- Selector/history/tab round trips preserve independent inputs/results; default reservation
  loads no atomicity descriptor or renderer. Missing/unknown choices and descriptor/run
  errors are visible and retain local work. No automatic POST or fabricated fallback trace.
- Keyboard edit/reorder/remove focus, reduced motion, both themes, 320/768/1440 layouts and
  native 200% zoom remain usable. Inspect actual screenshots after the primary flow.
- Old question/checkpoint IDs and replay goldens stay unchanged. New content references
  actual scenarios, primary sources and correct model limits; saved answers retain review
  notices through the topic content-version change.
- Copied jar/container smoke compares complete baseline/protected/conflict atomicity outputs
  to configured Java goldens, verifies draft exclusions and stops only owned processes.
- Relevant local gates and required final-head CI pass before focused squash delivery.

## Verification evidence

Local gates have completed. Remote CI and merge evidence is appended to the contribution PR
after its jobs finish; local passing checks alone do not establish remote delivery.

| Check actually run | Result | Evidence |
| --- | --- | --- |
| Initial contract generation | PASS | `/tmp/hld-17b-generate.log`; later drift gate remains required |
| Full `./mvnw -B verify` and actual HTTP guards | PASS: 671 discovered, 670 executed, one existing opt-in skip; 14 new API/HTTP tests | `/tmp/hld-17b-java.log`; model replay goldens compare without authoring flags |
| Contract/content, type/lint/format/units/build | PASS: 431 contract/content checks; 669 frontend units in 70 files; production build | `/tmp/hld-17b-contracts.log`, `/tmp/hld-17b-fe-{type,lint,format,units,build}-final.log` |
| Real Java browser, responsive/focus/reduced motion/native zoom | PASS: 14 focused Chromium journeys and 2 actual native 200% zoom journeys in both themes | `/tmp/hld-17b-{browser,zoom}.log`; two theme flows repeated solely to retain visual captures after suite-output cleanup |
| Copied jar and packaged regression checks | PASS: complete baseline/protected/conflict evidence and draft exclusions; 10 regression tests | `/tmp/hld-17b-{runtime,runtime-tests}.log`; owned process/port cleanup passes |
| Plan/launcher and link controls | PASS before final doc staging; 115 docs, 607 links, 59 curriculum IDs and 9 catalog identities; staged whitespace checked before commit | `/tmp/hld-17b-plan-controls.log`: valid query passes; unknown draft route and unimplemented anchor reject |
| Final-head CI, PR and merge | Delivery gate | Record completed remote evidence in the PR |

## Handoff

The API/UI/content integration is locally verified and awaits required final-head CI and
focused delivery. Publication checks remain open. Its learning outcome is publication/discard of related writes, not complete database
transactions. Next author Java-verified atomicity Guided checkpoints and scoped Architecture/
Sequence views. SQL isolation, retry/idempotency, hosted recovery, human learning/accessibility
review and the remaining target case studies stay pending.

## Visual evidence

Actual Playwright captures were inspected for both themes and retained in
`/tmp/hld-17b-captures/` (six Playground/Study/Practice captures). The intentional source
review artifacts below show the 320 CSS-pixel primary flow with Java's split-write abort.
The browser matrix also checked 768 and 1440 widths and preserved keyboard focus. These
checks do not replace a human screen-reader or newcomer review.

- [Light mobile Playground](../evidence/HLD-17B/atomicity-playground-320-light.png)
- [Dark mobile Playground](../evidence/HLD-17B/atomicity-playground-320-dark.png)

Initial local check corrections: a new browser assertion used Array.at unsupported by the
existing TS target; indexing fixed it without changing the target. Formatting then caught the
edited assertion. Contract drift was checked against the intentionally staged new generated
API artifacts. All final local gates above pass. The plan validator now recognizes catalog-
backed draft app routes without skipping filesystem/heading checks.

Final metadata review adds one regression for a non-array simulator reference. The page rejects
it as incompatible before exposing either experiment; final type/lint/format and all 669 units
pass after this correction. Valid API/browser flows and captured layouts are unchanged.
