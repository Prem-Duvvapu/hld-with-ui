package com.hld.cache;

/**
 * The outcome of a single GET operation in a cache-aside simulation.
 *
 * <p>{@code hitOrMiss} is HIT, MISS, BYPASS, or ERROR.
 * {@code stale} is true when the cached version differs from the current
 * origin version at the time the lookup completes — an "observer view"
 * because a real cache client may not know an origin update occurred.
 */
public record CacheGetOutcome(
        String key,
        String returnedValue,
        String hitOrMiss,
        boolean stale,
        long requestTimeMs,
        long responseTimeMs,
        long latencyMs) {
    public static final String HIT = "HIT";
    public static final String BYPASS = "BYPASS";
    public static final String ERROR = "ERROR";
    public static final String MISS = "MISS";
}
