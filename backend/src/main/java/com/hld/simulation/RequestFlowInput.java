package com.hld.simulation;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record RequestFlowInput(
        @NotNull RoutingPolicy policy,
        @NotNull @Size(min = 1, max = 100) List<@Min(0) @Max(60_000) Long> arrivalTimesMs,
        @NotNull @Size(min = 1, max = 8) List<@Min(1) @Max(10_000) Long> nodeServiceTimesMs,
        @Min(1) @Max(8) int workersPerNode,
        @Min(0) @Max(100) int queueCapacity,
        long seed) {
}
