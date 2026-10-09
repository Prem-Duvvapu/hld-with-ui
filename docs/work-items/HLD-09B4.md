# HLD-09B4: operate and explain the URL-shortener design

## Objective

Define an honest service boundary, diagnose/mitigate an incident without weakening ownership or eligibility, preserve guarantees across rollout/restore, and give a clear design explanation with defensible alternatives.

## Preconditions

- Fresh branch from `64014d4` (PR #45); CI passed 127 Java, 174 frontend, 91 browser journeys and launcher smoke.
- Canonical case has eight draft stages; current renderer and local answer lifecycle are reused. Owner `output/` artifacts are preserved.
- Learning/content/quality/architecture/blueprint and current plan read. Google SRE monitoring/objectives and OWASP REST-security primary sources reviewed 2026-10-09.

## Scope and design

- Add Operations/Defense, completing ten authored draft stages at content 1.4.0. Keep the case outside published discovery while release checks remain open.
- An explicitly proposed SLO/100,000-request budget exercise, privacy-aware signals, bounded incident mitigation, protected control paths, compatibility/canary/rollback and restore questions.
- Three authored paths: incident response, compatible rollout and interview explanation. Native stepping, full text alternative and saved original/revision/self-check lifecycle reuse the existing implementation.
- Simple 30-second/two-minute scaffolds, adaptable discussion outline and changed-requirement follow-ups. No implemented timer, grade, monitoring, auth, deployment, destination fetching or shortening service.
- Resolve older blueprint cache-only/primary-load guidance against the actual strict eligibility decision. Missing-stage publication fixtures remove Defense explicitly now that all ten stages exist.

## Acceptance

1. Packaged Java delivers ten ordered/version-consistent draft stages; topic discovery still excludes the case.
2. The SLO exercise counts legitimate overload/unavailability honestly and distinguishes correct 404 from wrong mapping; worked budget arithmetic and pitch estimates are consistent.
3. Incident/rollout/explanation paths preserve primary eligibility, permanent ownership, retained replay and compatible rollback; sources resolve and limitations remain visible.
4. Both stages support keyboard selection/stepping, full text, themes, 320/768/1440 widths, reduced motion, navigation/focus, original/revision/self-check reload and backup without sending notes.
5. A case missing Defense remains structurally unpublishable; completing stage count does not claim manual/release approval.

## Verification evidence

| Check actually run | Result | Evidence |
| --- | --- | --- |
| Java | Passed: 130 tests | `./mvnw -B verify`; three new operational/estimate/policy checks, ten-stage HTTP response and missing-Defense rejection |
| Frontend | Passed: 174 tests | Contracts/generated drift, typecheck, lint, format and production build; new test import was subsequently corrected for Node JSON loading |
| Content | Passed: 15 negative fixtures | Sources, references, paths, bounds and explicitly incomplete publication verified |
| Real-Java browser | Passed: 14 workshop journeys | Keyboard controls, paths/transcripts, stage focus, 320/768/1440 widths, both themes/reduced motion, saved revisions/self-checks/reload and backup; no note POSTs. Eight screenshots captured; representative mobile/desktop images inspected in both themes. Full PR CI runs 93 browser journeys. |
| Plan / whitespace / launcher | Passed | 55 docs, 234 local links, 59 curriculum IDs and five catalog identities; syntax and real launcher smoke, six descendants/port cleanup and unrelated occupied-port process preserved |
| Manual zoom / real screen reader / learner teach-back | Not performed | Publication gates remain open |

### UI evidence

| Stage | Mobile light | Mobile dark | Desktop light | Desktop dark |
| --- | --- | --- | --- | --- |
| Operations | [320px](assets/hld-09b4/operations-320-light.png) | [320px](assets/hld-09b4/operations-320-dark.png) | [1440px](assets/hld-09b4/operations-1440-light.png) | [1440px](assets/hld-09b4/operations-1440-dark.png) |
| Defense | [320px](assets/hld-09b4/defense-320-light.png) | [320px](assets/hld-09b4/defense-320-dark.png) | [1440px](assets/hld-09b4/defense-1440-light.png) | [1440px](assets/hld-09b4/defense-1440-dark.png) |

These screenshots support browser interaction evidence, not screen-reader or interview-readiness claims.

## Handoff

Next: HLD-09C technical publication review. Manual 200% zoom, real screen-reader and newcomer teach-back remain open; hosted backend freshness remains unresolved in [the incident record](../INCIDENTS.md). Complete stages alone do not publish the workshop. Independent discovery work can proceed after technical review where its dependencies permit it.
