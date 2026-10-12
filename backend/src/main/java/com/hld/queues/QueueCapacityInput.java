package com.hld.queues;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** One finite workload for a shared FIFO waiting queue and a worker pool. */
public record QueueCapacityInput(String schemaVersion, String modelVersion, int workers,
                                 int queueCapacity, List<Job> jobs, long seed) {
    public static final String SCHEMA_VERSION = "1.0";
    public static final String MODEL_VERSION = "1.0.0";

    public QueueCapacityInput {
        // Keep invalid nulls available to direct domain validation, while owning valid lists.
        if (jobs != null) jobs = Collections.unmodifiableList(new ArrayList<>(jobs));
    }

    public record Job(String id, long arrivalTimeMs, long serviceTimeMs) {}
}
