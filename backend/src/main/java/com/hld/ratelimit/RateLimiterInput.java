package com.hld.ratelimit;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

public record RateLimiterInput(
        @NotNull @Pattern(regexp = "1\\.0") String schemaVersion,
        @NotNull @Pattern(regexp = "1\\.0\\.0") String modelVersion,
        @NotNull RateLimitAlgorithm algorithm,
        @NotNull CounterScope counterScope,
        @Min(1) @Max(20) int nodeCount,
        @Min(1) @Max(10_000) int limit,
        @Min(100) @Max(60_000) long windowMs,
        @Min(1) @Max(10_000) int refillTokensPerSecond,
        boolean counterBackendAvailable,
        @NotNull BackendFailurePolicy backendFailurePolicy,
        @NotNull @Size(min = 1, max = 500) List<@Min(0) @Max(300_000) Long> arrivalTimesMs,
        long seed) {
    public static final String SCHEMA_VERSION = "1.0";
    public static final String MODEL_VERSION = "1.0.0";
}
