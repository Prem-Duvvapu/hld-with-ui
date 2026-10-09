# 0013: Keep URL-shortener eligibility authoritative while caching mappings

## Context

The authored API rejects expired/taken-down links and declines redirects when current eligibility cannot be established. A conventional cache-aside hit can carry old eligibility. The evolved design must not silently trade that promise for availability or claim its cache-hit ratio removes every primary read.

## Decision

The worked strict design may cache an immutable code-to-destination mapping only under a stated, later-measured full-row/payload bottleneck. A cache hit requires current existence, expiry and takedown metadata from the primary. A miss reads the full mapping and eligibility together in one primary lookup. The cache is optional and bounded; durable caller/key results stay in the create transaction, never in a separate best-effort cache.

This means one primary lookup per resolve remains. Mapping hits can reduce full-row transfer/decoding rather than lookup QPS. Cache failure can take an admitted full primary path; unavailable authoritative eligibility returns 503 without Location, even with a cached destination. Ineligible/unknown codes return the uniform 404. HTTP no-store remains distinct from internal cache lifetime.

Primary read ordering does not cancel an already authorized in-flight response after concurrent takedown. Stronger completion guarantees need coordination/fencing. The alternative cache-only read path requires an explicit changed freshness/revocation promise and defined observation/fill/clock/outage bounds. TTL or best-effort invalidation alone does not prove it.

## Alternatives

- Keep the baseline when the proposed cache does not remove measured work.
- Relax revocation freshness explicitly and define a bounded stale-read contract before cache-only serving.
- Coordinate eligibility invalidation/fencing across cache copies, with explicit failure behavior and tests; this protocol is not implemented here.

## Consequences

The architecture is a learning design, not a deployed shortening service or a new simulation. It makes the capacity/availability limit visible and gives a learner a defensible reason to reject an unnecessary cache. More stateless handlers need an aggregate primary connection/admission budget. Negative caching and coalescing remain separate decisions with correctness/coordination obligations.

## Migration

No teaching API or saved-answer schema changes. Content version 1.3.0 requires fresh reference review while preserving notes. Deploy the updated content-bearing Java artifact separately from frontend deployment. The later Operations stage must cover staged rollout, verification and rollback without changing durable ownership/replay invariants.

## Verification

Java tests reconcile estimator-derived metadata/full-read quantities, actual cold-burst/bypass/origin-failure/stale-value/queue-overload presets, and typed status/eligibility paths. Browser journeys check all six new illustrative paths, text equivalents, keyboard focus, narrow layouts, themes, reduced motion and saved revisions. These tests do not claim to execute SQL or benchmark this design. Manual release gates and live backend freshness remain open.
