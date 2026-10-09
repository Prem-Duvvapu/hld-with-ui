# 0014: Discover published workshops through the Java catalog

Status: accepted — 2026-10-09

## Context

The URL-shortener workshop has ten authored stages and a direct review route, while publication gates remain open. Topic discovery intentionally excludes cases. HLD-09C needs a working discovery path before eventual publication without adding a second list or advertising the draft as reviewed.

## Decision

- Add `GET /api/v1/case-studies`, returning the existing `CatalogEntry` metadata for published, startup-validated workshops. Select from loaded workshop resources and sort by catalog order, then ID. Draft/planned entries are omitted; no published entries means an empty array.
- Load workshop discovery independently from topics on the home page. Reuse existing theme/card/async-state styles. Explain that these are guided design exercises, and link to the existing generic case route. Empty discovery renders no section; loading/error/retry remains scoped to workshops.
- Keep the actual URL-shortener entry draft. Neither structural validity nor a functioning discovery renderer closes prerequisite, accessibility, learner or deployment gates.
- Describe the additive endpoint in OpenAPI and regenerate TypeScript. Use the existing API client and timeout; introduce no service, dependency, content duplication, persisted state or simulated outcomes.

## Alternatives

- Mix cases into the topic endpoint: would change existing topic routes and detail assumptions.
- Hardcode URL Shortener in React: would bypass publication state and duplicate the canonical catalog.
- Wait for manual reviews before implementing discovery: leaves a technical prerequisite unfinished despite an independently verifiable path.
- Couple both requests into one combined load: a case-collection failure would prevent learning from available foundation modules.

## Consequences and migration

Existing topic/detail contracts and saved answers remain compatible. Java needs this additive collection route before a frontend using it is deployed; an older backend produces a recoverable workshop error while topics stay available. The collection is currently empty. Future publication changes only the reviewed catalog status, once all applicable gates pass. Explicit draft URLs remain a review convenience, not access control.

## Verification

Java tests distinguish published, draft and planned resources; the real packaged API must return an empty collection for the current draft. Browser tests validate the response contract, independent loading/error/retry and usable foundation links. Explicitly mocked published metadata exercises the future card and keyboard navigation into the actual draft Java resource at three widths, both themes and reduced motion. This mock is not publication or live-host verification. Record executed results in [HLD-09C-B](../work-items/HLD-09C-B.md).
