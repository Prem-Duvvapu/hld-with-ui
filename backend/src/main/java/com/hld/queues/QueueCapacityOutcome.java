package com.hld.queues;

/** Actual job progress; terminal and successful latency fields remain absent until observed. */
public record QueueCapacityOutcome(String jobId, Status status, long arrivalTimeMs,
                                   long serviceTimeMs, String workerId, Long startTimeMs,
                                   Long terminalTimeMs, Long waitTimeMs, Long latencyMs) {
    public enum Status { NOT_ARRIVED, QUEUED, RUNNING, COMPLETED, REJECTED }
}
