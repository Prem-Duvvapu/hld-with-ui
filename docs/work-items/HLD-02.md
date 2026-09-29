# Work item: HLD-02 — keep the learner's work when moving between views

## Objective

A learner can edit inputs, run an experiment, read the Study tab or answer Practice, and come back to find their inputs, result, playback position, and draft answers exactly as they left them. Version labels say what they version.

## Preconditions

- Roadmap dependencies and their evidence: HLD-01 merged (#22, correction #23).
- Relevant documents and reference module: [implementation plan §6 HLD-02](../IMPLEMENTATION_PLAN.md#6-detailed-first-release-work), `ModuleShell.tsx`, the four module pages. lld-with-ui keeps its tab in `sessionStorage` and conditionally renders panels, so it offers no history behavior to copy.
- Current repository state and existing user changes: clean `main` at `21755f9`.

## Scope

- Artifacts to add/change: `ModuleShell.tsx` (+ test), the four module pages, request-flow/rate-limiter/cache-aside/capacity feature components and tests, `ModuleNavigation.test.tsx`, a scoped `[hidden]` style, ARCHITECTURE §5, ROADMAP P0-03, plan gap annotations.
- User-visible behavior: tab round trips keep state; Back/Forward move between tabs; unsupported `?view=` becomes the default; the header pill reads `CONTENT v…`; the cache playground shows `Java model · v1.0.1`.
- Stable IDs/contracts touched: none. Routes and `?view=` values are unchanged; no API change.
- Explicit exclusions: durable storage (HLD-08); aligning cache-aside's "clear result on edit" with the other modules' "label the old result" policy (HLD-07); a repository browser harness (HLD-03).

## Design

- **Keep visited panels mounted.** Each tab gets its own `tabpanel` section. A panel mounts on its first visit and is then hidden, not unmounted. Feature state stays where it is; no state library or lifted reducer is needed. Unvisited panels are not rendered, so first load stays as cheap as before.
- **Pause what runs on its own.** `usePanelActive()` reports whether the caller's panel is selected. Request-flow playback pauses when its panel is hidden and waits for the learner to press Play.
- **History.** Selecting a tab pushes a history entry; the default view has no `?view=`. An unsupported value is replaced by the default without a history entry.
- **Pending runs.** Presets are disabled while a run or calculation is pending in request flow, rate limiter, and capacity (cache-aside already did this). Only one request can be in flight, so an older response cannot replace a newly selected preset.
- **Versions.** The header shows `topic.contentVersion` as content. Simulation playgrounds show the descriptor's Java model version. The capacity estimator has no model version in its contract, so none is shown.
- **Refresh.** State lives in memory. Reload or leaving the module starts it fresh until HLD-08.

## Acceptance

- [x] Input, run result, playback position, and practice answer survive tab changes.
- [x] Navigation triggers no extra run and no refetch.
- [x] Back/Forward move between tabs; direct `?view=` links work; unsupported views normalize to the default.
- [x] Labels identify the content version and the Java model version separately.
- [x] Changing modules does not carry state from one module to another.
- [x] Keyboard: arrows/Home/End move focus only; Enter/Space select. Panels are labelled by their own tabs; document titles follow the view.
- [x] Hidden playback stops; pending runs cannot be overtaken by a preset change.

## Verification evidence

| Check actually run | Result | Artifact or reproduction |
| --- | --- | --- |
| New `ModuleNavigation.test.tsx` against the old shell | 5 of 6 failed as intended | Inputs/answers reset, Back left Playground, `?view=bogus` stayed, no content label; the module-switch case already passed |
| Same tests after the change | 6/6 pass, five consecutive runs | One test first waited incorrectly on router commit; fixed with `waitFor` |
| Pause and pending-preset tests with each guard removed | each fails; passes with the guard | Request flow, rate limiter, capacity |
| Full frontend and planning gate | see PR | Recorded in the pull request |
| Browser journey: real Vite dev server + packaged Java backend, Playwright Chromium 1243 | 44/44 before the label capitalization; 43/44 after | The one failure read the old `Content` text because the running dev server did not reload the edited file on this WSL `/mnt/c` checkout; the unit test covers `CONTENT` |
| Browser matrix: 320/768/1440 × light/dark, reduced motion | pass | No document overflow on Playground, Study, or Practice; results kept after tab round trips; manual stepping works with reduced motion |

Not performed: screen-reader walkthrough, 200% browser zoom, and a production-build browser run. P0-03 stays `in-progress`.

## Handoff

Remaining limitations: learner state does not survive reload (HLD-08). Cache-aside clears results on edit while other modules label them (HLD-07). The browser journey is a scratch script, not a repository check (HLD-03).

**Next dependency-ready task:** HLD-03 — repeatable browser and startup verification. It depends only on HLD-02.
