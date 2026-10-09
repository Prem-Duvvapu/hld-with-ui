# HLD-09C-C: prerequisite publication guard at Java startup

## Objective

Prevent a learning module or workshop from advertising a broken prerequisite path when the Java artifact is built independently of the frontend validation command.

## Preconditions and scope

- Fresh `fix/catalog-prerequisite-publication` from `15d8fa4` (PR #49); CI passed 135 Java, 177 frontend and 99 browser tests plus launcher smoke.
- Actual Java startup checked IDs/kinds/status/capabilities but omitted the prerequisite graph. Frontend validation already rejected unknown prerequisites, cycles and publication dependencies. Architecture wording previously overclaimed startup coverage.
- Current five canonical entries form a valid graph; the URL-shortener case remains draft. Owner `output/` is preserved.
- Scope: Java catalog validation and semantic regression fixtures, frontend validator negative fixtures and evidence/docs. No UI, content/model versions, HTTP shape, dependency, simulation or cloud changes.

## Design and acceptance

- Check all catalog entries before loading workshop resources: present arrays/entries, unique IDs and valid prerequisite identifiers.
- Reject null/duplicate/self/unknown prerequisites. A published entry may require only published prerequisites; apply this to topics and cases.
- Detect indirect/disconnected cycles across every status. Allow forward references, shared prerequisites and a draft depending on planned work; those statuses still remain unavailable in public discovery.
- Use local validation maps/sets; do not add a second topic list or simulate learner completion. This enforces catalog publication closure, not manual release review.

## Verification evidence

| Check actually run | Result | Evidence |
| --- | --- | --- |
| Focused Java before final extra case fixture | Passed: 14 tests | Six graph tests plus existing case catalog/API checks; startup exercised through the real CatalogService constructor with a mocked packaged resource reader |
| Full Java verify | Passed: 142 tests, zero failures/errors/skips | Includes the additional published-case-to-draft-topic regression and actual packaged catalog/API checks; `/tmp/hld-prerequisites-java-verify.log` |
| Contracts/generated drift | Passed: 18 fixtures | Three isolated graph mutations exercise existing frontend rejection; generated types unchanged |
| Plan / whitespace / lint / format | Passed | 60 docs, 280 local links, 59 curriculum IDs, five catalog identities; clean diff and frontend lint/format |
| Required CI | Passed before merge | [PR #50 CI](https://github.com/Prem-Duvvapu/hld-with-ui/actions/runs/37978162891) passed 142 Java, 177 frontend and 99 browser tests plus launcher smoke; merged as `073d8cb` |

## Handoff and limits

The startup guard now agrees with the existing content gate on prerequisite closure and cycles. It does not validate lesson accuracy or learner understanding, and does not establish manual accessibility, source review, hosted freshness or full publication readiness. No catalog status changes. Next: stage/answer/source publication review, retaining manual gates; published-content search can proceed independently while unavailable manual evidence remains recorded.
