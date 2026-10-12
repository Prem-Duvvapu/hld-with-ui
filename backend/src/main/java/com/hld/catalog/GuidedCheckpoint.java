package com.hld.catalog;

import com.hld.delivery.DeliveryEvent.Kind;
import com.hld.delivery.DeliveryInput;
import com.hld.simulation.engine.SimulationBudget;

import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * One guided step: predict, run a Java preset, reveal the target event, explain, then choose a
 * tradeoff. The target names an event by cache operation, queue job, or message/attempt pair, kind,
 * and occurrence, so it survives narration changes and never depends on an array index.
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

    /** Select an event for exactly one operation, job, or message/attempt identity. */
    public record Target(
            Integer operation,
            String jobId,
            String messageId,
            String attemptId,
            String kind,
            int occurrence) {
        private static final Set<Kind> DELIVERY_KINDS =
                Set.of(
                        Kind.DELIVERY_STARTED,
                        Kind.EFFECT_COMMITTED,
                        Kind.ACK_SENT,
                        Kind.ACK_ACCEPTED,
                        Kind.ACK_LOST,
                        Kind.ACK_STALE,
                        Kind.LEASE_EXPIRED,
                        Kind.MESSAGE_REQUEUED,
                        Kind.MESSAGE_DEAD_LETTERED,
                        Kind.ATTEMPT_CANCELLED);

        /** Existing cache and capacity callers retain their source and wire shape. */
        public Target(Integer operation, String jobId, String kind, int occurrence) {
            this(operation, jobId, null, null, kind, occurrence);
        }

        public Target {
            boolean delivery = messageId != null || attemptId != null;
            int groups = (operation == null ? 0 : 1) + (jobId == null ? 0 : 1) + (delivery ? 1 : 0);
            if (groups != 1) {
                throw new IllegalArgumentException(
                        "A checkpoint requires exactly one operation, jobId, or messageId/attemptId"
                            + " pair");
            }
            if (operation != null && operation < 1) {
                throw new IllegalArgumentException("A checkpoint operation must be 1-based");
            }
            if (jobId != null && !jobId.matches("^[a-z][a-z0-9-]{0,31}$")) {
                throw new IllegalArgumentException(
                        "A checkpoint jobId must be a supported job identity");
            }
            if (delivery) {
                if (messageId == null
                        || !messageId.matches(DeliveryInput.ID_PATTERN)
                        || attemptId == null
                        || !attemptId.matches(Pattern.quote(messageId) + "-a[1-5]")) {
                    throw new IllegalArgumentException(
                            "A delivery checkpoint requires a supported message and its matching"
                                + " attempt ID");
                }
                if (kind == null
                        || DELIVERY_KINDS.stream()
                                .noneMatch(candidate -> candidate.value().equals(kind))
                        || occurrence < 1
                        || occurrence > SimulationBudget.DEFAULT_MAX_EVENTS) {
                    throw new IllegalArgumentException(
                            "A delivery checkpoint requires an attempt-bearing kind and occurrence"
                                + " 1–10000");
                }
            } else if (kind == null || !kind.matches("^[a-z]+\\.[a-z]+$") || occurrence < 1) {
                throw new IllegalArgumentException(
                        "A checkpoint requires an event kind and 1-based occurrence");
            }
        }
    }

    public record Tradeoff(String prompt, List<Option> options, String recommendedOptionId) {
        public record Option(String id, String label, String feedback) {}
    }
}
