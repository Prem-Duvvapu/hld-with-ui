package com.hld.simulation;

public record SimulationLimits(
        int maxRequests,
        int maxNodes,
        int maxWorkersPerNode,
        int maxQueueCapacity,
        int maxEvents,
        long maxVirtualTimeMs) {
    public static SimulationLimits defaults() {
        return new SimulationLimits(100, 8, 8, 100, 10_000, 60_000);
    }
}
