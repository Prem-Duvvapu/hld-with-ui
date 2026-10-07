# Work item: HLD-07B — capacity estimates learners can calculate and explain

## Objective

A learner can carry units from product usage to traffic, storage, bandwidth, and mean in-flight work; distinguish traffic scenarios from planning headroom; and explain why neither number guarantees production or burst capacity.

## Preconditions

- Current repository: clean `main` at `00e3848` / PR #36, fetched on 2026-10-07. HLD-05, HLD-06A/B, and HLD-07A are merged. No user changes were present.
- Relevant plans: HLD-07 capacity review in IMPLEMENTATION_PLAN and NEXT_IMPLEMENTATION_PLAN; LEARNING_STANDARD; CONTENT_SPEC; RELEASE_ONE_BLUEPRINT.
- Actual capacity code, Java estimator/API tests, lesson, formula/assumption views, and browser harness inspected before editing.

## Review findings and scope

1. `Number("")` turned cleared inputs into zero. For Read share and Planning headroom, that silently became a valid assumption. Draft values now remain strings until submission. Blank, nonfinite, fractional integer, and out-of-range values show associated errors and focus the first invalid field before any API call.
2. Browser step increments restricted decimal assumptions more than Java's bounds. Decimal fields now accept any precision within the existing range; whole-number fields remain integers.
3. Only presets were locked during calculation. The numeric fieldsets now lock too, and the first calculation has a visible pending state. Existing results remain tied to their submitted assumptions.
4. The formula map and Java calculation trail omitted the conversion from kB to GB/Mb/s. They now show the divisors; latency and percentage conversions are explicit too. Numeric calculations and schema version are unchanged.
5. Sensitivity looked like a confidence interval or a headroom-inclusive range. It now names the submitted estimate, fixed payload/latency assumptions, and exclusion of headroom. Lesson numbers distinguish 694.44 req/s High from the 752.31 req/s target.
6. Lesson/assumption map now explain mean total latency, including queueing, and distinguish requests in flight from workers. Added changed-condition examples, a wrong explanation/correction, teammate explanation, interview scaffold, and self-check.

Changed artifacts: calculator, formula/assumption views, Java formula labels, component/model/browser tests, lesson, two practice questions, resources, catalog content 1.0.0 → 1.1.0, roadmap, and this work item. No estimator arithmetic, new service, persistence, API envelope, or published topic ID changes.

## Source audit — 2026-10-07

| Source | Reviewed material | Claim supported |
| --- | --- | --- |
| Little, doi 10.1287/opre.9.3.383 | Public publisher abstract; finite averages and stationary-process conditions | Average items in a system relate to arrival rate and total time under stated conditions. An assumed peak workload is an approximation, not proof of those conditions. Full paper access was not needed or claimed. |
| Google SRE, Load Balancing at the Frontend | DNS routing/capacity discussion | Capacity and infrastructure health inform frontend routing. |
| Google SRE, Load Balancing in the Datacenter | Least-Loaded Round Robin limitations | Active requests may spend time waiting on dependencies; active-request count need not represent CPU capacity. Added `google-sre-datacenter-load`. |
| AWS PERF05-BP04 Load test your workload | Implementation guidance and steps | Whole-workload tests under realistic conditions with explicit objectives, metrics, and expected/larger loads. Existing `aws-performance-efficiency` ID now links to this precise page. |

The formula conversions and numerical examples are original arithmetic checked against Java, rather than claims borrowed from the sources. Original prose is used throughout.

## Acceptance

- [x] Cleared Read share/headroom stays blank, shows an accessible error on submit, and makes no request; explicit zero is accepted.
- [x] Integer/range errors are rejected locally; supported decimal precision is sent to Java.
- [x] Pending calculations lock assumptions/presets, preserve the submission, and can recover after failure.
- [x] Formula map, Java trail, and lesson state kB/GB, kB/Mb, ms/s, and percentage conversions explicitly.
- [x] Changing read share to 99% yields 109.5 GB of copies with unchanged response bandwidth. Doubling latency doubles mean in-flight requests. Headroom changes target rate while sensitivity excludes it.
- [x] Lesson includes a teammate explanation, interview scaffold, two changed conditions, tempting wrong explanation/correction, and self-check.
- [x] Local browser coverage and full applicable build/component/model checks completed and recorded below; required PR CI is checked before merge.
- [ ] Manual 200% zoom, screen reader, and newcomer teach-back remain pending release gates.

## Verification evidence

| Check actually run | Result | Artifact |
| --- | --- | --- |
| Targeted capacity component tests | 8/8 passed | Empty input/explicit zero, integer/range, precision, pending lock, submission association |
| Targeted Java CapacityEstimatorTest | 5/5 passed | Baseline, doubled peak, schema rejection, 99% reads, changed latency/headroom |

| `./mvnw -B verify` | 93/93 tests passed; package built | All model/API/guided-content regressions |
| Frontend contracts, typecheck, lint, format check | passed | 18 questions, 8 checkpoints; generated types unchanged |
| `npm test` and `npm run build` | 97/97 tests passed; production build passed | 14 component/test files |
| Full local browser run | 50 checks reported passing before termination (exit 143); not a complete suite pass | No failed assertions reported; owned servers cleaned up |
| `playwright test --grep '1440px|capacity'` | 17/17 passed | All four new capacity cases, capacity layout at 320/768/1440 × both themes, and all remaining 1440 layout cases |
| Desktop light / 320px dark screenshots | inspected | Browser artifacts in ignored `frontend/test-results/`; no layout redesign |
| Plan/content validation and shell syntax | passed | 40 documents, 135 links, 4 catalog identities, 18 questions, 8 checkpoints |

The full 56-test browser suite and launcher smoke run again in required PR CI; see the pull request for final CI evidence. Manual 200% zoom, screen-reader and newcomer checks were not performed.

## Handoff

P2-01 stays **in progress** while manual accessibility/learning review is outstanding. The next implementation item is HLD-07C: rate-limiter source/claim and learning review. HLD-08 persistence follows the existing-module alignment work.
