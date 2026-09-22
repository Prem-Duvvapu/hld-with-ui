package com.hld.estimation;

public record CapacityMetrics(
        double dailyRequests,
        double averageRequestsPerSecond,
        double peakRequestsPerSecond,
        double peakReadsPerSecond,
        double peakWritesPerSecond,
        double dailyWrites,
        double rawStorageGigabytes,
        double replicatedStorageGigabytes,
        double dailyResponseGigabytes,
        double peakResponseMegabitsPerSecond,
        double meanConcurrentRequests,
        double peakRequestsWithHeadroom) {
}
