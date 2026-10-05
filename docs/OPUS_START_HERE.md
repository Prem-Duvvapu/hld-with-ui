# Opus 5.5 implementation handoff

Updated 2026-10-05 against `add46a4` / PR #30. Copy the prompt below into Opus while it has access to this repository. It uses repository files rather than hidden chat history.

## Copy-and-paste prompt

```text
Implement the next stage of hld-with-ui: a React/TypeScript frontend and
Java/Spring Boot backend for learning system design through interactive evidence.

Repository: /mnt/c/users/hp/onedrive/desktop/hld-with-ui

Read AGENTS.md and CONTRIBUTING.md first, then:
1. docs/NEXT_IMPLEMENTATION_PLAN.md — current assignment and step-by-step order.
2. docs/IMPLEMENTATION_PLAN.md — detailed tasks, fixtures, and dependencies.
3. docs/ROADMAP.md — authoritative status and release gates.
Read the other architecture, simulation, content, learning, and quality documents
required by AGENTS.md before touching the relevant area.

The verified baseline is add46a4 (PR #30). Fetch and inspect current GitHub and
local changes before acting. Treat the code and current evidence as authoritative.
Preserve unrelated work and any uncommitted documentation handoff. Do not redo
completed work merely because an older section describes it as a future task.

My priorities are excellent UI/UX, strong frontend AND backend code quality,
and simple explanations I can repeat to teammates or in SDE-2 interviews.
lld-with-ui is the primary product reference. Preserve HLD's current visual
identity and build complete learning experiences.

Scope: execute HLD-05 through HLD-11 in the current plan, one bounded contribution
at a time. Start with cache visual playback (HLD-05). Do not start HLD-12 or later.
HLD-01/02, the automated HLD-03 harness, and the HLD-04 structured-state/contract
slices already exist. Manual accessibility and other unevidenced release gates
remain open. Verify rather than assume their completion.

First contribution:
- Build cache state reconstruction from initialState and each event's typed
  post-event key state, respecting sequence order even at equal timestamps.
- Add a cache/origin diagram, text equivalent, initial-state position,
  play/pause, step backward/forward, reset, seek, speed, and event inspection.
- Keep every visual synchronized to the selected event. Filtering an operation
  must not discard other operations' effects on shared state.
- Never parse narration, infer earlier state from final outcomes, recompute Java
  metrics, or submit a backend run just to move the playback cursor.
- Verify the plan's 2/22/40/72/122/142 ms fixtures, cold burst, multiple keys,
  backward seek, empty/limited traces, and tab-state/hidden-playback behavior.

Then follow the plan: guided cache learning and diagrams; existing-module review;
durable local answers with safe import/export; the URL shortener workshop;
search/bookmarks/resume; and first-release verification.

For every task:
1. Inspect relevant code/contracts/tests and write bounded acceptance criteria
   using docs/templates/WORK_ITEM.md.
2. Create a fresh branch from updated main. Implement one usable vertical slice.
3. Keep Java behavior, OpenAPI, generated types, catalog capabilities, content,
   and model versions aligned. Preserve determinism, bounds, and request isolation.
4. Use the learning loop: understand -> predict -> experiment -> observe ->
   explain -> apply. Include a small example and an interview teach-back.
5. Verify real flows, meaningful input changes, failure states, both themes,
   320/768/1440 widths, keyboard/focus, reduced motion, and textual diagrams.
6. Run applicable documented local checks. Report only checks actually executed.
   Do not claim manual zoom/screen-reader or live deployment checks passed when
   unavailable. Record the exact remaining gate and continue independent work.
7. Update work-item evidence, roadmap, and affected documentation.
8. I authorize committing, pushing, opening focused PRs to main, and squash
   merging after required CI passes. Delete merged feature branches and update
   local main. Do not bypass checks or combine the entire plan into one PR.
9. Report what changed, learning outcome, checks, limitations, PR/commit, and the
   next task. Continue within this scope without asking about routine choices.

Do not add new services, authentication, paid dependencies, cloud resources,
an AI tutor, or manual deployments. Keep planned capabilities visibly unavailable.
Do not redesign the app or expand simulator semantics without a concrete need.
If a necessary user decision genuinely blocks progress, explain it precisely;
otherwise use the documented defaults and proceed.

Start by reporting the verified baseline and your HLD-05 acceptance checklist,
then implement it. Stop when the first-release scope is complete, or when no
remaining in-scope work can proceed without a specific unresolved dependency.
Do not report the release complete while a required gate remains unverified.
```

## Plan and evidence

- [Current execution plan](NEXT_IMPLEMENTATION_PLAN.md): starting point, PR sequence, cache fixtures, first-release acceptance, and checks.
- [Detailed implementation plan](IMPLEMENTATION_PLAN.md): original task definitions and longer-term expansion.
- [Roadmap](ROADMAP.md): authoritative status; partial work stays in progress.
- [Work-item template](templates/WORK_ITEM.md): scope and evidence per contribution.
- [Cache state decision](decisions/0006-cache-event-key-state.md): how to reconstruct state correctly.
- [Simulation review](SIMULATION_REVIEW.md): causality/failure regressions to preserve.

Pasting the prompt authorizes the implementation and Git workflow described in it. Preparing this handoff does not itself start that implementation or deploy the application.
