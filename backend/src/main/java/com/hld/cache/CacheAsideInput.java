package com.hld.cache;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * Input for a cache-aside simulation run.
 *
 * <p>Configures cache lookup latency, origin read latency, TTL, initial
 * origin value, and a sequence of GET/UPDATE operations.
 */
public record CacheAsideInput(
        @JsonProperty(required = true)
        @NotNull @Pattern(regexp = "1\\.0") String schemaVersion,
        @JsonProperty(required = true)
        @NotNull @Pattern(regexp = "1\\.0\\.1") String modelVersion,
        @JsonProperty(required = true)
        @Min(0) @Max(CacheAsideLimits.MAX_LATENCY_MS) long cacheLookupLatencyMs,
        @JsonProperty(required = true)
        @Min(0) @Max(CacheAsideLimits.MAX_LATENCY_MS) long originReadLatencyMs,
        @JsonProperty(required = true)
        @Min(0) @Max(CacheAsideLimits.MAX_TTL_MS) long ttlMs,
        @JsonProperty(required = true)
        @NotNull @Size(max = CacheAsideLimits.MAX_VALUE_LENGTH) String initialOriginValue,
        @JsonProperty(required = true)
        @NotNull @Size(min = 1, max = CacheAsideLimits.MAX_OPERATIONS)
        List<@Valid @NotNull CacheOperation> operations,
        @JsonProperty(required = true)
        boolean cacheAvailable,
        @JsonProperty(required = true)
        boolean originAvailable,
        @JsonProperty(required = true) long seed) {

    public static final String CURRENT_SCHEMA_VERSION = "1.0";
    public static final String CURRENT_MODEL_VERSION = "1.0.1";

    /**
     * Convenience factory for standard inputs.
     */
    public static CacheAsideInput create(
            long cacheLookupLatencyMs,
            long originReadLatencyMs,
            long ttlMs,
            String initialOriginValue,
            List<CacheOperation> operations,
            long seed) {
        return new CacheAsideInput(
                CURRENT_SCHEMA_VERSION,
                CURRENT_MODEL_VERSION,
                cacheLookupLatencyMs,
                originReadLatencyMs,
                ttlMs,
                initialOriginValue,
                operations,
                true,
                true,
                seed);
    }

    /**
     * Convenience factory for inputs with availability overrides.
     */
    public static CacheAsideInput withAvailability(
            long cacheLookupLatencyMs,
            long originReadLatencyMs,
            long ttlMs,
            String initialOriginValue,
            List<CacheOperation> operations,
            boolean cacheAvailable,
            boolean originAvailable,
            long seed) {
        return new CacheAsideInput(
                CURRENT_SCHEMA_VERSION,
                CURRENT_MODEL_VERSION,
                cacheLookupLatencyMs,
                originReadLatencyMs,
                ttlMs,
                initialOriginValue,
                operations,
                cacheAvailable,
                originAvailable,
                seed);
    }
}
