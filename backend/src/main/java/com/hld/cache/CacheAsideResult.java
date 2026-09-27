package com.hld.cache;

import com.hld.simulation.SimulationEvent;
import java.util.List;

/**
 * Complete result of a cache-aside simulation run.
 *
 * <p>Follows the same envelope shape as {@code RequestFlowResult}:
 * version, status, events, outcomes, metrics, and assumptions.
 */
public record CacheAsideResult(
        String schemaVersion,
        String simulationId,
        String modelVersion,
        long seed,
        String status,
        String truncationReason,
        long lastVirtualTimeMs,
        List<String> assumptions,
        List<SimulationEvent> events,
        List<CacheGetOutcome> outcomes,
        CacheAsideMetrics metrics) {
}
