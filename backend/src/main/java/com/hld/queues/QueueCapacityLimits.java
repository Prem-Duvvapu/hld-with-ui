package com.hld.queues;

/** Published validation bounds, backed by the same constants as the input and domain model. */
public record QueueCapacityLimits(int minJobs, int maxJobs, int minWorkers, int maxWorkers,
                                   int minQueueCapacity, int maxQueueCapacity,
                                   long minArrivalTimeMs, long maxArrivalTimeMs,
                                   long minServiceTimeMs, long maxServiceTimeMs,
                                   long minSeed, long maxSeed, String jobIdPattern) {
    public static final QueueCapacityLimits CURRENT = new QueueCapacityLimits(
            1, QueueCapacitySimulator.MAX_JOBS, 1, QueueCapacitySimulator.MAX_WORKERS,
            0, QueueCapacitySimulator.MAX_QUEUE_CAPACITY, 0, QueueCapacitySimulator.MAX_ARRIVAL_TIME_MS,
            1, QueueCapacitySimulator.MAX_SERVICE_TIME_MS, -QueueCapacitySimulator.MAX_ABSOLUTE_SEED,
            QueueCapacitySimulator.MAX_ABSOLUTE_SEED, QueueCapacitySimulator.JOB_ID_PATTERN);
}
