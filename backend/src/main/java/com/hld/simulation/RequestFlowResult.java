package com.hld.simulation;

import java.util.List;

public record RequestFlowResult(
        String schemaVersion,
        String simulationId,
        String modelVersion,
        long seed,
        String status,
        String truncationReason,
        long lastVirtualTimeMs,
        int incompleteRequests,
        SimulationLimits limits,
        List<String> assumptions,
        List<SimulationEvent> events,
        List<RequestOutcome> outcomes,
        RequestFlowMetrics metrics) {
}
