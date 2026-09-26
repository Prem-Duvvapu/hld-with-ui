package com.hld.simulation;

import com.hld.simulation.engine.FailureScheduleEntry;
import com.hld.simulation.engine.InFlightBehavior;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

public record RequestFlowInput(
        @NotNull @Pattern(regexp = "1\\.0") String schemaVersion,
        @NotNull @Pattern(regexp = "1\\.(0\\.0|1\\.0)") String modelVersion,
        @NotNull RoutingPolicy policy,
        @NotNull @Size(min = 1, max = SimulationLimits.DEFAULT_MAX_REQUESTS)
                List<@Min(0) @Max(SimulationLimits.DEFAULT_MAX_ARRIVAL_TIME_MS) Long> arrivalTimesMs,
        @NotNull @Size(min = 1, max = SimulationLimits.DEFAULT_MAX_NODES)
                List<@Min(1) @Max(SimulationLimits.DEFAULT_MAX_SERVICE_TIME_MS) Long> nodeServiceTimesMs,
        @Min(1) @Max(SimulationLimits.DEFAULT_MAX_WORKERS_PER_NODE) int workersPerNode,
        @Min(0) @Max(SimulationLimits.DEFAULT_MAX_QUEUE_CAPACITY) int queueCapacity,
        List<FailureScheduleEntry> failureSchedule,
        long seed) {
    public static final String CURRENT_SCHEMA_VERSION = "1.0";
    /** Model version 1.0.0: no failure schedule support. */
    public static final String MODEL_VERSION_1_0 = "1.0.0";
    /** Model version 1.1.0: adds optional failure schedule. */
    public static final String MODEL_VERSION_1_1 = "1.1.0";
    public static final String CURRENT_MODEL_VERSION = MODEL_VERSION_1_1;

    /**
     * Creates an input with the current model version and no failure schedule.
     * Backward-compatible with existing test code.
     */
    public static RequestFlowInput current(
            RoutingPolicy policy,
            List<Long> arrivalTimesMs,
            List<Long> nodeServiceTimesMs,
            int workersPerNode,
            int queueCapacity,
            long seed) {
        return new RequestFlowInput(
                CURRENT_SCHEMA_VERSION,
                CURRENT_MODEL_VERSION,
                policy,
                arrivalTimesMs,
                nodeServiceTimesMs,
                workersPerNode,
                queueCapacity,
                null,
                seed);
    }

    /**
     * Creates an input with the current model version and a failure schedule.
     */
    public static RequestFlowInput withFailures(
            RoutingPolicy policy,
            List<Long> arrivalTimesMs,
            List<Long> nodeServiceTimesMs,
            int workersPerNode,
            int queueCapacity,
            List<FailureScheduleEntry> failureSchedule,
            long seed) {
        return new RequestFlowInput(
                CURRENT_SCHEMA_VERSION,
                CURRENT_MODEL_VERSION,
                policy,
                arrivalTimesMs,
                nodeServiceTimesMs,
                workersPerNode,
                queueCapacity,
                failureSchedule,
                seed);
    }
}
