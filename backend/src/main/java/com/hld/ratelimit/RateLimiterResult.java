package com.hld.ratelimit;

import java.util.List;

public record RateLimiterResult(
        String schemaVersion,
        String simulationId,
        String modelVersion,
        long seed,
        String status,
        List<String> assumptions,
        List<RateLimitEvent> events,
        List<RateLimitOutcome> outcomes,
        RateLimitMetrics metrics) {}
