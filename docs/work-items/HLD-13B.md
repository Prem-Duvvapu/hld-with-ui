# Work item: HLD-13B — draft queue capacity learning experience

## Objective

Make queue waiting and rejection visible and explainable using real Java results. The learner
can change workers, waiting slots and job durations; inspect a returned snapshot; and defend
the buffering/capacity tradeoff. This completes the first accessible draft experience for the
missing queue-capacity prerequisite, not the entire queue/retry/idempotency curriculum.

## Preconditions

- Fresh branch from `cd7ac53` (PR #63), clean implementation worktree, no open PR at start.
- HLD-13A model and exact tests exist; request-flow/capacity prerequisites are published.
- Decision 0022 permits draft development. P2-05 human/hosted publication gates remain open.
- Relevant roadmap, architecture/simulation/content/learning/quality documents and actual
  catalog, API, module shell, cache playground/guards and nearby tests inspected.
- Owner's untracked `output/` preserved. LLD remains the product reference, not a copied
  broker implementation or another repository's contribution rules.

## Scope

- Canonical draft metadata, original lesson, six questions and three primary sources.
- Explicit draft topic lookup plus registered queue descriptor/run API and strict parsing.
- Canonical standalone-to-OpenAPI export, generated frontend types and checked drift.
- React draft route, controls, queue/worker state, playback, outcomes, Study and Practice.
- Independent HTTP/unit/browser verification plus actual packaged draft delivery.
- No published topic, fake Guided tab, new dependency/service or frontend simulation logic.

## Design

Predict admitted/rejected jobs → run captured inputs → follow shared FIFO state → separate
waiting from service → compare a changed worker/buffer/duration → explain the decision.
Preserve distinct completed/rejected/unfinished populations and scheduled/observed completion.
Use [decision 0024](../decisions/0024-draft-queue-experience.md) for routing, schema and input boundaries.

## Acceptance

- Draft detail returns real canonical lesson/questions; published lookup remains 404 and
  published collections/search/bookmarks/path destinations exclude the draft.
- Java descriptor presets reconcile with authored 15/25 ms examples, three-completion worker
  variant, slow-job 100/101/102/103 ms variant and honest 60,000 ms limited state.
- Missing/null/unknown/duplicate/trailing/wrong-type/overflow/version input fails with 400;
  body/result/admission guards retain their errors and recover permits.
- React submits only explicit runs, validates blank/range/order/IDs, preserves inputs/results
  across tabs/history and pauses hidden playback. Unknown versions/events/states fail visibly.
- Playback directly selects Java snapshots; metrics/denominators/partial/unavailable states
  remain honest. No scheduled completion appears as an observed outcome.
- Practice saves/reloads through the established local adapter; home resumes the exact draft
  question only for existing saved work. Personal answers stay local.
- Keyboard/focus, 320/768/1440 widths, both themes, reduced motion, loading/error/retry/limited
  states have applicable checks and screenshot inspection.
- Jar-only/container checks load packaged draft content and match the complete baseline result.
- Required final-head CI passes before squash merge. Human publication reviews remain pending.

## Verification evidence

| Check actually run | Result | Evidence |
| --- | --- | --- |
| Repository/main/open PR inspection | PASS at start: `cd7ac53`, clean implementation worktree, no open PR | Git/`gh pr list` on 2026-10-12 |
| Primary source review | Three official references reviewed; original explanation/diagram/numeric model | `content/topics/queues-tail-latency/resources.json` |
| Initial content and planning validation | PASS: 36 content fixtures; 86 docs/433 links/59 curriculum IDs/6 catalog identities before new work-item links | Commands executed during integration |
| Backend `./mvnw -B verify` | PASS: 239 discovered, 238 executed, one opt-in performance case skipped | `/tmp/hld-queue-draft-java.log`; nine new real HTTP cases |
| Contract generation/drift/content | PASS: six catalog entries, 27 questions, 38 negative fixtures | `/tmp/hld-queue-draft-frontend-final.log`; whole-string ID regression included |
| Jar copied outside checkout | PASS: real packaged draft lesson/questions and complete Java baseline result; publication exclusions unchanged | `scripts/packaged-runtime-smoke.py --jar …`; final rerun in `/tmp/hld-queue-draft-packaged-final.log` |
| Packaged failure/ownership checks | PASS: six cases | `python3 -m unittest discover -s scripts -p 'test_packaged_runtime_smoke.py' -v` |
| Frontend typecheck/lint/format/unit/build | PASS: 34 files, 315 unit cases; production build | `/tmp/hld-queue-draft-frontend-final.log` |
| Browser integration | PASS: 153 cases, including 14 queue cases and native 200% zoom on existing release flows | `/tmp/hld-queue-draft-browser-full.log` |
| Planning and launcher syntax | PASS: 88 docs, 443 links, 59 curriculum IDs, six catalog identities; `bash -n start.sh` | `node scripts/validate-plan.mjs` |
| Final packaged queue browser rerun | PASS: all 14 cases after the lesson/caption correction | `/tmp/hld-queue-draft-browser-final.log`; captures refreshed |
| Visual inspection | PASS: six real Chrome captures, 320/768/1440 × both themes | Screenshots below; reduced motion and keyboard focus exercised |

## UI review captures

| Width | Light | Dark |
| --- | --- | --- |
| 320 px | [Mobile](assets/hld-13b/queue-320-light.png) | [Mobile](assets/hld-13b/queue-320-dark.png) |
| 768 px | [Tablet](assets/hld-13b/queue-768-light.png) | [Tablet](assets/hld-13b/queue-768-dark.png) |
| 1440 px | [Desktop](assets/hld-13b/queue-1440-light.png) | [Desktop](assets/hld-13b/queue-1440-dark.png) |

The controls stack on smaller screens. Metrics retain their population labels; outcomes
scroll inside their own keyboard-focusable table region. The capture resets document scroll
before the screenshot so the sticky tab rail does not obscure the full-page review image.
This agent visual inspection does not constitute a real screen-reader or newcomer review.

## Review corrections

- Java preset equality compares parsed wire JSON on both sides so numeric node implementation
  types cannot cause a false failure; the complete result assertion remains.
- Job and worker IDs require full-string matches in the browser and reject whitespace in
  canonical schemas, matching Java behavior for a final newline.
- Existing saved draft queue answers now resume through home without a false unavailable
  message; unrelated future draft IDs still have no renderer.
- Decorative module-tab numbers are hidden from assistive technology. Exact tab-name tests
  retain visible labels and keyboard behavior.
- The lesson names the existing All modules navigation rather than claiming nonexistent
  prerequisite links. Playback shows the recorded model version separately from content.
- Limit notices use readable wording. Browser retry checks compare consistent text content;
  the initial targeted run exposed the tab-name and test-capture mismatches before correction.

## Remaining release limits

The queue topic remains draft. Guided checkpoints and dedicated architecture/sequence views
are not advertised. Durable delivery, worker failures, retries, acknowledgment loss and
idempotency are not modeled here. Real screen-reader/newcomer review and hosted freshness
remain open publication gates. Local container execution was unavailable; the required
Packaged runtime CI job runs the actual deployment image before merge.

## Handoff

Direct draft route is `/draft/topics/queues-tail-latency`. Ordinary discovery remains four
published topics; both queue capacity and URL Shortener are drafts. The follow-up is to
review this prerequisite's teaching experience and then implement `queues-delivery` from its
precise handoff, while completing missing guided/views and human/publication review evidence.
