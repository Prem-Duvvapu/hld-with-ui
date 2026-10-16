package com.hld.retries;

/** Descriptor input bounds derive from the authoritative finite model. */
public record RetryLimits(long maxSafeSeed, int maxWorkers, int maxQueueCapacity,
        int maxRequests, int maxArrivalTimeMs, int maxServiceTimeMs, int maxAttemptTimeoutMs,
        int maxOverallTimeoutMs, int maxAttempts, int maxDelayMs, int maxRetryBudget,
        int maxUnavailableUntilMs, int maxIdLength) {
    public static final RetryLimits CURRENT = new RetryLimits(RetryInput.MAX_SAFE_SEED,
            RetryInput.MAX_WORKERS, RetryInput.MAX_QUEUE_CAPACITY, RetryInput.MAX_REQUESTS,
            RetryInput.MAX_ARRIVAL_TIME_MS, RetryInput.MAX_SERVICE_TIME_MS,
            RetryInput.MAX_ATTEMPT_TIMEOUT_MS, RetryInput.MAX_OVERALL_TIMEOUT_MS,
            RetryInput.MAX_ATTEMPTS, RetryInput.MAX_DELAY_MS, RetryInput.MAX_RETRY_BUDGET,
            RetryInput.MAX_UNAVAILABLE_UNTIL_MS, RetryInput.MAX_ID_LENGTH);
}
