package com.hld.cache;

/**
 * Metrics computed from a cache-aside simulation run.
 *
 * <p>All counts refer to GET operations only. UPDATE operations are not
 * counted toward hits, misses, or stale reads.
 */
public record CacheAsideMetrics(
        int totalGets,
        int cacheHits,
        int cacheMisses,
        int staleReads,
        int originReads,
        double hitRatio,
        long observationWindowMs) {
}
