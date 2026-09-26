package com.hld.simulation.engine;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * A validated, immutable list of failure schedule entries. Validates
 * that no entity has overlapping failure windows and that all times
 * are within a declared maximum virtual time.
 */
public final class FailureSchedule {
    private static final FailureSchedule EMPTY = new FailureSchedule(List.of());

    private final List<FailureScheduleEntry> entries;

    private FailureSchedule(List<FailureScheduleEntry> entries) {
        this.entries = List.copyOf(entries);
    }

    /**
     * Creates a validated failure schedule from the given entries.
     *
     * @param entries        the failure entries to validate
     * @param maxVirtualTimeMs maximum virtual time; entries must not exceed this
     * @param validEntityIds the set of entity IDs recognized by the model;
     *                       entries referencing unknown entities are rejected
     * @return a validated, immutable failure schedule
     * @throws IllegalArgumentException if validation fails
     */
    public static FailureSchedule of(
            List<FailureScheduleEntry> entries,
            long maxVirtualTimeMs,
            Set<String> validEntityIds) {
        if (entries == null || entries.isEmpty()) return EMPTY;

        List<FailureScheduleEntry> sorted = new ArrayList<>(entries);
        sorted.sort((a, b) -> {
            int cmp = a.entityId().compareTo(b.entityId());
            return cmp != 0 ? cmp : Long.compare(a.failAtMs(), b.failAtMs());
        });

        Map<String, Long> lastRecovery = new HashMap<>();
        for (FailureScheduleEntry entry : sorted) {
            if (!validEntityIds.contains(entry.entityId())) {
                throw new IllegalArgumentException(
                        "Unknown entity in failure schedule: " + entry.entityId());
            }
            if (entry.failAtMs() > maxVirtualTimeMs) {
                throw new IllegalArgumentException(
                        "failAtMs " + entry.failAtMs() + " exceeds maxVirtualTimeMs "
                                + maxVirtualTimeMs + " for entity " + entry.entityId());
            }
            if (entry.recoverAtMs() != null && entry.recoverAtMs() > maxVirtualTimeMs) {
                throw new IllegalArgumentException(
                        "recoverAtMs " + entry.recoverAtMs() + " exceeds maxVirtualTimeMs "
                                + maxVirtualTimeMs + " for entity " + entry.entityId());
            }
            Long previousEnd = lastRecovery.get(entry.entityId());
            if (previousEnd != null && entry.failAtMs() < previousEnd) {
                throw new IllegalArgumentException(
                        "Overlapping failure windows for entity " + entry.entityId()
                                + ": new failure at " + entry.failAtMs()
                                + " before previous recovery at " + previousEnd);
            }
            lastRecovery.put(entry.entityId(),
                    entry.recoverAtMs() != null ? entry.recoverAtMs() : Long.MAX_VALUE);
        }

        return new FailureSchedule(sorted);
    }

    /** Returns an empty failure schedule. */
    public static FailureSchedule empty() {
        return EMPTY;
    }

    /** Returns the validated entries, sorted by entity ID then failure time. */
    public List<FailureScheduleEntry> entries() {
        return entries;
    }

    /** Returns {@code true} if the schedule has no entries. */
    public boolean isEmpty() {
        return entries.isEmpty();
    }

    /**
     * Returns {@code true} if the given entity is in a failed state at the
     * given virtual time.
     */
    public boolean isEntityFailed(String entityId, long virtualTimeMs) {
        for (FailureScheduleEntry entry : entries) {
            if (!entry.entityId().equals(entityId)) continue;
            long end = entry.recoverAtMs() != null ? entry.recoverAtMs() : Long.MAX_VALUE;
            if (virtualTimeMs >= entry.failAtMs() && virtualTimeMs < end) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns the failure entry that activates at the given virtual time
     * for the given entity, or {@code null} if none matches exactly.
     */
    public FailureScheduleEntry failureAt(String entityId, long virtualTimeMs) {
        for (FailureScheduleEntry entry : entries) {
            if (entry.entityId().equals(entityId) && entry.failAtMs() == virtualTimeMs) {
                return entry;
            }
        }
        return null;
    }

    /**
     * Returns all entries for the given entity.
     */
    public List<FailureScheduleEntry> entriesFor(String entityId) {
        return entries.stream()
                .filter(e -> e.entityId().equals(entityId))
                .toList();
    }
}
