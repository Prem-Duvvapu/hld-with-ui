package com.hld.cache;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * A single operation in a cache-aside simulation schedule.
 *
 * <p>{@code kind} is either {@code "GET"} or {@code "UPDATE"}.
 * A GET reads through the cache; an UPDATE changes the origin value
 * without touching the cache.
 */
public record CacheOperation(
        @JsonProperty(required = true) String kind,
        @JsonProperty(required = true) String key,
        String value,
        @JsonProperty(required = true) long timeMs) {
    public static final String GET = "GET";
    public static final String UPDATE = "UPDATE";
}
