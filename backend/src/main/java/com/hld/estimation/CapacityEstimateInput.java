package com.hld.estimation;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record CapacityEstimateInput(
        @NotNull @Pattern(regexp = "1\\.0") String schemaVersion,
        @Min(1) @Max(1_000_000_000) long dailyActiveUsers,
        @DecimalMin("0.01") @DecimalMax("100000") double requestsPerUserPerDay,
        @DecimalMin("1.0") @DecimalMax("1000.0") double peakFactor,
        @DecimalMin("0.0") @DecimalMax("100.0") double readPercentage,
        @DecimalMin("0.001") @DecimalMax("1000000.0") double recordSizeKb,
        @DecimalMin("0.001") @DecimalMax("1000000.0") double responseSizeKb,
        @Min(1) @Max(36_500) int retentionDays,
        @Min(1) @Max(10) int replicationFactor,
        @DecimalMin("0.1") @DecimalMax("600000.0") double meanLatencyMs,
        @DecimalMin("0.0") @DecimalMax("300.0") double headroomPercentage) {
    public static final String SCHEMA_VERSION = "1.0";
}
