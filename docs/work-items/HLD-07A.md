# Work item: HLD-07A — request flow teaches the failure behavior it actually runs

## Objective

A learner can predict and explain what the node-failure preset does: under FAIL, node B's running and queued requests fail at 50 ms while node A completes its three. They can say what the model leaves out (instant failure detection, no retries) and why that matters in production.

## Preconditions

- Roadmap dependencies and their evidence: P1-02 (model v1.1.1 with failure schedules) and P1-04 done; cache work HLD-05/06 merged (#32, #34, #35).
- Relevant documents: HLD-07 "Request flow" in the [implementation plan](../IMPLEMENTATION_PLAN.md); [learning standard](../LEARNING_STANDARD.md).
- Current repository state: `main` at `7d7c300`.

## Scope

Review findings that this item fixes:

1. The lesson said the model "omits ... node failure"; model 1.1.1 runs failure schedules with FAIL and COMPLETE. The lesson now explains both with Java's numbers.
2. The Request sequence view said overhead is excluded "in model v1.0.0"; the current model is 1.1.1. It now names no version and adds that failures are detected instantly.
3. The Architecture view said the balancer "selects a healthy node" without saying how it knows; it now says detection is instant in this model and takes several check intervals in practice.
4. No browser journey ran the failure preset against Java, and request-flow keyboard playback had no browser check.

- Changed: request-flow lesson (node-failure section, retry follow-up, a tempting wrong explanation), Architecture and Sequence text, one new prediction question (`request-flow-node-failure`), the source `aws-alb-health-checks`, and content 1.0.0 → 1.1.0. `ApplicationApiTest` counts follow the content (4 questions, 3 sources).
- Unchanged: the model, presets, playback, and six-request arithmetic.
- Explicit exclusions: adding health-check delay or retries to the model, which would be a separately versioned feature.

## Numbers and how they were obtained

All values come from the packaged Java model 1.1.1:

| Run | Result |
| --- | --- |
| node-failure preset, FAIL | Requests 1/3/5 complete at 100/200/300 ms on node A; 2 (running) and 4/6 (queued) fail at 50 ms; 3 completed, 3 failed, 10.0 req/s |
| Same with COMPLETE | All six complete at 100/200/300 ms, as in the baseline; 20.0 req/s |
| FAIL plus three arrivals at 50 ms (imitating retries) | All three go to node A and complete at 400/500/600 ms |

The source [AWS ALB health checks](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html) was read on 2026-10-05. It says the balancer routes only to healthy targets and removes a target after consecutive failed checks, with a 30-second interval and a threshold of 2 by default.

## Acceptance

- [x] Lesson, Architecture, and Sequence agree with the FAIL/COMPLETE rules and the model version; exclusions (detection delay, retries, cancellation, network latency) are explicit.
- [x] Six-request arithmetic and the existing failure regression tests are unchanged.
- [x] Node-failure preset verified against Java in the browser (3 completed, 3 failed, 10.0 req/s).
- [x] Keyboard playback in the browser: slider arrow, Next (Enter), Reset (Space).
- [x] Incomplete runs, outcome reconciliation, and changed-input labeling were already covered by `Playground.test.tsx` (limited traces, failed outcomes, stale-result status); no change was needed.
- [ ] Manual zoom/screen-reader review — **pending** (release gate).

## Verification evidence

| Check actually run | Result | Artifact or reproduction |
| --- | --- | --- |
| Java runs listed above | as shown | Packaged jar, probe on a separate port |
| `./mvnw -B verify` | pass, 91 tests | `ApplicationApiTest` counts updated to 4 questions and 3 sources |
| `contracts:check`, `typecheck`, `lint`, `prettier --check` on changed files | pass | 16 questions |
| `npm test` | 91/91 pass | |
| Full `playwright test` | 52/52 pass | 50 + node-failure preset against Java + request-flow keyboard playback |

## Handoff

P1-04 and P1-05 stay **in progress** until the manual review is recorded. Next: HLD-07B (capacity estimation).
