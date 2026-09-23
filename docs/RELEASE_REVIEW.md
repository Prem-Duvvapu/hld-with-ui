# Release review evidence

Updated: 2026-09-23

This file records verified evidence and remaining manual checks for the shared shell and first modules. It does not mark a release gate complete by itself.

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
