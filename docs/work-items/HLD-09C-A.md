# HLD-09C-A: native browser zoom release evidence

## Objective

Verify that enlarged text still supports actual Java results, keyboard actions and workshop decisions, and make the check repeatable for future contributions.

## Preconditions and scope

- Fresh `test/native-browser-zoom-review` from `633ef3c` (PR #47): CI passed 133 Java, 174 frontend and 93 browser journeys plus launcher smoke.
- All ten URL-shortener stages are authored but remain draft. This is a bounded technical accessibility review, not publication or a full manual accessibility sign-off.
- Existing pinned Playwright/Chromium, packaged Java and production frontend. No product code, model semantics, contract, dependency or cloud resource changes.

## Design and acceptance

- Separate `native-zoom` browser project removes the standard device profile and viewport emulation. An isolated temporary Chromium profile loads a minimal test-only extension to call the browser's native `tabs.setZoom/getZoom` APIs.
- Require reported factor 2, doubled device-pixel ratio and half-width CSS viewport: native windows 1,440/640 pixels produce 720/320 CSS pixels. No CSS transform, screenshot scaling or emulated device scale creates the result.
- Run four published modules against Java plus the draft workshop Operations path in both themes/reduced motion. Use keyboard to activate actual run/calculation/decision controls and assert results. Exercise a clearly mocked cache 503 followed by real-Java recovery.
- Reject page-level horizontal overflow. Capture native view pixels directly; PNG width must match the actual window width. Default clipped screenshots were blank in the probe, so those artifacts were replaced before review.
- Close the owned context and remove its temporary profile even if launch/close fails. Extension remains under test fixtures and is never loaded by the application.

## Verification evidence

| Check actually run | Result | Evidence |
| --- | --- | --- |
| Native zoom browser | Passed: two theme journeys / 20 flow-width-theme combinations | Real packaged Java/production frontend, native factor/DPR/CSS viewport/PNG-width assertions, result and focus checks, mocked cache error then real recovery; 20 corrected captures |
| Agent visual inspection | Passed for ten representative captures | Every flow inspected in both themes, spanning small/wide views. Local tables/navigation scroll independently; no page overflow. This is not a real screen-reader or newcomer review. |
| Lint / format / test discovery | Passed | Full frontend lint/format and explicit TypeScript compile of the native test; both projects discover 95 tests in 14 files, preserving all 93 earlier journeys |
| Plan / whitespace | Passed | 57 docs, 264 local links, 59 curriculum IDs and five catalog identities; diff check clean |
| Full frontend/backend/browser CI | Passed before merge | [PR #48 CI](https://github.com/Prem-Duvvapu/hld-with-ui/actions/runs/37975912759) passed all 133 Java, 174 frontend and 95 browser tests plus launcher smoke. Squash merged as `902dfe5`. Local checks above do not claim the full suite was rerun locally. |

## Evidence matrix

Twenty native captures cover five flows × two widths × two themes. The widths below are CSS pixels after native 200% zoom; screenshot files preserve the original 1,440/640-pixel captures.

| Flow | 320 light | 320 dark | 720 light | 720 dark |
| --- | --- | --- | --- | --- |
| Request Flow | [image](assets/hld-09c-zoom/request-flow-320-light.png) | [image](assets/hld-09c-zoom/request-flow-320-dark.png) | [image](assets/hld-09c-zoom/request-flow-720-light.png) | [image](assets/hld-09c-zoom/request-flow-720-dark.png) |
| Capacity | [image](assets/hld-09c-zoom/capacity-estimation-320-light.png) | [image](assets/hld-09c-zoom/capacity-estimation-320-dark.png) | [image](assets/hld-09c-zoom/capacity-estimation-720-light.png) | [image](assets/hld-09c-zoom/capacity-estimation-720-dark.png) |
| Rate Limiter | [image](assets/hld-09c-zoom/distributed-rate-limiter-320-light.png) | [image](assets/hld-09c-zoom/distributed-rate-limiter-320-dark.png) | [image](assets/hld-09c-zoom/distributed-rate-limiter-720-light.png) | [image](assets/hld-09c-zoom/distributed-rate-limiter-720-dark.png) |
| Cache | [image](assets/hld-09c-zoom/cache-aside-320-light.png) | [image](assets/hld-09c-zoom/cache-aside-320-dark.png) | [image](assets/hld-09c-zoom/cache-aside-720-light.png) | [image](assets/hld-09c-zoom/cache-aside-720-dark.png) |
| Workshop Operations | [image](assets/hld-09c-zoom/url-shortener-320-light.png) | [image](assets/hld-09c-zoom/url-shortener-320-dark.png) | [image](assets/hld-09c-zoom/url-shortener-720-light.png) | [image](assets/hld-09c-zoom/url-shortener-720-dark.png) |

## Reproduction and sources

`npm run e2e -- --project=native-zoom` uses the packaged backend and normal Playwright server lifecycle. Default screenshots/zoom observations stay in test results and the report. Set `HLD_ZOOM_EVIDENCE_DIR=../docs/work-items/assets/hld-09c-zoom` only for an intentional evidence refresh.

[Playwright extension testing](https://playwright.dev/docs/chrome-extensions) documents persistent isolated contexts and the Chromium channel; [Chrome tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs) defines native setZoom/getZoom. Reviewed 2026-10-09. The implementation and assertions are original.

## Handoff and limits

This automation and agent visual inspection establish the named flows at actual native zoom; they do not replace a real screen-reader journey, a newcomer teach-back, manual review of every view/stage, or verification of hosted backend freshness. HLD-09C remains in progress and the case remains outside published discovery. Next: finish the remaining technical publication checklist and obtain the explicitly open manual learning/accessibility evidence.
