package com.hld.simulation;

public record SimulationEvent(
        int sequence,
        long timeMs,
        String kind,
        String requestId,
        String nodeId,
        String message) {
}
