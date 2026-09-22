package com.hld.simulation;

import java.util.List;

public record RequestFlowResult(
        String simulationId,
        String modelVersion,
        long seed,
        String status,
        List<String> assumptions,
        List<SimulationEvent> events,
        List<RequestOutcome> outcomes,
        RequestFlowMetrics metrics) {
}
