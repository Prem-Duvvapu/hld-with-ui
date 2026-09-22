package com.hld.estimation;

public record SensitivityPoint(
        String id,
        String label,
        double trafficMultiplier,
        double peakRequestsPerSecond,
        double peakResponseMegabitsPerSecond,
        double meanConcurrentRequests) {
}
