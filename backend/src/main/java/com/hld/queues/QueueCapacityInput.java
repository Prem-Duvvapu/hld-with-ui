package com.hld.queues;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** One finite workload for a shared FIFO waiting queue and a worker pool. */
public record QueueCapacityInput(
        @JsonProperty(required = true) @NotNull @Pattern(regexp = "1\\.0") String schemaVersion,
        @JsonProperty(required = true) @NotNull @Pattern(regexp = "1\\.0\\.0") String modelVersion,
        @JsonProperty(required = true) @Min(1) @Max(QueueCapacitySimulator.MAX_WORKERS) int workers,
        @JsonProperty(required = true) @Min(0) @Max(QueueCapacitySimulator.MAX_QUEUE_CAPACITY) int queueCapacity,
        @JsonProperty(required = true) @NotNull @Size(min = 1, max = QueueCapacitySimulator.MAX_JOBS)
        List<@NotNull @Valid Job> jobs,
        @JsonProperty(required = true) @Min(-QueueCapacitySimulator.MAX_ABSOLUTE_SEED)
        @Max(QueueCapacitySimulator.MAX_ABSOLUTE_SEED) long seed) {
    public static final String SCHEMA_VERSION = "1.0";
    public static final String MODEL_VERSION = "1.0.0";

    public QueueCapacityInput {
        // Keep invalid nulls available to direct domain validation, while owning valid lists.
        if (jobs != null) jobs = Collections.unmodifiableList(new ArrayList<>(jobs));
    }

    public record Job(
            @JsonProperty(required = true) @NotNull @Pattern(regexp = QueueCapacitySimulator.JOB_ID_PATTERN) String id,
            @JsonProperty(required = true) @Min(0) @Max(QueueCapacitySimulator.MAX_ARRIVAL_TIME_MS) long arrivalTimeMs,
            @JsonProperty(required = true) @Min(1) @Max(QueueCapacitySimulator.MAX_SERVICE_TIME_MS) long serviceTimeMs) {}
}
