package com.hld.delivery;

import com.hld.simulation.engine.SimulationBudget;

/**
 * Input bounds share the domain constants; trace ceilings describe the registered default runner.
 */
public record DeliveryLimits(
        int minMessages,
        int maxMessages,
        int minConsumers,
        int maxConsumers,
        int maxFailures,
        int maxLostAcknowledgments,
        long minTimeMs,
        long maxTimeMs,
        long minProcessingTimeMs,
        long maxProcessingTimeMs,
        long minAcknowledgmentDelayMs,
        long maxAcknowledgmentDelayMs,
        long minVisibilityTimeoutMs,
        long maxVisibilityTimeoutMs,
        int minDeliveryAttempts,
        int maxDeliveryAttempts,
        long minSeed,
        long maxSeed,
        String idPattern,
        long maxVirtualTimeMs,
        int maxEvents,
        long maxTraceBytes) {
    public static final DeliveryLimits CURRENT =
            new DeliveryLimits(
                    1,
                    DeliveryInput.MAX_MESSAGES,
                    1,
                    DeliveryInput.MAX_CONSUMERS,
                    DeliveryInput.MAX_FAILURES,
                    DeliveryInput.MAX_LOST_ACKNOWLEDGMENTS,
                    0,
                    DeliveryInput.MAX_TIME_MS,
                    1,
                    DeliveryInput.MAX_PROCESSING_TIME_MS,
                    1,
                    DeliveryInput.MAX_ACKNOWLEDGMENT_DELAY_MS,
                    1,
                    DeliveryInput.MAX_VISIBILITY_TIMEOUT_MS,
                    1,
                    DeliveryInput.MAX_DELIVERY_ATTEMPTS,
                    -DeliveryInput.MAX_ABSOLUTE_SEED,
                    DeliveryInput.MAX_ABSOLUTE_SEED,
                    DeliveryInput.ID_PATTERN,
                    SimulationBudget.DEFAULT_MAX_VIRTUAL_TIME_MS,
                    SimulationBudget.DEFAULT_MAX_EVENTS,
                    SimulationBudget.DEFAULT_MAX_TRACE_BYTES);
}
