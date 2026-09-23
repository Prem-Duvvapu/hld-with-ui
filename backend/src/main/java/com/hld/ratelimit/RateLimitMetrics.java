package com.hld.ratelimit;

public record RateLimitMetrics(
        int total,
        int allowed,
        int rejected,
        int bypassed,
        int configuredLimit,
        int counters,
        int maximumAggregateAllowance) {}
