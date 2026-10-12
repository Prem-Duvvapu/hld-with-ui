package com.hld.delivery;

/** Counts describe the observed prefix; confirmed ACK-without-effect requires full settlement. */
public record DeliveryMetrics(
        int deliveryAttempts,
        int redeliveries,
        int committedEffects,
        int messagesWithEffect,
        int extraEffects,
        int acknowledgedMessages,
        Integer acknowledgedWithoutEffect,
        int deadLetteredMessages,
        int notEnqueued,
        int ready,
        int leased,
        int runningEffects,
        int pendingAcknowledgments,
        int pendingFailureActions,
        int pendingEnqueues,
        int ackLatencySamples,
        Double meanAckLatencyMs,
        Long p95AckLatencyMs,
        int effectLatencySamples,
        Double meanFirstEffectLatencyMs,
        Long p95FirstEffectLatencyMs) {}
