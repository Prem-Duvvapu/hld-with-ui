# Opus implementation handoff

Use the prompt below in the repository. The plan is agent-independent; it does not depend on model-specific tools or hidden conversation history.

## Copy-and-paste prompt

```text
You are implementing HLD with UI: a React/TypeScript frontend and Java backend
for understanding system design through experiments and clear explanations.

Read AGENTS.md and CONTRIBUTING.md, then docs/IMPLEMENTATION_PLAN.md.
Follow its document-reading order and verify the current repository state.
The plan's baseline is commit 6df9ffa; inspect changes since then before acting.

The owner considers lld-with-ui the primary product reference and wants excellent
UI/UX, strong frontend/backend code quality, and simple explanations that transfer
to everyday engineering and SDE-2 interviews. Preserve the current visual identity.

Begin with HLD-01. Complete one bounded task per contribution, then identify the
next dependency-ready task. If a task is already complete, show the evidence and
move to the next one within the owner's requested scope. Do not implement the
entire plan in one branch or PR.

For each task:
1. Inspect git status and preserve unrelated work.
2. Read the relevant code, contracts, lessons, and tests.
3. Create a fresh branch from current main and a work item with acceptance criteria.
4. Implement a usable vertical slice. Java owns simulated behavior and metrics;
   React renders authoritative typed state and controls playback.
5. Keep contracts, generated types, catalog capabilities, content, and model
   versions aligned. Never parse narration strings to reconstruct model state.
6. Run relevant checks and record actual results. For UI work verify the real
   primary flow, mobile layouts, both themes, keyboard/focus, reduced motion,
   and loading/error/empty/limited states.
7. Update roadmap evidence and affected documentation. An unavailable manual
   check remains unverified; do not mark its release gate complete.
8. Follow the repository's branch/PR/CI/squash-merge workflow and the owner's
   current publishing authorization. Wait for required checks before merging.
9. Finish with what changed, the learning outcome, checks, limitations, PR/commit,
   and the exact next task. Stop when the owner's requested scope is complete.

Important baseline facts:
- Four modules are published: request-flow, capacity-estimation,
  distributed-rate-limiter, and cache-aside.
- Cache v1.0.1 and request-flow v1.1.1 include recent causality/failure fixes.
- Cache still needs structured playback state, guided simulation, architecture,
  and sequence views.
- URL shortener, durable progress, and search are not implemented yet.
- First-release order is request flow -> capacity -> cache -> URL shortener.
- Read docs/SIMULATION_REVIEW.md before touching the corrected simulations.

Use plain language. Finish complete learning experiences rather than adding
shallow topic lists, unsupported tabs, or animations with invented outcomes.
```

## Files to use

- [Detailed implementation plan](IMPLEMENTATION_PLAN.md): tasks, dependencies, fixtures, quality gates, and future cases.
- [Roadmap](ROADMAP.md): authoritative status and release gates.
- [Work-item template](templates/WORK_ITEM.md): per-contribution scope and evidence.
- [Latest simulation review](SIMULATION_REVIEW.md): regression history and remaining verification.

The task numbering in the implementation plan is separate from curriculum IDs. Check the live repository before trusting any historical status or test count.
