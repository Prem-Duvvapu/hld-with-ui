package com.hld.delivery;

import java.util.List;

/** Broker allocation, consumer availability and attempt progress are independent facts. */
public record DeliveryState(
        List<Message> messages, List<Consumer> consumers, List<Attempt> attempts) {
    public DeliveryState {
        messages = List.copyOf(messages);
        consumers = List.copyOf(consumers);
        attempts = List.copyOf(attempts);
    }

    public enum BrokerStatus {
        NOT_ENQUEUED,
        READY,
        LEASED,
        ACKNOWLEDGED,
        DEAD_LETTERED
    }

    public enum ConsumerStatus {
        READY,
        DOWN
    }

    public enum LeaseStatus {
        ACTIVE,
        EXPIRED,
        ACKNOWLEDGED
    }

    public enum EffectStatus {
        PROCESSING,
        COMMITTED,
        CANCELLED
    }

    public enum AckStatus {
        PENDING,
        SENT,
        ACCEPTED,
        LOST,
        STALE,
        CANCELLED
    }

    public record Message(
            String id,
            BrokerStatus status,
            long enqueueTimeMs,
            Long availableSinceMs,
            int deliveryCount,
            String currentAttemptId,
            Long acknowledgedAtMs) {}

    public record Consumer(String id, ConsumerStatus status, String currentAttemptId) {}

    public record Attempt(
            String id,
            String messageId,
            int attempt,
            String consumerId,
            String leaseToken,
            long leaseDeadlineMs,
            long startedAtMs,
            long scheduledEffectAtMs,
            long scheduledAckAtMs,
            LeaseStatus leaseStatus,
            EffectStatus effectStatus,
            AckStatus ackStatus,
            Long effectCommittedAtMs,
            Long ackSentAtMs,
            Long ackResolvedAtMs,
            Long cancelledAtMs) {
        public Attempt withLease(LeaseStatus status) {
            return new Attempt(
                    id,
                    messageId,
                    attempt,
                    consumerId,
                    leaseToken,
                    leaseDeadlineMs,
                    startedAtMs,
                    scheduledEffectAtMs,
                    scheduledAckAtMs,
                    status,
                    effectStatus,
                    ackStatus,
                    effectCommittedAtMs,
                    ackSentAtMs,
                    ackResolvedAtMs,
                    cancelledAtMs);
        }

        public Attempt withEffect(EffectStatus status, Long committedAt, Long cancelledAt) {
            return new Attempt(
                    id,
                    messageId,
                    attempt,
                    consumerId,
                    leaseToken,
                    leaseDeadlineMs,
                    startedAtMs,
                    scheduledEffectAtMs,
                    scheduledAckAtMs,
                    leaseStatus,
                    status,
                    ackStatus,
                    committedAt,
                    ackSentAtMs,
                    ackResolvedAtMs,
                    cancelledAt);
        }

        public Attempt withAck(AckStatus status, Long sentAt, Long resolvedAt, Long cancelledAt) {
            return new Attempt(
                    id,
                    messageId,
                    attempt,
                    consumerId,
                    leaseToken,
                    leaseDeadlineMs,
                    startedAtMs,
                    scheduledEffectAtMs,
                    scheduledAckAtMs,
                    leaseStatus,
                    effectStatus,
                    status,
                    effectCommittedAtMs,
                    sentAt,
                    resolvedAt,
                    cancelledAt);
        }
    }
}
