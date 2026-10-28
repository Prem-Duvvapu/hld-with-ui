package com.hld.idempotency;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** A complete finite call program. Time and interleaving are authored, never measured. */
public record IdempotencyInput(String schemaVersion, String modelVersion, Mode mode,
        Integer retentionMs, List<Call> calls, List<Step> schedule) {
    public static final String SCHEMA_VERSION = "1.0";
    public static final String MODEL_VERSION = "1.0.0";
    public static final String ID_PATTERN = "[a-z][a-z0-9-]{0,31}";
    public static final int MAX_ID_LENGTH = 32;
    public static final int MAX_DERIVED_ID_LENGTH = 39;
    public static final int MIN_CALLS = 1;
    public static final int MAX_CALLS = 12;
    public static final int MIN_STEPS = 2;
    public static final int MAX_STEPS = 48;
    public static final int MAX_UNITS = 1_000;
    public static final int MAX_RETENTION_MS = 10_000;
    public static final int MAX_TIME_MS = 10_000;
    public static final int MAX_EXPIRES_AT_MS = 20_000;
    public static final int MAX_PUBLISHED_UNITS = MAX_CALLS * MAX_UNITS;

    public IdempotencyInput {
        // Preserve malformed null entries for explicit whole-program validation.
        calls = own(calls);
        schedule = own(schedule);
    }

    private static <T> List<T> own(List<T> values) {
        return values == null ? null : Collections.unmodifiableList(new ArrayList<>(values));
    }

    public enum Mode { NO_DEDUP, SPLIT_EFFECT_RECORD, ATOMIC_EFFECT_RECORD }
    public enum Action { LOOKUP, WRITE_EFFECT, SAVE_RESULT, RESPOND, LOSE_RESPONSE, CRASH_HANDLER }
    public record Call(String id, String operationId, String tenantId, String key, Integer units) {}
    public record Step(String id, String callId, Integer timeMs, Action action) {}
}
