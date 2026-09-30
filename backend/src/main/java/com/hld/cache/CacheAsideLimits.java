package com.hld.cache;

/**
 * Input bounds for the cache-aside model. The constants back both the input
 * annotations and the simulator's own validation; {@link #CURRENT} is
 * published in the descriptor so the frontend validates against the same
 * values instead of repeating them.
 */
public record CacheAsideLimits(
        long maxLatencyMs,
        long maxTtlMs,
        int maxOperations,
        long maxOperationTimeMs,
        int maxKeyLength,
        int maxValueLength) {

    public static final long MAX_LATENCY_MS = 10_000;
    public static final long MAX_TTL_MS = 60_000;
    public static final int MAX_OPERATIONS = 100;
    public static final long MAX_OPERATION_TIME_MS = 60_000;
    public static final int MAX_KEY_LENGTH = 64;
    public static final int MAX_VALUE_LENGTH = 256;

    public static final CacheAsideLimits CURRENT = new CacheAsideLimits(
            MAX_LATENCY_MS, MAX_TTL_MS, MAX_OPERATIONS, MAX_OPERATION_TIME_MS,
            MAX_KEY_LENGTH, MAX_VALUE_LENGTH);
}
