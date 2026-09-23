package com.hld.ratelimit;

public record RateLimitEvent(
        int sequence,
        long timeMs,
        String kind,
        String requestId,
        String nodeId,
        String message) {}
