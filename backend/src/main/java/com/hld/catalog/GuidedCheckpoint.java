package com.hld.catalog;

import java.util.List;

/**
 * One guided step: predict, run a Java preset, reveal the target event, explain, then choose a
 * tradeoff. The target names an event by operation, kind, and occurrence within that operation, so
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

    /** The {@code occurrence}-th event of {@code kind} emitted for 1-based {@code operation}. */
    public record Target(int operation, String kind, int occurrence) {
    }

    public record Tradeoff(String prompt, List<Option> options, String recommendedOptionId) {
        public record Option(String id, String label, String feedback) {
        }
    }
}
