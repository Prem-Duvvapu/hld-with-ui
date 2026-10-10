# Release review evidence

Updated: 2026-10-10

This file records verified evidence and remaining manual checks for the shared shell and first modules. It does not mark a release gate complete by itself.

## Current technical evidence

The sections below retain the September baseline. Current merged automated evidence is 182 Java tests, 273 frontend tests and 139 browser journeys plus two launcher smoke scenarios in [PR #58](https://github.com/Prem-Duvvapu/hld-with-ui/pull/58), squash commit `7e61a5d`, checked at contribution head `2aeb49f` ([CI run](https://github.com/Prem-Duvvapu/hld-with-ui/actions/runs/38053790520)). The earlier [PR #51](https://github.com/Prem-Duvvapu/hld-with-ui/pull/51) counts are historical. [HLD-10A](work-items/HLD-10A.md) records published-content search behavior and limits. The final documentation commit requires passing CI before merge. All ten authored URL-shortener stages remain draft; see [HLD-09B4](work-items/HLD-09B4.md). [HLD-04C](work-items/HLD-04C.md) verifies actual serialized trace scope and simultaneous HTTP isolation.

[HLD-09C-A](work-items/HLD-09C-A.md) adds native 200% Chromium zoom checks for the four published module result flows and workshop Operations: 720/320 CSS pixels, both themes, reduced motion, keyboard actions and cache error/recovery. Its native-pixel screenshots supplement assertions; the standard mobile tests remain separate. These are bounded automated/agent visual checks. Real screen-reader, newcomer teach-back and broader manual view/stage review remain open.

## Packaged runtime and fresh-checkout evidence

[HLD-11B](work-items/HLD-11B.md) records a fresh source-only checkout at `7e61a5d`, locked
frontend installation, Java verify and the full frontend gate. The jar-only smoke copies just
the executable jar into an empty temporary runtime directory. Delivered metadata, complete
lesson text, questions, checkpoints and workshop content agree with the canonical source
(accounting for omitted null fields/default empty walkthroughs); each published simulation/
estimator baseline runs, draft discovery/path availability stays honest, and cleanup releases
its owned process/port. A healthy-but-mismatched artifact is deliberately rejected.

The CI Packaged runtime job additionally builds the existing Dockerfile from root and checks
the Java 17 JRE image without mounts. Its actual result is recorded in HLD-11B/PR evidence;
local Docker is unavailable because Docker Desktop WSL integration is disabled. Neither a
successful image nor these fixture limits establish production heap/throughput capacity.

Hosted verification remains **failed/incomplete**: warmed Render/proxy responses still have
old content/model versions, broken flow/cache runs and case/path 500s. The frontend responds,
but this does not close backend freshness. See [the incident](INCIDENTS.md).

Current production-build observations (2026-10-10, Node 20.19.4; raw/gzip decimal kB):

| Artifact | Raw | Gzip |
| --- | ---: | ---: |
| Main entry JS | 304.45 | 95.98 |
| Shared lazy JS chunk | 122.04 | 38.01 |
| Shared CSS | 39.82 | 8.32 |
| Request-flow route JS | 20.03 | 6.25 |
| Cache route JS | 34.08 | 10.18 |
| Workshop route JS | 13.87 | 4.87 |

These are build artifact sizes, not browser render time, sustained capacity or a measured
performance budget. Tiny/maximum generation and production-browser HTTP/render/seek baselines are now recorded in
[PERFORMANCE_REVIEW.md](PERFORMANCE_REVIEW.md) and [HLD-11C](work-items/HLD-11C.md). Initial
lesson/loading, heap/load/network budgets and measured rendering improvements remain open.

## Automated interaction review

Verified for the shared module shell:

- each tab has a stable ID and references its tab panel;
- the tab panel references the selected tab and is keyboard focusable;
- arrow, Home, and End keys move focus without changing the selected view;
- activating a tab changes the URL-selected view;
- each module view updates the document title;
- returning home and unknown routes restores a meaningful document title;
- the brand uses client-side navigation;
- route-level lazy loading has an announced loading state.

Verified for interactive results:

- request-flow keeps its diagram tied to the submitted workload when controls change;
- capacity results keep formulas tied to the submitted assumptions when controls change;
- both modules show a visible and announced stale-result message until rerun;
- request-flow automatic playback does not announce every animation frame and stops at the final event;
- primary inputs expose a concise accessible name and a separately associated unit or help description;
- server and client validation errors mark the affected input and are included in its accessible description;
- loading decoration is hidden from assistive technology.

Regression coverage lives in `ModuleShell.test.tsx`, `Playground.test.tsx`, and `CapacityCalculator.test.tsx`.

## Automated browser layout review

Headless Chrome was driven through the DevTools protocol against the running React and Java applications. In each checked viewport, `document.documentElement.scrollWidth` equaled `window.innerWidth`; the module route and view-specific document title also matched.

| Viewport and state                      | Evidence                                                             |
| --------------------------------------- | -------------------------------------------------------------------- |
| Request Flow, 320 × 900, light          | [Screenshot](review-artifacts/2026-09-23/request-flow-320-light.png) |
| Capacity Estimation, 768 × 1000, dark   | [Screenshot](review-artifacts/2026-09-23/capacity-768-dark.png)      |
| Capacity Estimation, 1440 × 1000, light | [Screenshot](review-artifacts/2026-09-23/capacity-1440-light.png)    |

These screenshots verify initial-state layout and theme rendering. They do not prove keyboard operation, screen-reader output, zoom behavior, or completed-result layouts.

## Build baseline

Measured with the production Vite build on 2026-09-23. These are generated artifact sizes, not runtime performance measurements.

| Artifact                  |       Raw |     Gzip |
| ------------------------- | --------: | -------: |
| Initial JavaScript        | 270.58 kB | 86.20 kB |
| Shared study view         | 123.57 kB | 38.42 kB |
| Request Flow route        |  15.54 kB |  5.01 kB |
| Capacity Estimation route |  12.27 kB |  4.14 kB |
| Shared CSS                |  29.73 kB |  6.61 kB |

Route splitting keeps module code out of the initial JavaScript entry. No performance budget is set from this single measurement.

## Manual review still required

- complete each primary flow at 320, 768, and 1440 CSS pixels;
- inspect both themes and 200% browser zoom;
- complete a keyboard-only journey through both modules;
- verify reduced-motion behavior;
- complete at least one screen-reader walkthrough of Request Flow;
- inspect completed-result layouts at desktop and mobile sizes in both themes;
- confirm loading, backend error, validation error, empty, and completed states in a real browser.

Until those checks are recorded, `P0-03`, `P1-05`, and the Capacity Estimation release review remain in progress.
