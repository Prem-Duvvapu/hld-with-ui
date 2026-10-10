# Work item: HLD-11C — Measure simulation generation and production rendering

## Objective

Keep the learning controls responsive as workloads grow. Establish reproducible cost evidence
for the existing Java experiments and their real production UI, with semantic checks that
prevent a fast but incomplete renderer from passing. This is a first-release hardening slice;
later curriculum and human publication gates remain open.

## Preconditions

- Fresh branch `chore/simulation-rendering-performance` from fetched main `b1147c2` (PR #59).
- Existing worktree `/home/prem/worktrees/hld-runtime-release`; owner main and unrelated
  `output/` assets are separate and preserved.
- Read project/roadmap, architecture, simulation, quality, learning and first-release specifications;
  inspect actual controllers, models, configured serializer, rendering controls and browser config.
- Existing packaged jar contains current application behavior. Finish builds before starting
  browser servers; do not replace the jar or production assets while those servers are running.

## Scope and design

- An opt-in Java evidence test calls the real injected simulator/calculator beans and configured
  Jackson mapper. Separate generation and serialization intervals; perform assertions outside them.
- Eleven fixtures cover tiny/maximum-count flow, a virtual-time-limited flow, tiny/cold-burst cache,
  maximum ASCII update payloads, escaped update/read payloads, tiny/maximum-count limiter, and
  baseline/maximum-scalar capacity estimation. These are declared fixtures, not exhaustive worst cases.
- One untimed semantic reference run and three explicit warmups precede ten sequential samples
  per Java fixture. Check exact result/serialized replay, status, counts, a hand-checkable metric,
  and the existing request/result/events byte ceilings where applicable.
- A separate opt-in Playwright config runs real controls against the production frontend and Java
  jar, with one worker and dedicated ports. Measure local proxy HTTP/body transfer and native
  response-end → semantic DOM readiness → two animation frames. Record Chromium cumulative
  task/script/layout/style deltas separately and inspect forward/backward event selection.
- Cover all four modules at 1440 and 320 CSS pixels with reduced motion and light theme. Keep
  one warmup plus three recorded runs per workload/viewport. Assert actual rendered rows and
  selected event/state/metric values against each received Java result.
- CI explicitly runs both evidence suites and preserves JSON artifacts; timings have no arbitrary
  machine-independent pass/fail thresholds. Existing semantic/resource checks remain enforceable.
- No runtime services, dependencies, model/API/content-version changes, workshop publication,
  or product UI changes are introduced by this measurement slice.

## Acceptance

1. Opt-in suites produce complete, bounded reports with actual environment, versions, sampling
   policy and explicit measurement boundaries. Report failed/partial runs truthfully.
2. A tiny and materially larger workload produces the expected Java outcomes and complete UI;
   large key/value state and a Java-limited trace retain honest counts/status.
3. Forward/backward selection uses authoritative events; rendering may not fabricate outcomes
   or discard rows to improve measurements.
4. Record bundle sizes and representative cost ranges; use actual evidence when selecting the
   next optimization or resource budget. Do not claim throughput, heap use, real-mobile speed,
   screen-reader output or production service objectives from this local suite.
5. Relevant local checks and all final-head CI jobs pass before focused squash delivery.

## Verification evidence

| Check actually run | Result | Evidence |
| --- | --- | --- |
| Initial opt-in Java harness | PASS: one test, 11 fixtures, 110 recorded samples | `/tmp/hld-performance-java-debug.log`; initial working-tree report |
| Final sequential Java evidence | PASS: one opt-in test, 11 fixtures, 110 samples, reference/warmups and hashes recorded | `/tmp/hld-performance-java-sequential.log`; [archive](../evidence/performance-2026-10-10/java.json) |
| Full production-browser performance suite | PASS: 20 tests in 2.3 minutes; 80 runs (20 warmups/60 measured), complete report and released ports | [archive](../evidence/performance-2026-10-10/browser.json); final strengthened suite terminal result; six Flow/eight Cache metrics and initial/selected cache values verified |
| Default Maven verify | PASS: 183 discovered, 182 executed/passed, one intentionally skipped opt-in test | `/tmp/hld-performance-java-verify.log` |
| Frontend contract/type/lint/format/unit/build gate | PASS: 26 malformed-content fixtures, 273 unit tests, production build | Actual terminal output and `/tmp/hld-performance-build.log` |
| Plan/diff checks and final-head CI | Delivery gate | Record final results in the focused PR before squash |

An initial frontend format check traversed the new generated report. Adding `target/` to the
existing Prettier generated-output exclusions resolved it; the remaining gate passed. Prototype
browser runs also caught harness-only limiter/event-table and hook-placement mistakes, corrected
before the complete run; no product behavior was changed. The final Java baseline was collected
sequentially after the frontend build to resolve known interference from an earlier overlapping
measurement. [PERFORMANCE_REVIEW.md](../PERFORMANCE_REVIEW.md) gives actual boundaries and results.

Read-only backend review confirmed separate timing boundaries and replay/resource assertions.
It clarified that the untimed reference run also warms the JVM/mapper, and that default Maven
verification discovers 183 tests but executes 182, with this opt-in test intentionally skipped;
the explicit performance invocation executes it separately. JVM maximum heap is configuration
metadata rather than a measurement of used memory.

## Handoff

P2-05 remains **in-progress**. Generation/render measurements support responsive learning,
but do not close hosted backend freshness, full heap/load/network budgets, initial lesson loading,
broader manual review, actual screen-reader output or newcomer teach-back. Next independent
work: initial lesson loading/render evidence and a bounded aggregate-memory/load assessment; inspect the measured eager-table/seek costs before larger traces. Rendering
optimizations require controlled before/after evidence; later publication/expansion still follows the
documented first-release dependencies.
