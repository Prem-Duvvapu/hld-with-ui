package com.hld.ratelimit;

public record RateLimitOutcome(
        String requestId,
        String nodeId,
        long timeMs,
        String decision,
        int remaining,
        Long retryAfterMs,
        String reason) {}
