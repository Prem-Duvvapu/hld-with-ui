package com.hld.queues;

import java.util.List;

/** A complete finite execution or the last admitted prefix when an execution guard stops it. */
public record QueueCapacityResult(String schemaVersion, String simulationId, String modelVersion,
                                  long seed, String status, String truncationReason,
                                  long lastVirtualTimeMs, List<String> assumptions,
                                  QueueCapacityState initialState, List<QueueCapacityEvent> events,
                                  QueueCapacityState finalState, List<QueueCapacityOutcome> outcomes,
                                  QueueCapacityMetrics metrics) {
    public QueueCapacityResult {
        assumptions = List.copyOf(assumptions);
        events = List.copyOf(events);
        outcomes = List.copyOf(outcomes);
    }
}
