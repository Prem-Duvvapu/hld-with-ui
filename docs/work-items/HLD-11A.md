# Work item: HLD-11A — Bound HTTP simulation resources

## Objective

Keep a learner's experiment usable when the HTTP workload/result is too large or the Java
process is already running simulations. Explain the failure clearly, preserve inputs, and
require an explicit retry without manufacturing a successful trace.

## Preconditions

- Main baseline `c619b72` (PR #57); four published modules, draft ten-stage URL-shortener workshop.
- Runner event/time/trace limits and HLD-04C serialization/isolation evidence already exist.
- Read project, architecture, simulation, learning, content and quality specifications.
- Implementation worktree starts clean on a fresh branch; owner's unrelated `output/` assets remain untouched.
- HLD-11 release verification can proceed independently while human review remains pending.

## Scope

- Java configuration, API POST body filter, shared synchronous admission, bounded successful-result serialization.
- All three run controllers, structured errors, OpenAPI statuses and timestamp, generated types.
- Actual Java HTTP and boundary/configuration tests; browser contract/error/retry journeys.
- README, architecture/simulation specification, roadmap and decision 0021.
- No new curriculum module, model behavior, services, server run storage, asynchronous execution,
  UI redesign, automatic retry or publication change. URL shortener stays draft.

## Design

Inputs → immediate admission/body validation → authoritative Java run → bounded complete
serialization → React result or readable error. Details and tradeoffs are in
[decision 0021](../decisions/0021-http-simulation-resource-guards.md).

413 means reduce the submitted body; 422 means reduce the run to obtain a deliverable result;
503 means keep the workload and retry explicitly later. These are app safeguards, distinct
from a modeled rate-limiter decision. A result-byte cap covers successful simulation JSON,
not every error/content/estimator response. The default two permits belong to one Java process.

## Acceptance

1. Inclusive body/output byte boundaries account for Unicode and JSON escaping. Unknown-length
   bodies and accepted alternate path representations cannot bypass body/admission limits.
2. All run models share admission before parsing; reads remain reachable while one permit is
   held. Release on malformed/invalid/unknown/model/serialization/write failures.
3. Oversized output returns one structured error, never partial success JSON. Existing tiny
   semantic fixtures and maximum-count escaped workloads still run under production defaults.
4. Startup rejects invalid/out-of-range limits. OpenAPI matches the actual ApiError timestamp.
5. Errors leave controls usable and inputs unchanged; retries are explicit. Previous-result
   behavior matches each existing model. Keyboard recovery fits both themes at 320/768/1440
   widths under reduced motion.
6. Applicable local and required CI checks pass before squash delivery. Remaining release
   gates stay visible; this work does not declare the whole first release complete.

## Measurement evidence

Measurements on 2026-10-10: Java 17, Node 20.19.4, Linux/WSL 6.18.40.1, four logical CPUs.
Single sequential observations, not load benchmarks. Body and response are complete encoded
JSON byte lengths; timing includes varying warmup and shared host load. No render-cost claim.

| Current fixture | Request bytes | Response bytes | Result |
| --- | ---: | ---: | --- |
| Request-flow six-request baseline | 178 | 5,923 | completed |
| Cache-aside baseline | 404 | 4,044 | completed |
| Rate-limiter baseline | 276 | 4,449 | completed |
| Cache 100 maximum escaped updates | 197,360 | 366,311 | completed |
| Cache 50 maximum escaped update/read pairs | 119,882 | 835,283 | completed |
| Cache 100 reads after maximum escaped initial value | 5,483 | 659,738 | completed |
| Limiter 500 requests / 20 clients | 1,261 | 253,447 | completed |
| Flow 100 requests / 8 slow nodes, 10,000 ms service | 407 | 69,694 | limited: virtual-time budget |

After adding guards, real HTTP default-budget tests also verify 100-request/8-node flow
with 100 ms services (391 request / 92,178 response bytes), the limiter maximum and both
escaped cache fixtures, including completed statuses and outcome counts. These observations
support current fixture compatibility; they do not prove every possible input combination,
hosted throughput, generation/render budgets or total heap safety.

## Verification evidence

| Check actually run | Result | Artifact or reproduction |
| --- | --- | --- |
| `cd backend && ./mvnw -B verify` | PASS: 182 tests, no failures/errors/skips; packaged jar | `/tmp/hld-http-java-verified.log` |
| Frontend contracts, typecheck, lint, format, Vitest, build | PASS: 26 content-negative fixtures, 273 unit tests, production build | Full CONTRIBUTING frontend gate; `/tmp/hld-http-build.log` |
| Plan, launcher syntax, diff checks | PASS: 75 docs, 372 links, 59 curriculum IDs, 5 catalog identities | `node scripts/validate-plan.mjs`, `bash -n start.sh`, `git diff --check` |
| `cd frontend && npm run e2e` (after builds finish) | PASS: 139 browser journeys, including 12 resource checks and 2 native 200% zoom journeys | `/tmp/hld-http-final-browser.log`, separate `/tmp/hld-http-final-browser-results` |
| Required PR CI | Results recorded on the PR; all required checks must pass before merge | Check the exact contribution head before squash delivery |

Parallel read-only review caught the existing missing timestamp in OpenAPI and a test
ordering race: response receipt can precede filter permit release. Schema/real-response
regressions and bounded test-only admission polling address them. Routing probes on Tomcat
found ordinary matrix/encoded-letter paths guarded; real HTTP regressions preserve that result.
The first Java fixture attempts failed on test Unicode formatting and an incorrect collection
name; both were corrected against actual JSON before the passing verify above.

### Local browser rebuild interference

The first complete local browser run finished with 137 passing and two failing existing
journeys. While the preview was running, the separate frontend quality gate reached its
Vite build and replaced `dist`. Both failure traces show static assets/document 404 at
12:46:28 UTC (one with “Unable to preload CSS”), rather than Java errors. Neither failed
assertion was weakened and no production workaround was introduced. CONTRIBUTING now
explicitly requires completed builds before browser servers start. The sequential full-suite
rerun passed all 139 tests; both native zoom tests and all 12 new resource tests passed in the
initial run. This failed attempt is not counted as a full-suite pass.

## Browser evidence

The mocked busy-error rendering was captured after scrolling to the page top, in reduced
motion, both themes and three widths. Mobile light and desktop dark images were visually
inspected; automated assertions check focus, overflow and explicit real-Java recovery for all
six layouts. Images show app error handling, not an actual Java admission event.

- [320 light](assets/hld-11a/busy-320-light.png)
- [320 dark](assets/hld-11a/busy-320-dark.png)
- [768 light](assets/hld-11a/busy-768-light.png)
- [768 dark](assets/hld-11a/busy-768-dark.png)
- [1440 light](assets/hld-11a/busy-1440-light.png)
- [1440 dark](assets/hld-11a/busy-1440-dark.png)

## Handoff

P2-05 remains **in-progress**. Screen-reader/newcomer review, broad release-flow review,
clean-checkout/container startup, generation/render/heap/load budgets and actual deployed
Java/frontend freshness remain open. Slow connections, server threads and multi-replica quotas
are separate operational limits. Automated screenshots are rendering evidence, not human
accessibility or teach-back review. The next independent work item is clean-checkout and
packaged/runtime verification, followed by the remaining first-release gates before expansion.
