# Work item: HLD-07C — explain rate-limiter scope, time, and failure correctly

## Objective

Help a learner predict one-window allowance, fractional token refill, local
overshoot, and outage decisions, then explain a practical enforcement choice to
a teammate or interviewer without claiming a production guarantee.

## Preconditions

- Implementation started from main `cb83eca` (PR #37), four published modules.
  Before publication, rebased onto main `7aeef9e` (analytics PR #38), preserving
  its README, roadmap maintenance note, dependency, and route analytics changes.
  The original checkout's
  untracked promotional image is preserved; this work uses a separate Linux worktree.
- HLD-07B capacity review is merged; the roadmap selects rate-limiter review next.
- Read the repository instructions, contributing guide, project/roadmap/architecture,
  simulation/content/quality/learning standards, release blueprint, and current plan.
- Existing Java rate model is 1.0.0; this contribution changes no outcomes or schema.

## Scope and design

- Original lesson: small shared example, observed versus possible overshoot,
  fixed-window boundary, fractional refill and slower refill, outage comparison,
  two-minute interview scaffold, teammate explanation, misconception, transfer,
  and self-check. The full workshop remains planned.
- Three new stable practice IDs: `distributed-rate-limiter-refill-delay`,
  `distributed-rate-limiter-retry-units`, and
  `distributed-rate-limiter-observed-overshoot`. Existing IDs preserved.
- Content version 1.1.0; model version remains 1.0.0.
- Results label configured allowance per aligned window or initial burst, never
  as a total-run maximum. Refill/later windows and unbounded bypasses are explicit.
- Counter outage displays remaining quota as Unknown, because zero is an API
  placeholder and no state was checked. Retry delay remains absent.
- Architecture/sequence distinguish illustrative decision behavior from a real
  gateway's authentication/HTTP response and quota-allocation responsibilities.
- No new services, dependencies, persistence, analytics, or Java behavior change.

## Source audit (2026-10-07)

| Reference checked | Finding and supported claim |
| --- | --- |
| RFC 9331 | The linked RFC is ECN/L4S, unrelated to HTTP quota fields. Remove the incorrect resource and catalog reference; no invented substitute RFC number. |
| Old Google rate-limiting URL | Redirects to a general traffic/load guide that no longer supports the claimed algorithm coverage. Remove this claim/reference. |
| [RFC 6585 section 4](https://www.rfc-editor.org/rfc/rfc6585.html#section-4) | Defines HTTP 429 for too many requests, permits Retry-After, leaves identity and counting mechanism unspecified. |
| [RFC 9110 section 10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after) | Retry-After is an HTTP date or integer delay in seconds; distinguish simulator milliseconds. |
| [Redis INCR rate-limiter patterns](https://redis.io/docs/latest/commands/incr/#pattern-rate-limiter) | Time-keyed counters and coordinated increment/expiry; examples count attempts, unlike this model's accepted-only count. No copied code or Redis-emulation claim. |
| [AWS API Gateway throttling](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html) | Product-specific token-bucket rate/burst terminology; quotas are explicitly best-effort targets. Not proof of this model's production guarantees. |

All teaching prose is original. Links are optional primary references, not required
paid reading. New source IDs replace the inaccurate references in catalog/questions.

## Acceptance fixtures

- Shared fixed-window preset: 5 allowed, 3 rejected, first rejection at 0 ms with
  1,000 ms retry delay. Existing semantic test retained.
- Local preset: 12 observed, 15 possible per window, 7 excess above intended 5.
- Five arrivals at 999 ms and five at 1,000 ms: 10 allowed across two windows,
  configured one-window allowance still 5.
- Capacity 2, refill 2/s, arrivals 0/0/0/250/500: allow/allow/reject/reject/allow;
  rejected retry delays 500 and 250 ms. At 250 ms the balance is 0.5 token.
- Capacity 2, refill 1/s, arrivals 0/0/0/500: only first two pass; retry delays
  1,000 and 500 ms.
- Six-request outage: fail-open 6 bypassed/0 enforced; fail-closed 6 rejected;
  both have no retry estimate. Independent local mode still enforces and allows 6.
- Results continue to describe submitted inputs; keyboard run and tab/history
  preserve the result. Narrow dark-theme outage remains readable with reduced motion.

## Verification evidence

| Check actually run | Result | Evidence |
| --- | --- | --- |
| `node scripts/validate-plan.mjs` | Pass | 41 docs, 137 local links, 59 curriculum IDs, 4 catalog identities. |
| `npm run contracts:check` | Pass | Generated API types unchanged; 21 questions, 8 checkpoints, prerequisites, references, capabilities validated. |
| `./mvnw -B verify` | Pass | 96 Java tests, including three new semantic tests for boundary/refill/outage fixtures; packaged content. |
| `npm test -- --maxWorkers=2` | Pass | 102 frontend tests after rebasing onto analytics main `7aeef9e` (99 before integration). |
| Frontend typecheck / lint / format / build | Pass | Production build generated; line-ending-only checkout normalization introduces no semantic diff. |
| `bash -n start.sh scripts/start-smoke-test.sh`; `git diff --check` | Pass | No launcher changes; no whitespace errors. |
| `E2E_BACKEND_PORT=18280 E2E_FRONTEND_PORT=14273 npm run e2e -- --grep 'rate.limiter' --workers=1` | Pass | 9 real-Java browser checks: existing flow, 320/768/1440 × light/dark all-tab layout, new boundary/refill and outage/local journeys; keyboard run, tab/history preservation, reduced motion. |

Initial added browser selectors used an incorrect tab name and exact label text
containing select options. Corrected to Decision flow and accessible combobox
names; all nine checks then passed. A unit selector was corrected similarly.
The 320 px dark-theme outage screenshot was visually inspected; no page overflow
was observed. The final CI result will be reported with the PR. Manual 200% zoom,
screen-reader review, and newcomer teach-back remain unperformed.

## Handoff

HLD-07C is a focused learning/source review, not the Phase 3 wave or a complete
release sign-off. Next independent work: HLD-08A, versioned local answer storage.
Existing manual release gates remain open.
