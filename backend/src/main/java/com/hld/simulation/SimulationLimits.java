package com.hld.simulation;

public record SimulationLimits(
        int maxRequests,
        int maxNodes,
        int maxWorkersPerNode,
        int maxQueueCapacity,
        long maxArrivalTimeMs,
        long maxServiceTimeMs,
        int maxEvents,
        long maxVirtualTimeMs) {
    public static final int DEFAULT_MAX_REQUESTS = 100;
    public static final int DEFAULT_MAX_NODES = 8;
    public static final int DEFAULT_MAX_WORKERS_PER_NODE = 8;
    public static final int DEFAULT_MAX_QUEUE_CAPACITY = 100;
    public static final long DEFAULT_MAX_ARRIVAL_TIME_MS = 60_000;
    public static final long DEFAULT_MAX_SERVICE_TIME_MS = 10_000;
    public static final int DEFAULT_MAX_EVENTS = 10_000;
    public static final long DEFAULT_MAX_VIRTUAL_TIME_MS = 60_000;

    public static SimulationLimits defaults() {
        return new SimulationLimits(
                DEFAULT_MAX_REQUESTS,
                DEFAULT_MAX_NODES,
                DEFAULT_MAX_WORKERS_PER_NODE,
                DEFAULT_MAX_QUEUE_CAPACITY,
                DEFAULT_MAX_ARRIVAL_TIME_MS,
                DEFAULT_MAX_SERVICE_TIME_MS,
                DEFAULT_MAX_EVENTS,
                DEFAULT_MAX_VIRTUAL_TIME_MS);
    }
}
