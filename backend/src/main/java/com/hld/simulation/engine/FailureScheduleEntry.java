package com.hld.simulation.engine;

/**
 * A single failure/recovery event in a scheduled failure sequence.
 *
 * @param entityId        stable identifier of the entity that fails (e.g. "Node A")
 * @param failAtMs        virtual time in milliseconds when the failure occurs
 * @param recoverAtMs     virtual time when the entity recovers; {@code null}
 *                        means the entity remains failed for the rest of the run
 * @param inFlightBehavior what happens to work already assigned at failure time
 */
public record FailureScheduleEntry(
        String entityId,
        long failAtMs,
        Long recoverAtMs,
        InFlightBehavior inFlightBehavior) {

    public FailureScheduleEntry {
        if (entityId == null || entityId.isBlank()) {
            throw new IllegalArgumentException("entityId must not be blank");
        }
        if (failAtMs < 0) {
            throw new IllegalArgumentException("failAtMs must be non-negative");
        }
        if (recoverAtMs != null && recoverAtMs <= failAtMs) {
            throw new IllegalArgumentException(
                    "recoverAtMs must be after failAtMs for entity " + entityId);
        }
        if (inFlightBehavior == null) {
            throw new IllegalArgumentException("inFlightBehavior must not be null");
        }
    }
}
