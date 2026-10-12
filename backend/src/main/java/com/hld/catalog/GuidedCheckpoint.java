package com.hld.catalog;

import java.util.List;

/**
 * One guided step: predict, run a Java preset, reveal the target event, explain, then choose a
 * tradeoff. The target names an event by cache operation or queue job, kind, and occurrence, so
 * it survives narration changes and never depends on an array index.
 */
public record GuidedCheckpoint(
        String id,
        String title,
        String simulationId,
        String presetId,
        Target target,
        String prompt,
        String lookFor,
        String explanation,
        Tradeoff tradeoff) {

    /** Select the {@code occurrence}-th event for exactly one operation or job identity. */
    public record Target(Integer operation, String jobId, String kind, int occurrence) {
        public Target {
            if ((operation == null) == (jobId == null)) {
                throw new IllegalArgumentException("A checkpoint target requires exactly one operation or jobId");
            }
            if (operation != null && operation < 1) {
                throw new IllegalArgumentException("A checkpoint operation must be 1-based");
            }
            if (jobId != null && !jobId.matches("^[a-z][a-z0-9-]{0,31}$")) {
                throw new IllegalArgumentException("A checkpoint jobId must be a supported job identity");
            }
            if (kind == null || !kind.matches("^[a-z]+\\.[a-z]+$") || occurrence < 1) {
                throw new IllegalArgumentException("A checkpoint requires an event kind and 1-based occurrence");
            }
        }
    }

    public record Tradeoff(String prompt, List<Option> options, String recommendedOptionId) {
        public record Option(String id, String label, String feedback) {
        }
    }
}
