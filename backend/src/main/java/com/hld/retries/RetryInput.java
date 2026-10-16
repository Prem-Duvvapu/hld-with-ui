package com.hld.retries;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** A complete finite caller workload; server service times are authored, not measured. */
public record RetryInput(String schemaVersion, String modelVersion, Long seed,
        Integer workers, Integer queueCapacity, Integer attemptTimeoutMs, Integer overallTimeoutMs,
        Integer maxAttempts, Backoff backoff, Integer baseDelayMs, Integer maxDelayMs,
        Jitter jitter, Integer retryBudget, Integer unavailableUntilMs, List<Request> requests) {
    public static final String SCHEMA_VERSION = "1.0";
    public static final String MODEL_VERSION = "1.0.0";
    public static final String ID_PATTERN = "[a-z][a-z0-9-]{0,31}";
    public static final long MAX_SAFE_SEED = 9_007_199_254_740_991L;
    public static final int MAX_WORKERS = 3;
    public static final int MAX_QUEUE_CAPACITY = 12;
    public static final int MAX_REQUESTS = 12;
    public static final int MAX_ARRIVAL_TIME_MS = 10_000;
    public static final int MAX_SERVICE_TIME_MS = 1_000;
    public static final int MAX_ATTEMPT_TIMEOUT_MS = 1_000;
    public static final int MAX_OVERALL_TIMEOUT_MS = 10_000;
    public static final int MAX_ATTEMPTS = 5;
    public static final int MAX_DELAY_MS = 1_000;
    public static final int MAX_RETRY_BUDGET = 48;
    public static final int MAX_UNAVAILABLE_UNTIL_MS = 10_000;
    public static final int MAX_ID_LENGTH = 32;
    public static final int MAX_CALLBACKS = 192;
    public static final int MAX_EVENTS = 384;
    public static final int MAX_VIRTUAL_TIME_MS = 80_000;

    public RetryInput {
        // Keep malformed null entries for explicit whole-input domain validation.
        requests = requests == null ? null : Collections.unmodifiableList(new ArrayList<>(requests));
    }

    public enum Backoff { IMMEDIATE, EXPONENTIAL }
    public enum Jitter { NONE, FULL }
    public record Request(String id, Integer arrivalTimeMs, Integer serviceTimeMs) {}
}
