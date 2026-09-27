package com.hld.cache;

/**
 * A single operation in a cache-aside simulation schedule.
 *
 * <p>{@code kind} is either {@code "GET"} or {@code "UPDATE"}.
 * A GET reads through the cache; an UPDATE changes the origin value
 * without touching the cache.
 */
public record CacheOperation(
        String kind,
        String key,
        String value,
        long timeMs) {
    public static final String GET = "GET";
    public static final String UPDATE = "UPDATE";
}
