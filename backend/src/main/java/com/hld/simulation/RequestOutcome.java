package com.hld.simulation;

public record RequestOutcome(
        String requestId,
        String nodeId,
        String status,
        long arrivalMs,
        Long startMs,
        Long completionMs,
        Long queueMs,
        Long serviceMs,
        Long latencyMs) {
}
