# Cache-Aside

A cache-aside layer sits between the application and an origin store. The application checks the cache first; on a miss it reads the origin, fills the cache, and returns the value. An origin update does not touch the cache — the cached entry becomes stale until its TTL expires.

## Learning outcomes

- Trace a GET through cache lookup, origin read, and cache fill with explicit latencies.
- Explain why an origin update does not invalidate a cached entry under cache-aside.
- Identify stale reads, cold-start bursts, and the effect of cache or origin unavailability.

## Explain it simply

Imagine a sticky note on your desk with a phone number. You look at the note first (cache hit — instant). If the note is missing, you look up the number in the directory (origin read — slow) and write a new note (cache fill). If someone changes their number in the directory, your old sticky note still has the previous number until you throw it away and look again.

Cache-aside works the same way: quick when the note is there, slow when it's not, and potentially wrong when the source changed and you didn't notice.

## Prerequisites

Use **Request Flow** to understand where a cache lookup sits in the request path, and **Capacity Estimation** to quantify the read load a cache absorbs. This module focuses on application-managed cache-aside reads and does not cover write-through, invalidation protocols, or eviction policies.

## Mental model

For every read request, answer three questions:

1. **Is it in the cache?** A hit returns immediately at cache-lookup latency. A miss adds origin-read latency.
2. **Is it fresh?** The entry has a TTL. If the lookup time reaches or exceeds the fill time plus TTL, the entry is treated as expired — a miss.
3. **Is the origin reachable?** On a miss, the origin must respond. If it is down, the miss fails. A hit still works.

The simulation uses virtual time. Cache fill is instantaneous (zero additional time after the origin read). TTL expiry is checked at lookup time: `lookupTime >= fillTime + ttlMs`.

## How it works

### Cache lookup

When a GET arrives at time `t`, the application checks the cache. The lookup takes `cacheLookupLatencyMs`. If the key exists and has not expired, the cached value is returned — a **cache hit**.

### Cache miss and origin read

If the key is missing or expired, the application reads from the origin. This takes `originReadLatencyMs`. The returned value is stored in the cache with a new TTL. The total latency for a miss is `cacheLookupLatencyMs + originReadLatencyMs`.

### Origin update (cache-aside pattern)

An UPDATE operation changes the value at the origin but does **not** modify or invalidate the cache. Any cached entry for that key remains until its TTL expires. This is the policy chosen for this model; real cache-aside applications can explicitly invalidate entries on writes.

### Stale detection

After an origin update, a cache hit may return an outdated value. The simulation detects this by comparing the cached version against the current committed origin version — an **observer view**. A real application typically cannot detect staleness without querying the origin.

### Timing and result rules

Model v1.0.1 processes events in timestamp order, with insertion order breaking ties. Input arrivals are inserted first in their listed order. A cache fill becomes visible only when its origin read completes. The origin value is sampled at read completion, so an update during that read can change its response.

Initially only `k` exists. UPDATE creates or replaces a key and advances its version, even if its text stays the same. A missing key returns **Not found** and is not cached. If origin is unavailable, UPDATE does not commit and GET returns **ERROR**. Cache outages produce **BYPASS**, counted separately from misses. Hit ratio is hits divided by hits plus misses; failed misses stay in that denominator.

A limited run reports its stopping reason, last event time, and incomplete GET count. Its metrics describe only the observed trace. Operations accept times from 0 to 60,000 ms, up to 100 operations, keys up to 64 characters, and values up to 256 characters.

## Worked example

Configuration: cache lookup 2 ms, origin read 20 ms, TTL 100 ms, initial origin `k=v1`.

| Operation | What happens | Outcome |
| --- | --- | --- |
| GET `k` at 0 ms | Cache miss at 2 ms; origin returns `v1` at 22 ms; fill expires at 122 ms | `v1`, 22 ms latency |
| GET `k` at 30 ms | Cache hit at 32 ms | `v1`, 2 ms latency |
| UPDATE origin to `v2` at 40 ms | Origin version changes; cache still has `v1` | No read response |
| GET `k` at 70 ms | Cache hit at 72 ms | `v1`, 2 ms latency; **stale** relative to origin |
| GET `k` at 120 ms | Expiry check at 122 ms (fill 22 + TTL 100); miss; origin returns `v2` at 142 ms | `v2`, 22 ms latency |

Four GETs produce two hits and two misses → 50% hit ratio, two origin reads, and one stale read.

## Explore in the playground

1. **Baseline preset** — Run the worked example and verify each outcome in the trace.
2. **Cold burst** — Five concurrent GETs on an empty cache. Without coalescing, each causes a separate origin read.
3. **Cache unavailable** — Disable the cache and observe every GET going directly to the origin.
4. **Origin unavailable** — Disable the origin and observe failed misses. Each run starts with an empty cache, so this preset cannot demonstrate serving prewarmed hits during an outage.
5. **TTL experiments** — Change the TTL to see how it affects stale duration and origin load.

## Failures and tradeoffs

### Stale data window

Between an origin update and the next cache expiry, reads return the old value. Shortening the TTL reduces this window but increases origin load. There is no free solution under cache-aside alone.

### Cold start / thundering herd

When the cache is empty, every request is a miss. Under the basic model (no coalescing), N concurrent misses for the same key produce N origin reads. A later module can add request coalescing to compare.

### Cache unavailable

Every GET becomes a direct origin read. The application still works but at higher latency and origin load. Monitor cache availability and origin saturation separately.

### Origin unavailable

Cache hits continue to work. Cache misses fail. If TTLs expire during an outage, previously cached entries also start failing. A stale-while-error policy could extend TTLs, trading freshness for availability.

## In a real project

- **Choose TTL based on acceptable staleness**, not arbitrary round numbers. In this model, a cached old version remains eligible only until its existing TTL expires. Do not treat TTL alone as a universal production freshness guarantee.
- **Monitor hit ratio, origin read rate, and stale detection** independently. A high hit ratio with many stale reads may be worse than a lower hit ratio with fresh data.
- **Plan for cold starts** after deployments, cache restarts, or TTL flushes. Consider warming strategies or gradual rollout.
- **Separate cache failure from origin failure** in your monitoring. The symptoms overlap (increased latency, origin load) but the mitigations differ.
- **Consider invalidation or write-through** when the staleness window of cache-aside is unacceptable, and understand the new failure modes each introduces.

## Interview practice

1. *"Walk me through a cache-aside read for a key that was recently updated at the origin."* — Describe the lookup, the stale hit, the TTL check, and when the fresh value appears.
2. *"What happens during a cold start with 1,000 concurrent requests for the same key?"* — Explain the thundering herd, the origin load, and what coalescing or singleflight would change.
3. *"Your cache cluster is down. What is your mitigation strategy?"* — Discuss origin load, circuit breaking, graceful degradation, and monitoring.

## Teach it back

Explain to a teammate: "Under cache-aside, an origin update does not clear the cache. Here is exactly when the old value stops being served, why, and what we monitor to detect the problem."

## Further reading

- [Caching Strategies — AWS ElastiCache](https://docs.aws.amazon.com/AmazonElastiCache/latest/mem-ug/Strategies.html)
- [Caching Best Practices — Azure Architecture](https://learn.microsoft.com/en-us/azure/architecture/best-practices/caching)
- [Design of a Modern Cache — ACM (Caffeine)](https://dl.acm.org/doi/10.1145/3230543.3230553)
