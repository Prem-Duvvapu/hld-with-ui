package com.hld.queues;

import java.util.List;

/** Immutable presentation state. A scheduled completion is not an observed completion. */
public record QueueCapacityState(List<String> queuedJobIds, List<Worker> workers) {
    public QueueCapacityState {
        queuedJobIds = List.copyOf(queuedJobIds);
        workers = List.copyOf(workers);
    }

    public record Worker(String id, String jobId, Long startedAtMs, Long scheduledCompletionAtMs) {}
}
