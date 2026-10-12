package com.hld.delivery;

import com.hld.delivery.DeliveryInput.FailureAction;
import com.hld.delivery.DeliveryState.BrokerStatus;

import java.util.List;

/** Immutable model evidence; a completed run can contain missing or repeated business effects. */
public record DeliveryResult(
        String schemaVersion,
        String simulationId,
        String modelVersion,
        long seed,
        String status,
        String truncationReason,
        long lastVirtualTimeMs,
        List<String> assumptions,
        DeliveryState initialState,
        List<DeliveryEvent> events,
        DeliveryState finalState,
        List<MessageOutcome> messageOutcomes,
        List<DeliveryState.Attempt> attemptOutcomes,
        List<LedgerEntry> ledger,
        DeliveryMetrics metrics,
        List<FailureOutcome> failureOutcomes,
        List<LostAcknowledgmentOutcome> lostAcknowledgmentOutcomes) {
    public DeliveryResult {
        assumptions = List.copyOf(assumptions);
        events = List.copyOf(events);
        messageOutcomes = List.copyOf(messageOutcomes);
        attemptOutcomes = List.copyOf(attemptOutcomes);
        ledger = List.copyOf(ledger);
        failureOutcomes = List.copyOf(failureOutcomes);
        lostAcknowledgmentOutcomes = List.copyOf(lostAcknowledgmentOutcomes);
    }

    public record MessageOutcome(
            String messageId,
            BrokerStatus status,
            int deliveries,
            int committedEffects,
            Long acknowledgedAtMs,
            Long firstEffectAtMs,
            Long ackLatencyMs,
            Long firstEffectLatencyMs) {}

    public enum FailureOutcomeStatus {
        REACHED,
        UNOBSERVED
    }

    public enum LossOutcomeStatus {
        REACHED,
        ACK_CANCELLED,
        ATTEMPT_NOT_DELIVERED,
        UNOBSERVED
    }

    public record FailureOutcome(
            int index,
            String consumerId,
            FailureAction action,
            long timeMs,
            FailureOutcomeStatus status) {}

    public record LostAcknowledgmentOutcome(
            String messageId, int attempt, LossOutcomeStatus status) {}
}
