package com.hld.cache;

/**
 * One cache-aside trace event with the state of its key immediately after the
 * event. Folding each event's key state over {@link CacheAsideResult#initialState()}
 * reconstructs the full cache and origin state at that event, so a renderer
 * never needs to parse {@code message}.
 *
 * @param operation   1-based position of the operation in the submitted input
 * @param key         the cache key the event applies to
 * @param cacheEntry  the key's cache entry after the event, or {@code null} when the cache holds none
 * @param originValue the key's committed origin value after the event, or {@code null} when absent
 */
public record CacheAsideTraceEvent(
        int sequence,
        long timeMs,
        String kind,
        String requestId,
        String nodeId,
        String message,
        int operation,
        String key,
        CacheEntryState cacheEntry,
        OriginValueState originValue) {

    /** A cache entry: the stored value, its origin version, and when it was filled and expires. */
    public record CacheEntryState(String value, long version, long filledAtMs, long expiresAtMs) {
    }

    /** A committed origin value and its version. */
    public record OriginValueState(String value, long version) {
    }
}
