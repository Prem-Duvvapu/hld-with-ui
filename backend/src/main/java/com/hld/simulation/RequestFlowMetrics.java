package com.hld.simulation;

public record RequestFlowMetrics(
        int completed,
        int rejected,
        Double meanLatencyMs,
        Long p95LatencyMs,
        Double throughputPerSecond,
        long observationWindowMs) {
}
