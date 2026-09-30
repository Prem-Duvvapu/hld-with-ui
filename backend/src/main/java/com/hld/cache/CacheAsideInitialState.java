package com.hld.cache;

import java.util.List;

/**
 * State before the first event. Every run starts with an empty cache, and
 * availability is constant for the whole run.
 */
public record CacheAsideInitialState(
        boolean cacheAvailable,
        boolean originAvailable,
        List<OriginKey> origin) {

    /** A key present in the origin before the run starts. */
    public record OriginKey(String key, String value, long version) {
    }
}
