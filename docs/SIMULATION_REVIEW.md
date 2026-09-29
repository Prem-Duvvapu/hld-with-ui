# Simulation review — 2026-09-29

Reviewed changes after rate-limiter PR #12 (`c94f547`) through PR #19 (`5511d71`), focusing on the new shared runner, request-flow failure schedules, cache-aside module, API contracts, and deployment configuration. This is a bounded code and behavior review, not a claim that every release gate is complete.

## Findings fixed

| Severity | Problem | Correction / regression evidence |
| --- | --- | --- |
| High | Cache fills were applied before their virtual completion time. The cold-burst test explicitly asserted the incorrect hits. | A stable event queue now yields five misses and five origin reads for the five-request preset. Overlapping and unsorted operations preserve time order. |
| High | Queued request-flow work could start while a node was down. COMPLETE recovery discarded worker occupancy, creating extra capacity. | FAIL drops running and queued work; COMPLETE preserves occupancy; tests cover multiple outage windows and exact boundary times. |
| High | Cache ignored event, virtual-time, and byte budgets. | Shared bounded emission, explicit partial status, incomplete GET counts, and observed-trace metrics. |
| Medium | Missing keys could be cached as null and later crash on a hit. Staleness compared text instead of versions. | Missing keys are not cached; explicit origin version counters handle same-value updates. |
| Medium | Cache bypasses and origin errors appeared as normal misses, and writes succeeded during origin outage. | BYPASS/ERROR outcomes, separate counters, rejected outage writes, and documented hit-ratio denominator. |
| Medium | Operation times/strings were insufficiently bounded, allowing overflow or large payloads. | Enforced schedule/key/value bounds and required fields; API regressions reject invalid schedules and retired versions. Failure schedules are bounded and reject null entries. |
| Medium | Byte estimation undercounted non-ASCII and JSON-escaped strings. | Conservative escaped-string accounting includes array and numeric overhead. |
| Medium | Cache results stayed visible after edits; pending runs allowed contradictory preset changes. | Edits invalidate results, pending controls are disabled, and descriptor seeds/versions are preserved. |
| Medium | Cache component classes had no CSS definitions; page minimum width caused 320px overflow. | Scoped theme-token styles, readable scrollable tables, and removal of the fixed page minimum width. |
| Low | Agent/project docs claimed no implementation existed; the roadmap's next step was already implemented. | Current-state and next-step descriptions now match the repository. |

## Verification

- Backend: `./mvnw -B verify` — 83 tests, zero failures; packaged Spring Boot jar.
- Frontend: typecheck, ESLint, Prettier, 31 Vitest tests, and production build passed.
- `npm run contracts:check` — generated types match OpenAPI; four catalog entries, 13 questions, two API examples, prerequisites, and capabilities validate.
- Planning links/IDs and launcher shell syntax validate.
- Real Chrome through DevTools Protocol, with the local Vite server and packaged Java backend: baseline has two origin reads; cold burst has five origin reads and zero hits; cache outage has three bypasses and zero misses.
- Browser viewport widths 320, 768, and 1440, light/dark themes, reduced-motion enabled: document scroll width equals client width (305, 753, and 1425px respectively with the desktop scrollbar).
- Keyboard Tab moves between focusable GET-outcome and event-trace scroll regions. A run ending at the virtual-time budget shows one incomplete GET. Blocking the run endpoint displays a visible error.
- Empty/loading states and changed-input behavior are covered by UI tests and browser inspection.

Screenshots: [desktop light](review-images/cache-1440-light.png), [mobile-width dark](review-images/cache-320-dark.png).

## Model compatibility and limits

Cache is now v1.0.1 and scheduled-failure request flow is v1.1.1. Their buggy predecessor versions are rejected. See [decision 0004](decisions/0004-simulation-causality-corrections.md) for timing rules and migration details. Cache availability is constant within a run and every run starts cold; the origin-outage preset does not demonstrate prewarmed cache hits.

No live Render/Vercel deployment or container build was performed. The browser review does not substitute for a screen-reader walkthrough, real-device testing, 200% browser zoom, or a complete accessibility audit. Guided cache playback and architecture/sequence views remain unfinished. The next unblocked release work is the remaining accessibility review and cache module views; the URL shortener workshop follows those gates.
