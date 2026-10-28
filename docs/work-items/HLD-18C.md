# HLD-18C — Explain retry decisions through Guided and design views

## Objective

Predict a retry decision, inspect the selected Java snapshot, and explain the caller,
policy and server responsibilities to a teammate or interviewer.

## Preconditions

- PR #79 merged as `dd5946e` after final-head CI run `38942545292` passed.
- Fresh branch `feat/retry-guided-design` starts from that main; owner main is synchronized.
- Unrelated owner `output/` is preserved. No model behavior, replay version or golden changes.
- Follow the [retry plan](../TIMEOUTS_RETRIES_IMPLEMENTATION_PLAN.md) and existing shared
  Guided answer lifecycle. Publication and human/hosted reviews are separate gates.

## Scope and design

Add eight original checkpoints, each resolved against one actual canonical Java preset.
Extend semantic targets with a closed request identity family: request-level events require
`requestId`; attempt-level events also require its actual `attemptId`. Kind and occurrence
select returned evidence, never prose or authored array offsets. Existing selector families
and saved activity identities remain valid.

Use the shared predict → reveal → explain → tradeoff flow. Display only the selected event
and its post-state; future events and whole-run metrics are outside this snapshot. Preserve
local answers, explicit reveal/retry, reset invalidation, tab/history and no automatic POST.

Add inspectable Architecture and three authored, manually selected request sequences with
complete text equivalents. Keep caller patience, retry ownership, admission and accepted
work distinct. Show the default late-work path, backoff recovery and blocked deadline proposal.
These views describe the bounded model; they do not execute a network or business effects.

## Acceptance

- Java tests resolve all eight targets and assert intermediate/terminal numerical facts;
  malformed families, kinds, identities, occurrence and association fail closed.
- Standalone checkpoints, canonical HTTP contracts, generated types and content validators
  agree on selector support, versions, preset references and draft capabilities.
- Guided reveals exactly the returned selected prefix. Saved answers survive reload without
  restored traces or automatic runs; pending/error/retry and reset remain explicit.
- All six tabs are real. Architecture ownership and all three sequence paths are keyboard
  usable, readable at 320/768/1440 in both themes with reduced motion and actual native zoom.
- Copied-runtime content agrees with the checkout; required final-head CI passes before merge.
- Record actual verification and delivery evidence. Keep human/hosted/publication gates open.

## Verification evidence

| Actual check | Result | Evidence |
| --- | --- | --- |
| `./mvnw -B verify` | PASS: 811 discovered / 810 executed / one existing opt-in skip; 17 new cases | `/tmp/hld-18c-java.log` |
| Canonical generation and `npm run contracts:check` | PASS: HTTP 1.12.0, 624 fixtures; ten catalog entries, 67 questions, 56 checkpoints, ten workshop stages | `/tmp/hld-18c-generation-final.log`, `/tmp/hld-18c-contracts.log` |
| Frontend typecheck/lint/format | PASS; final browser capture helper also type checked | `/tmp/hld-18c-types-final.log`, `/tmp/hld-18c-types-browser-final.log`, `/tmp/hld-18c-lint.log`, `/tmp/hld-18c-format.log` |
| `npm test` | PASS: 785 tests across 82 files | `/tmp/hld-18c-fe-units.log` |
| Production build | PASS: RetryPage chunk 51.18 kB / 14.87 kB gzip, lazy route | `/tmp/hld-18c-fe-build-final.log` |
| Final plain-language content checks | PASS: 21 focused Java/API cases and packaged-content validation | `/tmp/hld-18c-content-java-final.log`, `/tmp/hld-18c-content-final.log` |
| Final copied executable jar | PASS: updated content/checkpoints, all retry golden results, draft exclusions, existing baselines and owned cleanup | `/tmp/hld-18c-runtime-content-final.log` |

First type checking caught a broad union in a test spread, an unsupported Testing Library
option and an undeclared node-project import of shared display labels. Narrowed the concrete
test target, removed the unsupported option and explicitly included the imported label file.
All assertions remain. The full frontend test suite passed; its following build process
terminated before output. After confirming no build was still running, the standalone build
was rerun and passed. No test was restarted because of an observation timeout.

Review corrected a stale lesson sentence and simplified eight evidence hints/explanations
without changing identities, timings or claims. Final content checks and copied runtime use
that actual wording. All sixteen authored sequence states are checked against actual Java
serialized examples by semantic target, state and time. Pure retry behavior, versions and
all four golden pairs remain unchanged. Earlier browser runs passed all six new journeys
and both native zoom checks. The final combined run passed all eight journeys in 1.1 minutes
against the packaged plain-language content: `/tmp/hld-18c-browser-final.log`. It covers all
eight exact Java prefixes, preset caching, tab/history, saved-answer reload/import/version/reset,
pending/failure/explicit recovery and unmatched-identity withholding. Responsive assertions
cover 320/768/1440 in both themes with reduced motion and keyboard interaction. Actual browser
zoom 2 verifies CSS widths 720/320 from physical 1440/640 and doubled device pixel ratio.

Twelve final responsive screenshots are retained in `/tmp/hld-18c-captures/`. Mobile captures
start at the document origin to keep fixed/sticky navigation out of element-clip artifacts.
Root inspected mobile Guided and desktop Architecture in both themes. Intentional evidence:

- [Mobile Guided, light](../evidence/HLD-18C/retry-guided-320-light.png)
- [Mobile Guided, dark](../evidence/HLD-18C/retry-guided-320-dark.png)
- [Desktop Architecture, light](../evidence/HLD-18C/retry-architecture-1440-light.png)
- [Desktop Architecture, dark](../evidence/HLD-18C/retry-architecture-1440-dark.png)

These checks do not replace human screen-reader/newcomer review, hosted backend freshness,
prerequisite release closure or publication. The catalog remains four published modules,
five draft topics and one draft workshop.

The additional Guided and authored views increase the lazy retry route chunk from HLD-18B's
28.48 kB / 9 kB gzip to 51.18 kB / 14.87 kB gzip. This is a production build-size observation,
not a runtime or hosted performance benchmark. The user benefit is the complete six-view
learning flow. Initial application routing remains split by topic. Required final-head CI
and delivery are recorded in PR #80: CI `38946555748` passed all 810 executed Java
cases (one existing opt-in skip), 785 frontend tests, 624 contract fixtures, 244 browser
journeys, 20 UI performance and 20 reading/cache groups, jar/container and cleanup checks.
Squash merged 2026-10-16 at 18:31:50 UTC as `bdf18dc`. Owner main was synchronized and
the completed owned branch removed, preserving unrelated `output/`. This is historical
evidence, not a substitute for each later contribution's checks.

## Handoff

Next: idempotency as the separate effect/result correctness boundary before Notification
composition. Retries alone provide no cancellation, durable storage or duplicate-effect guarantee.
