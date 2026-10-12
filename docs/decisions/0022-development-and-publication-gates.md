# Decision 0022: Separate draft development from publication gates

## Context

The owner has resumed the broader goal: URL Shortener; Queues, Retries and Idempotency;
Distributed Rate Limiter; Notification Service; Chat; News Feed; and Booking, including
their prerequisites. The October 5 execution plan still describes HLD-12 onward as outside
the assignment. Its HLD-11 prerequisite also prevents concept development until every
first-release human and hosted review has passed.

The technical baseline now has four working published modules, ten draft URL-shortener
stages, contract/content validation, deterministic isolation and byte-limit checks,
production browser journeys, packaged-jar/container gates and bounded performance evidence.
PRs #58–#61 record that evidence. Screen-reader/newcomer review and hosted/resource verification
remain open. Further source research alone will not deliver the requested learning coverage.

## Decision

Allow bounded **unpublished development** against the verified technical baseline while
the first-release reviews remain open. Preserve the curriculum's order: implement
`queues-tail-latency` before its dependent `queues-delivery`; develop the remaining
prerequisites before their dependent concepts and workshops.

Distinguish two gates:

| Gate | Required evidence |
| --- | --- |
| Development | Current technical foundation checks pass; the contribution has exact contracts, bounded model semantics, prerequisite teaching artifacts and a focused work item. A backend-only slice may precede its renderer, but is explicitly incomplete. |
| Publication | P2-05 release evidence, the module's complete capabilities, its own human/technical reviews and published prerequisite closure. Draft development does not satisfy this gate. |

An implemented draft prerequisite may support another draft's development after its
behavior and teaching assumptions are reviewed. An absent prerequisite still prevents
that dependent implementation. Drafts remain outside published topic/case discovery,
search and runnable first-path destinations. They must not be presented as released
learning coverage. Do not publish a catalog entry simply to make its route accessible.

The current topic API deliberately serves published topics only; unlike the URL-shortener
case route, it does not provide a draft preview. A draft topic preview therefore needs its
own explicit API/route/validation decision and checks. A pure Java model can be delivered
first without registering a published capability or claiming an accessible module.

## Alternatives

- Wait for all human and hosted reviews before any implementation: preserves the old
  sequence but prevents independent progress on the owner's expanded goal.
- Publish new topics immediately: would misstate readiness and bypass prerequisite reviews.
- Change existing public topic lookup to return drafts implicitly: would break the
  publication boundary and confuse search/navigation consumers.
- Add placeholder cards for planned concepts: creates apparent breadth without learning.

## Consequences

The owner gets implementation progress alongside unfinished release verification. Draft
work incurs maintenance and regression obligations; each slice must preserve the working
first-release experience and pass applicable local checks plus final-head CI before merge.
Do not add infrastructure or dependencies merely to support future modules.

This decision changes development sequencing. It does not certify accessibility, learner
understanding, production capacity or hosted freshness. P2-05 remains in progress. Each
work item distinguishes implemented code, accessible draft experience and published status.

## Migration

Update the execution plan, HLD-12/13 dependency wording and Phase 3 introduction to this
split. Preserve existing IDs, catalog status, published URLs, model versions, storage,
API behavior and all release evidence. No product code changes in this decision.

## Verification

[HLD-13-PREP-A](../work-items/HLD-13-PREP-A.md) records the documentation checks and
independent reviews. The next actual implementation is the `queues-tail-latency` contract
and pure Java model, followed by explicit draft preview delivery and the learning UI.
That implementation must recheck its own gates; this document is not its test evidence.
