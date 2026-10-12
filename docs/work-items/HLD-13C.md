# Work item: HLD-13C — predict, inspect and explain queue decisions

## Objective

Complete the draft queue-capacity teaching experience before dependent delivery work. A learner
predicts a decision, reveals a real Java transition, explains the cause and chooses a mitigation.
Architecture and job-path views make ownership and timing easy to explain to a teammate or interviewer.

## Preconditions

- Fresh branch from `cc5e042` (PR #64), implementation worktree clean, no open PR at start.
- Four published modules, the draft ten-stage URL workshop and draft queue Playground/Study/Practice
  inspected. Owner's unrelated `output/` preserved.
- The existing queue model and descriptor are working; PR #64 final-head CI passed. Decision 0022
  allows draft development while human/hosted publication gates remain open.
- Read roadmap, plan, architecture/simulation/content/learning/quality specifications and actual
  shared shell, cache Guided, local answer storage, queue playback and nearby tests.

## Scope

- Eight original queue checkpoints with stable job/event targets and Java-verified facts.
- Typed checkpoint target union: cache operation or queue job ID, never an array index.
- One shared guided flow justified by its concrete cache and queue consumers; thin adapters
  own requests, target resolution and evidence rendering.
- Direct selected-checkpoint URL/history/focus and draft saved-checkpoint resume.
- Interactive architecture boundaries and authored baseline job paths with a full text equivalent.
- Canonical schema export, content checks, generated types, packaged delivery and documentation.
- Shared Study mobile overflow/table rendering correction found by the actual browser gate.

Queue content becomes `1.1.0`; HTTP contract becomes `1.2.0`. Model/schema stay `1.0.0`/`1.0`.
Publication, durability, acknowledgments, retries, failures and idempotency remain outside this model.

## Design

Prediction → explicit Java preset → exact job/kind/occurrence → returned snapshot → explanation
→ contextual tradeoff → changed input/teach-back. A saved reveal is not a saved trace. Reload
restores reasoning without starting Java; missing targets cannot present an explanation as verified.
The static job-path view is labeled authored and does not track Playground edits.

See [decision 0025](../decisions/0025-shared-guided-simulation.md) for selector and shared-flow boundaries.

## Acceptance

- All eight targets resolve against actual Java presets. Their times, states and sample populations
  agree with the authored explanations; every descriptor preset is covered.
- Cache selector wire shape and existing Guided behavior remain compatible. Mixed, missing,
  wrong-model and malformed selectors fail the appropriate gate.
- Only explicit reveal runs Java. Memoized preset evidence is reused locally; opening/reloading,
  tab switching, deep links and static path selection do not execute simulations.
- Predictions and choices use the existing local adapter, with version/storage/reset handling.
  Pending responses and errors do not contaminate another checkpoint or survive an accepted reset.
- The selected checkpoint, focus and browser history agree. Home resumes exact existing draft
  checkpoint work; removed IDs are explicit and unsupported draft renderers stay unavailable.
- Architecture names the local admission, finite worker and waiting boundaries. Sequence separates
  running, waiting and rejection with accurate times, no broker/network or fresh-run claims.
- Keyboard, reduced motion, both themes and 320/768/1440 layouts are checked on the actual views;
  diagrams have complete textual equivalents and failures/retries remain usable.
- Packaged Java returns all eight canonical checkpoints. Required final-head CI passes before merge.

## Verification evidence

| Check actually run | Result | Artifact or reproduction |
| --- | --- | --- |
| Current main/worktrees/open PR inspection | PASS: `cc5e042`, no open PR, clean implementation worktree, owner `output/` preserved | Git/`gh pr list` at start |
| Initial Java verify | PASS: 252 discovered, 251 executed, one opt-in performance skip; 13 new cases | `/tmp/hld-queue-guided-java.log` |
| Initial contract generation/drift/content | PASS: 43 fixtures, including five selector failures | `/tmp/hld-queue-guided-contracts.log` |
| First full frontend gate | PASS: 332 unit cases, type/lint/format/production build | `/tmp/hld-queue-guided-frontend.log`; before Study correction |
| Initial browser integration | Six functional cases PASS; two responsive cases exposed real mobile Study overflow | `/tmp/hld-queue-guided-browser-target.log`; correction required before final gates |
| Packaged runtime/ownership | PASS: canonical eight draft checkpoints and six failure/cleanup cases | `/tmp/hld-queue-guided-packaged.log` |
| Dependency patch/audit | PASS: `remark-gfm` 4.0.1 MIT verified; existing `source-map-js` 1.2.1 patched to 1.2.2; audit zero at review | `/tmp/hld-queue-guided-npm-audit-final.json` |
| Final frontend gate | PASS: 335 unit cases, 43 content fixtures, type/lint/format and production build | `/tmp/hld-queue-guided-frontend-settled.log` |
| Final queue integration | PASS: all eight cases after the table-wrapping correction; actual Java targets, all six tabs at three widths in both themes, desktop table fits | `/tmp/hld-queue-guided-ui-final.log`; final type/lint/format and production browser build included |
| Independent code/content review | PASS: no remaining concrete blocker; Java fixtures, selectors/export, reset/version handling and authored views agree | Read-only final agent review; no unperformed suites claimed |
| Full browser regression | PASS: 161 cases including existing cache Guided, all release modules, answer lifecycle and native 200% zoom | `/tmp/hld-queue-guided-browser-full-final.log`; final table-wrapping layout then rechecked in the queue journey |
| Planning and launcher syntax | PASS: 90 docs, 468 local links, 59 curriculum IDs, six catalog identities; launcher syntax valid | `node scripts/validate-plan.mjs`; `bash -n start.sh` |
| Required final-head CI | Delivery gate: inspect all required checks before merge | Exact head, run and results retained on the contribution PR |

## Browser corrections and UI review

The responsive gate exposed two concrete shared issues: wide Study code escaped its grid and
pipe tables rendered as paragraphs. Native GFM tables and bounded labeled scrolling regions
preserve readable values, column semantics and keyboard access. The post-reveal gate then
isolated a clipped screen-reader status span positioned outside its horizontal checkpoint
scroller. Giving each checkpoint button a relative containing block fixes the cause; document
width assertions remain strict. Neither fix clips the document or suppresses the check.
Visual review also found long table sentences forcing unnecessary desktop scrolling. A readable
minimum table width allows wrapping at desktop widths and bounded keyboard scrolling on mobile;
the actual desktop tradeoff table must fit its reading column in the browser gate.

Actual Chrome screenshots show the selected waiting checkpoint with a real Java snapshot,
the rejection architecture boundary and the waiting job's authored step. Root inspected
mobile and desktop across both themes; 768-pixel captures were also produced by the same
passing journey. Manual screen-reader and newcomer review remain separate pending gates.

| View | 320 light | 320 dark | 1440 light | 1440 dark |
| --- | --- | --- | --- | --- |
| Guided | [Capture](assets/hld-13c/queue-guided-light-320.png) | [Capture](assets/hld-13c/queue-guided-dark-320.png) | [Capture](assets/hld-13c/queue-guided-light-1440.png) | [Capture](assets/hld-13c/queue-guided-dark-1440.png) |
| Architecture | [Capture](assets/hld-13c/queue-architecture-light-320.png) | [Capture](assets/hld-13c/queue-architecture-dark-320.png) | [Capture](assets/hld-13c/queue-architecture-light-1440.png) | [Capture](assets/hld-13c/queue-architecture-dark-1440.png) |
| Job sequence | [Capture](assets/hld-13c/queue-sequence-light-320.png) | [Capture](assets/hld-13c/queue-sequence-dark-320.png) | [Capture](assets/hld-13c/queue-sequence-light-1440.png) | [Capture](assets/hld-13c/queue-sequence-dark-1440.png) |
| Study tradeoff table | [Capture](assets/hld-13c/queue-study-table-light-320.png) | [Capture](assets/hld-13c/queue-study-table-dark-320.png) | [Capture](assets/hld-13c/queue-study-table-light-1440.png) | [Capture](assets/hld-13c/queue-study-table-dark-1440.png) |

## Handoff

The queue module remains draft at `/draft/topics/queues-tail-latency`. Review the completed
teaching artifacts, then implement `queues-delivery` using its exact delivery/effect/ACK handoff.
Real screen-reader/newcomer and hosted freshness reviews remain publication gates.
