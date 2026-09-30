# Work item: HLD-03 slice 1 — a repeatable browser harness

## Objective

Any contributor or CI run can verify real learner journeys in a browser with one command, instead of rebuilding an ad hoc script. First slice of HLD-03; the plan sizes HLD-03 as "browser harness, then findings".

## Preconditions

- Roadmap dependencies and their evidence: HLD-02 merged (#24).
- Relevant documents: [implementation plan §6 HLD-03](../IMPLEMENTATION_PLAN.md#6-detailed-first-release-work), ARCHITECTURE (Playwright was the chosen, not-yet-implemented test tool).
- Current repository state: clean `main` at `44119ae`.

## Scope

- Added: `@playwright/test` 1.63.0 (pinned; uses Chromium revision 1243), `frontend/playwright.config.ts`, `frontend/e2e/modules.e2e.ts`, `npm run e2e`, a `browser` CI job, CONTRIBUTING commands, Playwright output in `.gitignore`.
- Fixed (found by the harness): at ≤900px the playground grid used a `1fr` column, which cannot shrink below its content. After a run, request flow was 164px and the rate limiter 99px wider than a 320px screen. The column is now `minmax(0, 1fr)`.
- Explicit exclusions (remaining HLD-03 work): mocked loading/error/unsupported-version cases, cache limited-run and cold-burst journeys, the 768/1440 matrix, focus checks, the fresh-checkout launcher smoke with occupied ports, and manual 200% zoom / screen-reader journeys.

## Design

`playwright.config.ts` starts the packaged Spring Boot jar and then `vite build && vite preview`, on ports 18080/14173 (overridable). Readiness waits on the backend health URL and on the same URL through the preview proxy, so readiness also proves frontend-to-Java routing. Timeouts are bounded; Playwright stops only the processes it started. Test files use `.e2e.ts` so Vitest does not collect them. The config refuses to start without the packaged jar and says how to build it.

Each module journey checks a Java-derived value, changes one meaningful input, and checks that the value changes. Expected values come from the plan's fixtures or were computed by calling the Java API with the first preset:

| Module | Baseline | Change | Result |
| --- | --- | --- | --- |
| Request flow | mean 200.0 ms, p95 300 ms, 20.0 req/s | arrivals `0, 0` | 2 completed, mean 100.0 ms |
| Rate limiter | 3 rejected | limit 6 | 2 rejected |
| Cache-aside | 3rd GET is a stale HIT; 2 origin reads | TTL 0 | 4 origin reads, 0 hits |
| Capacity | target peak 752.3 req/s | peak factor 8 | 1,203.7 req/s |

## Acceptance (this slice)

- [x] One documented command runs real-API browser journeys against the packaged backend and production build.
- [x] It fails for a broken layout: the 320px overflow checks failed (164px, 99px) before the CSS fix.
- [x] Covers tab-state preservation, browser history, unsupported views, and unknown routes.
- [x] No fixed sleep substitutes for readiness.
- [ ] Mocked error/unsupported-version cases, launcher smoke, full viewport matrix, manual zoom/screen reader (next slice).

## Verification evidence

| Check actually run | Result | Artifact or reproduction |
| --- | --- | --- |
| `npm run e2e` locally (WSL, Node 20.19, Java 17) | 14/14 pass | 4 module journeys, 2 navigation journeys, 8 overflow checks (4 modules × light/dark, 320px, reduced motion) |
| Same suite before the CSS fix | 5 failed | 4 overflow checks (request flow 164px, rate limiter 99px, both themes) and one locator bug in the test, fixed |
| Frontend gate and CI `browser` job | see PR | Recorded in the pull request |

## Handoff

The next task is the rest of HLD-03: mocked failure states, the launcher smoke, the full viewport/theme/focus matrix, and the manual journeys. HLD-04 (structured cache state) needs this harness and HLD-01, so it can start in parallel once the owner chooses.
