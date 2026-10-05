# Work item: HLD-06B — cache architecture, sequence, and lesson completion

## Objective

A learner can describe cache-aside's structure (the application owns the logic; the cache is a side store) and retell the baseline as four moments with their times. They can give a two-minute interview answer, handle the hot-key and freshness follow-ups, and spot the tempting wrong explanation of the 72 ms read. Every alternative the lesson recommends is backed by a checked primary source.

## Preconditions

- Roadmap dependencies and their evidence: HLD-05 (#32) and HLD-06A (#34) merged.
- Relevant documents: HLD-06 in the [next implementation plan](../NEXT_IMPLEMENTATION_PLAN.md) §5; [learning standard](../LEARNING_STANDARD.md) publication check; [content spec](../../content/CONTENT_SPEC.md) §2 and §6.
- Current repository state: `main` at `c293eb4`.

## Scope

- Added: `CacheConceptViews.tsx` (Architecture and Request sequence) and its tests; Architecture and Request sequence tabs on the cache page; a direct-link browser journey; two transfer questions (`cache-aside-hot-key-expiry`, `cache-aside-freshness-requirement`).
- Changed: the cache lesson gains an alternatives table, an interview answer scaffold, two changed-condition follow-ups, a model teammate explanation, a tempting wrong explanation with its correction, a self-check, and a corrected reading list. The resources are re-audited and the catalog's `contentVersion` moves 1.0.0 → 1.1.0 with `reviewedAt` 2026-10-05. A `.sequence-columns.two-up` style is added.
- Stable IDs/contracts touched: source ID `caffeine-cache-design` is replaced by `tinylfu-admission-policy`, because the old entry's DOI pointed to an unrelated paper. New source IDs: `rfc-5861-stale-content`, `go-singleflight`, `caffeine-refresh`. No API or model change.
- Explicit exclusions: request coalescing, invalidation, and refresh-ahead stay unimplemented and are labeled that way; a newcomer teach-back session (a release gate) is not run here.

## Design

The architecture view reuses the rate limiter's three-step layout. It places the application between cache and origin, separates the read path from this model's origin-only write path, and lists what is modeled and what is not. The sequence view retells the baseline as four moments (0→22, 30→32, 40→72, 120→142 ms) and the latency rules (hit = lookup, miss = lookup + origin read, bypass = origin read). Every number matches the Java values pinned by `GuidedCheckpointsTest` and the browser journeys. The hot-key question's answer (30 origin reads; the request arriving at 1,030 ms is the first hit) was computed by running that exact input through the packaged Java model, and the question explains how to reproduce it in the playground.

### Source audit (2026-10-05)

| Source | Verified claim | Used for |
| --- | --- | --- |
| AWS ElastiCache, Caching strategies | Lazy loading, the miss penalty, stale data without write updates, TTL limits staleness, an empty replacement node raises latency and database load | Read path, TTL, write-through |
| Azure Caching guidance | Seeding, invalidate on write and its read race, expiry too short or too long, fallback to the data store when the cache is unavailable can swamp it | Warming, invalidation, cache-outage tradeoff |
| RFC 5861 | `stale-if-error` lets a cache serve a stale response when an error occurs | Origin-outage alternative |
| Go `singleflight` | One in-flight call per key; duplicates wait and receive the same result | Coalescing |
| Caffeine Refresh wiki | Refresh returns the old value while reloading, unlike expiry | Refresh-ahead |
| TinyLFU (ACM TOS 2017, doi 10.1145/3149371) | Frequency-based admission/eviction | Further reading only (paywalled) |

The previous `caffeine-cache-design` entry cited DOI 10.1145/3230543.3230553, which does not resolve to a cache-design paper; it was removed.

## Acceptance

- [x] Architecture and Request sequence tabs render complete content with direct URLs and a text equivalent (unit, browser).
- [x] Both views distinguish the read/fill path from origin-only writes and state the unmodeled alternatives.
- [x] Lesson has the learning-standard elements: plain opening, one example throughout, prediction with evidence (Guided), teammate explanation, two-minute scaffold, two changed-condition follow-ups, a wrong explanation with its correction, and a self-check.
- [x] Every new or changed technical claim is linked to a source verified on 2026-10-05; the wrong citation is removed.
- [x] Content validator passes with 15 questions, and all source IDs resolve.
- [x] No overflow on any cache tab, including the new ones, at 320/768/1440 in both themes (layout matrix iterates every tab).
- [ ] Manual 200% zoom, screen-reader review, and a newcomer teach-back — **pending** release gates.

## Verification evidence

| Check actually run | Result | Artifact or reproduction |
| --- | --- | --- |
| Hot-key question computed by the packaged Java model | 30 misses after 1,000 ms; first hit for the request at 1,030 ms | GET k @0, TTL 968, lookup 2, origin read 30, GETs at 1,000–1,040 |
| `node frontend/scripts/validate-content.mjs` | pass | 15 questions, 8 checkpoints |
| `./mvnw -B verify` | pass, 91 tests | Rebuilt jar packages the new content |
| `npm run contracts:check`, `lint`; `prettier --check` on changed files | pass | |
| `npm test` | 91/91 pass (14 files) | Includes 2 new concept-view tests and one test from PR #33 |
| Full `playwright test` | 50/50 pass | 49 + direct links to Architecture and Request sequence |
| Screenshots at 1280 dark | reviewed | The latency equation broke mid-formula; formulas now stay whole, and wrap only below 480 px |
| Cache layout matrix after that fix | first 4/6, then 6/6 | The first fix overflowed at 320 px in both themes (Request sequence); allowing wrapping below 480 px fixed it |

## Handoff

With HLD-05, 06A, and 06B merged, P2-02's remaining gaps are manual accessibility evidence and a newcomer teach-back, so the row stays **in progress**. Next: HLD-07, which aligns request flow, capacity, and the rate limiter to the same learning standard, one module per contribution.
