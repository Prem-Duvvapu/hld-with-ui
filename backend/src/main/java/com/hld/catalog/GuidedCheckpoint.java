package com.hld.catalog;

import com.hld.atomicity.AtomicityInput;
import com.hld.atomicity.AtomicityResult;
import com.hld.dataaccess.DataAccessInput;
import com.hld.delivery.DeliveryEvent.Kind;
import com.hld.delivery.DeliveryInput;
import com.hld.simulation.engine.SimulationBudget;
import com.hld.retries.RetryInput;
import com.hld.retries.RetryResult;
import com.hld.transactions.ReservationInput;
import com.hld.transactions.ReservationResult;

import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * One guided step: predict, run a Java preset, reveal the target evidence, explain, then choose a
 * tradeoff. Stable model identities select an event or an untimed operation outcome; narration
 * and array positions are never identities.
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

    /** Select exactly one event identity family or one stable operation-outcome identity. */
    public record Target(
            Integer operation,
            String jobId,
            String messageId,
            String attemptId,
            String operationId,
            String stepId,
            String requestId,
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
            this(operation, jobId, null, null, null, null, null, kind, occurrence);
        }

        /** Existing delivery callers retain their source and wire shape. */
        public Target(Integer operation, String jobId, String messageId, String attemptId,
                String kind, int occurrence) {
            this(operation, jobId, messageId, attemptId, null, null, null, kind, occurrence);
        }

        /** Existing data-access callers retain their source and wire shape. */
        public Target(Integer operation, String jobId, String messageId, String attemptId,
                String operationId, String kind, int occurrence) {
            this(operation, jobId, messageId, attemptId, operationId, null, null, kind, occurrence);
        }

        /** Existing transaction callers retain their source and wire shape. */
        public Target(Integer operation, String jobId, String messageId, String attemptId,
                String operationId, String stepId, String kind, int occurrence) {
            this(operation, jobId, messageId, attemptId, operationId, stepId, null, kind, occurrence);
        }

        public Target {
            boolean retry = requestId != null;
            boolean delivery = messageId != null || attemptId != null && !retry;
            int groups = (operation == null ? 0 : 1) + (jobId == null ? 0 : 1)
                    + (delivery ? 1 : 0) + (operationId == null ? 0 : 1) + (stepId == null ? 0 : 1) + (retry ? 1 : 0);
            if (groups != 1) {
                throw new IllegalArgumentException(
                        "A checkpoint requires exactly one operation, jobId, messageId/attemptId"
                            + " pair, operationId, stepId, or retry requestId");
            }
            if (operation != null && operation < 1) {
                throw new IllegalArgumentException("A checkpoint operation must be 1-based");
            }
            if (jobId != null && !jobId.matches("^[a-z][a-z0-9-]{0,31}$")) {
                throw new IllegalArgumentException(
                        "A checkpoint jobId must be a supported job identity");
            }
            if (retry) {
                if (!Pattern.matches(RetryInput.ID_PATTERN, requestId)
                        || kind == null
                        || java.util.Arrays.stream(RetryResult.Kind.values())
                                .noneMatch(candidate -> candidate.name().equals(kind))
                        || occurrence < 1 || occurrence > RetryInput.MAX_EVENTS) {
                    throw new IllegalArgumentException(
                            "A retry checkpoint requires a supported requestId, event kind and occurrence 1–384");
                }
                boolean requestScoped = kind.equals(RetryResult.Kind.REQUEST_ARRIVED.name())
                        || kind.equals(RetryResult.Kind.REQUEST_SUCCEEDED.name())
                        || kind.equals(RetryResult.Kind.REQUEST_FAILED.name());
                if (requestScoped ? attemptId != null
                        : attemptId == null || !Pattern.matches(Pattern.quote(requestId) + "-a[1-5]", attemptId)) {
                    throw new IllegalArgumentException(
                            "A retry checkpoint needs a matching attemptId only for attempt-scoped events");
                }
            } else if (stepId != null) {
                if (!Pattern.matches(ReservationInput.ID_PATTERN, stepId)
                        || !Pattern.matches(AtomicityInput.ID_PATTERN, stepId)
                        || kind == null
                        || java.util.Arrays.stream(ReservationResult.Kind.values())
                                .noneMatch(candidate -> candidate.name().equals(kind))
                            && java.util.Arrays.stream(AtomicityResult.Kind.values())
                                .noneMatch(candidate -> candidate.name().equals(kind))
                        || occurrence != 1) {
                    throw new IllegalArgumentException(
                            "A transaction checkpoint requires a supported stepId, outcome kind"
                                    + " and occurrence 1");
                }
            } else if (operationId != null) {
                if (!Pattern.matches(DataAccessInput.ID_PATTERN, operationId)
                        || kind == null
                        || java.util.Arrays.stream(DataAccessInput.Kind.values())
                                .noneMatch(candidate -> candidate.name().equals(kind))
                        || occurrence != 1) {
                    throw new IllegalArgumentException(
                            "An analysis checkpoint requires a supported operationId, operation kind"
                                    + " and occurrence 1");
                }
            } else if (delivery) {
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
