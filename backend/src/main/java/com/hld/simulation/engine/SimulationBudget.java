package com.hld.simulation.engine;

/**
 * Runtime budget limits for a single simulation run. These are execution
 * bounds checked cooperatively by the runner context, separate from the
 * per-model input-validation limits in {@code SimulationLimits}.
 *
 * @param maxEvents          maximum number of events the trace may contain
 * @param maxVirtualTimeMs   maximum virtual time before the run is truncated
 * @param maxTraceBytes      maximum estimated serialized trace size in bytes
 * @param wallDeadlineMs     maximum wall-clock duration in milliseconds;
 *                           zero or negative disables the wall-time check
 */
public record SimulationBudget(
        int maxEvents,
        long maxVirtualTimeMs,
        long maxTraceBytes,
        long wallDeadlineMs) {

    /** 10 000 events, 60 s virtual time, 2 MiB trace, 10 s wall time. */
    public static final int DEFAULT_MAX_EVENTS = 10_000;
    public static final long DEFAULT_MAX_VIRTUAL_TIME_MS = 60_000L;
    public static final long DEFAULT_MAX_TRACE_BYTES = 2L * 1024 * 1024;
    public static final long DEFAULT_WALL_DEADLINE_MS = 10_000L;

    public static SimulationBudget defaults() {
        return new SimulationBudget(
                DEFAULT_MAX_EVENTS,
                DEFAULT_MAX_VIRTUAL_TIME_MS,
                DEFAULT_MAX_TRACE_BYTES,
                DEFAULT_WALL_DEADLINE_MS);
    }
}
