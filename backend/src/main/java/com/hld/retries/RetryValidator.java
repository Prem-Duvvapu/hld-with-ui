package com.hld.retries;

import java.util.HashSet;
import java.util.regex.Pattern;

/** Reject the entire malformed workload before allocating any execution state. */
public final class RetryValidator {
    private RetryValidator() {}

    public static void validate(RetryInput input) {
        if (input == null) throw invalid("input is required");
        if (!RetryInput.SCHEMA_VERSION.equals(input.schemaVersion())) throw invalid("unsupported schemaVersion");
        if (!RetryInput.MODEL_VERSION.equals(input.modelVersion())) throw invalid("unsupported modelVersion");
        if (input.seed() == null || input.seed() < -RetryInput.MAX_SAFE_SEED || input.seed() > RetryInput.MAX_SAFE_SEED)
            throw invalid("seed must be a JavaScript-safe integer");
        bounded("workers", input.workers(), 1, RetryInput.MAX_WORKERS);
        bounded("queueCapacity", input.queueCapacity(), 0, RetryInput.MAX_QUEUE_CAPACITY);
        bounded("attemptTimeoutMs", input.attemptTimeoutMs(), 1, RetryInput.MAX_ATTEMPT_TIMEOUT_MS);
        bounded("overallTimeoutMs", input.overallTimeoutMs(), 1, RetryInput.MAX_OVERALL_TIMEOUT_MS);
        bounded("maxAttempts", input.maxAttempts(), 1, RetryInput.MAX_ATTEMPTS);
        bounded("retryBudget", input.retryBudget(), 0, RetryInput.MAX_RETRY_BUDGET);
        bounded("unavailableUntilMs", input.unavailableUntilMs(), 0, RetryInput.MAX_UNAVAILABLE_UNTIL_MS);
        if (input.backoff() == null || input.jitter() == null) throw invalid("backoff and jitter are required");
        if (input.backoff() == RetryInput.Backoff.IMMEDIATE) {
            bounded("baseDelayMs", input.baseDelayMs(), 0, 0);
            bounded("maxDelayMs", input.maxDelayMs(), 0, 0);
            if (input.jitter() != RetryInput.Jitter.NONE) throw invalid("IMMEDIATE requires NONE jitter");
        } else {
            bounded("baseDelayMs", input.baseDelayMs(), 1, RetryInput.MAX_DELAY_MS);
            bounded("maxDelayMs", input.maxDelayMs(), input.baseDelayMs(), RetryInput.MAX_DELAY_MS);
        }
        if (input.requests() == null || input.requests().isEmpty() || input.requests().size() > RetryInput.MAX_REQUESTS)
            throw invalid("requests must contain 1.." + RetryInput.MAX_REQUESTS + " entries");
        var ids = new HashSet<String>();
        int previousArrival = -1;
        for (var request : input.requests()) {
            if (request == null) throw invalid("request entries cannot be null");
            if (request.id() == null || !Pattern.matches(RetryInput.ID_PATTERN, request.id()) || !ids.add(request.id()))
                throw invalid("request ids must be unique supported ASCII identities");
            bounded("arrivalTimeMs", request.arrivalTimeMs(), 0, RetryInput.MAX_ARRIVAL_TIME_MS);
            bounded("serviceTimeMs", request.serviceTimeMs(), 1, RetryInput.MAX_SERVICE_TIME_MS);
            if (request.arrivalTimeMs() < previousArrival) throw invalid("arrivals must be in nondecreasing input order");
            previousArrival = request.arrivalTimeMs();
        }
    }

    private static void bounded(String field, Integer value, int min, int max) {
        if (value == null || value < min || value > max) throw invalid(field + " must be in " + min + ".." + max);
    }
    private static IllegalArgumentException invalid(String message) {
        return new IllegalArgumentException("Invalid retry workload: " + message + ".");
    }
}
