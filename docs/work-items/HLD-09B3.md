# HLD-09B3: URL-shortener Evolution and Failures

## Objective

Choose a scaling change because it removes a named bottleneck, preserve eligibility/ownership under failures, and explain the freshness/availability tradeoff without treating a cache icon as correctness evidence.

## Preconditions

- Baseline `a62e356` (PR #44): six draft stages and bounded native walkthroughs. PR CI passed 121 Java, 174 frontend and 89 browser tests plus launcher smoke.
- Fresh `feat/url-shortener-evolution-failures` from updated `main`; preserve unrelated owner `output/` artifacts.
- Implementation/quality/learning/content/first-release acceptance inspected. Primary Microsoft cache-aside and AWS timeout/retry references reviewed on 2026-10-09.

## Scope and design

- Add `evolution` and `failures`, making eight draft stages at content version 1.3.0. Reuse current walkthrough contract, answer lifecycle and renderer; no new simulation, service, database or dependency.
- Worked strict design caches immutable mapping bytes under a stated payload/decoding bottleneck; primary eligibility remains current. One metadata read on hit or one full read on miss preserves the truthful primary QPS budget. Keep simpler baseline unless measurement justifies the candidate.
- Add cache-hit/miss paths and separate cache outage, primary outage, stale revoked and stale expired paths. Explain hot-link saturation, admitted fallback, lost-create recovery, total retry budgets and bounded amplification. Distinguish generic Java model observations from this proposed service.
- Java-check the actual preset claims and changed TTL behavior; preserve protocol/status/ownership boundaries. See [decision 0013](../decisions/0013-strict-workshop-cache-eligibility.md).
- Explain interior horizontal scrolling; routine HLD-09B2 browser screenshots now stay in test results rather than overwriting historical evidence.

## Acceptance

1. Eight stages and version match packaged delivery; the case remains excluded from published discovery; incomplete publication fails.
2. The cache-hit/miss paths count primary reads correctly and never authorize redirects from stale eligibility.
3. All four illustrated failure paths have explicit, consistent status/Location behavior; prose covers hot links, retries, ownership and concurrent takedown limits.
4. Worked quantities and experiment labels/outcomes agree with the actual Java estimator/models, including a meaningful changed TTL run and constant-availability/cold-cache limits.
5. Native keyboard controls, full text equivalents, mobile/themes/reduced motion, stage focus, revisions/reload and no note POSTs work.

## Verification evidence

| Check actually run | Result | Evidence |
| --- | --- | --- |
| Java | Passed: 127 tests | `./mvnw -B verify` packaged all eight stages. Six new cross-module tests verify model/preset quantities, changed TTL, arithmetic scope and diagram/prose policy. |
| Frontend | Passed: 174 tests | Contracts/generated drift, typecheck, lint, format and production build. New browser test formatting was applied after this run. |
| Content | Passed: 15 negative fixtures | Eight stages validate; publication still rejects missing Operations/Defense. Sources, links, path identities and bounds remain checked. |
| Real-Java browser / UI screenshots | Passed: 12 journeys | All workshop journeys and six new paths, transcripts, storage, keyboard/theme/responsive/reduced-motion checks; eight screenshots captured, with representative mobile/desktop images inspected in both themes. Full PR CI also runs all 91 browser journeys. |
| Plan / whitespace / launcher | Passed | Plan validator: 54 docs, 221 links, 59 curriculum IDs, five catalog identities. Whitespace/syntax and real launcher smoke passed; Ctrl+C freed ports/stopped all six descendants and occupied-port handling preserved the unrelated process. |
| Manual zoom / screen reader / teach-back | Not performed | Remain publication gates |
| Hosted backend | Unresolved | Existing [incident](../INCIDENTS.md); no authenticated deployment capability |

### UI evidence

| Stage | Mobile light | Mobile dark | Desktop light | Desktop dark |
| --- | --- | --- | --- | --- |
| Evolution | [320px](assets/hld-09b3/evolution-320-light.png) | [320px](assets/hld-09b3/evolution-320-dark.png) | [1440px](assets/hld-09b3/evolution-1440-light.png) | [1440px](assets/hld-09b3/evolution-1440-dark.png) |
| Failures | [320px](assets/hld-09b3/failures-320-light.png) | [320px](assets/hld-09b3/failures-320-dark.png) | [1440px](assets/hld-09b3/failures-1440-light.png) | [1440px](assets/hld-09b3/failures-1440-dark.png) |

These images accompany real browser interaction checks; they do not establish manual screen-reader or learning-mastery evidence.

## Handoff

Next: HLD-09B4 Operations/Defense, including signals, protected takedown/abuse controls, bounded migration/rollback and clear interview explanations. All ten stages and release evidence are needed before HLD-09C publication. Shared discovery/progress, queues/retries/idempotency, foundations and other integrated cases remain outside this slice and inside the active goal.
