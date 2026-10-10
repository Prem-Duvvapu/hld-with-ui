# Work item: HLD-11B — Verify fresh checkout and packaged runtime

## Objective

Make release verification repeatable: a contributor can build from tracked source and prove
the Java artifact delivers the authored learning content and working baseline experiments
without reading content from the checkout at runtime. Keep deployed-state failures visible.

## Preconditions

- Fresh branch `chore/packaged-runtime-verification` from fetched main `7e61a5d` (PR #58).
- New source-only worktree `/home/prem/worktrees/hld-runtime-release`: no `node_modules`,
  `target`, `dist` or copied ignored settings before installation/build. Global Maven/Chromium
  caches are reused; this is a clean checkout, not a cold dependency cache or clean machine.
- Owner main remains separate; unrelated `output/` assets are preserved.
- Read project, current roadmap, architecture, runtime/simulation and quality specifications,
  release checklist, existing Dockerfile/proxy/CI/launcher and nearby API tests.
- Docker Desktop's CLI shim exists, but Docker version/info fail because WSL integration is
  unavailable. No machine settings, services, credentials or cloud infrastructure changed.

## Scope and design

- Standard-library Python runtime smoke: copied executable jar in an empty temporary directory
  or uniquely named Docker container from the existing deployment image, without mounts.
- Compare canonical metadata and complete delivered lesson/question/checkpoint/workshop content;
  normalize only null optional fields and default empty walkthroughs. Check catalog-derived
  discovery/path availability, search, structured unknown-case errors and tiny model/estimator runs.
- Four lifecycle/failure tests: healthy mismatched artifact, occupied unrelated port, closed
  server connection reuse, and failed Docker diagnostics still attempting removal. Remove only the tracked process/container and check its port.
- Add CI Packaged runtime job for Java 21 copied-jar and Java 17 JRE Docker-image execution.
- Reconcile contributor instructions, release evidence, current build sizes and live incident.
- No UI redesign, model/API/content-version changes, new runtime services or workshop publication.

## Acceptance

1. A source-only checkout installs locked frontend dependencies and passes actual Java/frontend/
   browser/launcher checks. Builds finish before running browser servers.
2. Packaged runtime delivers matching canonical exposed content and current versions, all published
   baseline simulations/estimator, ten draft workshop stages, a valid first path and structured 404.
3. A healthy artifact with deliberately wrong catalog metadata fails verification. An occupied
   port's owner remains untouched. Success and verification failure stop the owned Java process;
   Docker removal is attempted even when log collection fails.
4. CI builds/runs the actual deployment Dockerfile from root, with no content mounts and explicit
   container test constraints. Record unavailable local Docker honestly; do not substitute compilation
   or a classpath test for image execution.
5. Record live health/content/model/runtime failures and freshness gaps precisely. A working static
   frontend or healthy old backend does not establish deployment recovery.

## Verification evidence

Environment: 2026-10-10; Java 17.0.20.1, Node 20.19.4, Python 3, Linux/WSL, four logical CPUs.

| Check actually run | Result | Evidence |
| --- | --- | --- |
| `npm ci --prefix frontend` from source-only checkout | PASS: locked installation | `/tmp/hld-runtime-clean-install.log` |
| `cd backend && ./mvnw -B verify` | PASS: 182 tests; packaged jar | `/tmp/hld-runtime-clean-java.log` |
| Full CONTRIBUTING frontend gate | PASS: contract drift/26 negative fixtures, typecheck/lint/format, 273 unit tests, production build | `/tmp/hld-runtime-clean-build.log` plus command output |
| Copied-jar runtime smoke | PASS: current content, three simulation baselines, estimator, draft/workshop/path/search/errors and cleanup | `/tmp/hld-runtime-jar-final.log` |
| Runtime lifecycle/failure tests | PASS: four tests, including real healthy mismatched jar, active port protection, closed connection reuse and owned-process cleanup | `/tmp/hld-runtime-negative-reuse.log` |
| Immediate repeated copied-jar launch on the same port | PASS: two complete runs, both owned processes stopped | `/tmp/hld-runtime-jar-repeat.log` |
| Full source-only-checkout browser gate | PASS: 139 journeys, including native 200% zoom | `/tmp/hld-runtime-clean-browser.log` |
| Launcher smoke | PASS: interrupt cleanup and occupied-port protection, two scenarios | `/tmp/hld-runtime-clean-launcher.log` |
| Plan links and launcher syntax | PASS: 76 documents, 378 links, 59 curriculum IDs, five catalog identities; shell syntax and diff whitespace | Actual validator/syntax/diff output |
| Local Docker version/info | UNAVAILABLE: disabled WSL integration | Actual CLI error, no image execution claimed |
| CI deployment image build/run | Final-head result recorded in [PR #59](https://github.com/Prem-Duvvapu/hld-with-ui/pull/59) | Required Packaged runtime job must pass before squash; local Docker remains unavailable |

Parallel read-only review found a failure path where diagnostic timeouts could skip Docker
removal; unconditional removal and a regression test fix it. It also prompted full delivered
content comparisons, bounded socket probes, and startup polling using the remaining deadline.
The first actual CI image build succeeded, then the image smoke failed its preflight bind
after the copied-jar cleanup, consistent with closed-connection TCP TIME_WAIT ([run](https://github.com/Prem-Duvvapu/hld-with-ui/actions/runs/38055371733)).
The probe now permits reuse of closed connections with `SO_REUSEADDR`; active listening
owners still fail the bind and remain untouched, with address reuse both enabled and disabled. Both the actual active-close regression and
immediate repeated jar checks pass. The final head must pass all three CI jobs before merge.

Tiny baseline fixtures prove JRE/model compatibility for those paths; they are not load tests.

## Live runtime evidence

The initial eight direct/proxied API GETs timed out at 30 seconds without responses. After one
warmed health retry, both origins returned 200 health and topics; the topic versions are still
1.0.0 rather than canonical 1.1.0. Workshop, path and unknown-case requests return 500. Direct
flow/cache descriptors are old, their tiny runs fail with missing `L64X128MixRandom`, and the
body-limit probe returns 400 rather than the current default 413. Limiter/capacity baselines work.
Vercel deep-link HTML and entry assets work; their bytes do not establish a deployed backend commit.

[INCIDENTS.md](../INCIDENTS.md) records dates, versions, errors, evidence paths and recovery checks.
Current code already fixes the random-generator compatibility; no duplicate model change was made.
Authenticated Render deployed-commit/log access is unavailable. An asynchronous owner question asks
for that state without credentials; no answer is assumed. The incident remains open.

## Handoff

P2-05 remains **in-progress**. The new gate protects packaged runtime and fixture compatibility;
it does not prove hosted freshness, total heap/throughput budgets, human screen-reader output or
newcomer learning. Current bundle sizes are recorded in RELEASE_REVIEW; tiny/maximum generation
and rendering costs remain open. Next independent work: generation/render performance evidence,
while actual Render recovery and required human review are obtained before publication/expansion.
