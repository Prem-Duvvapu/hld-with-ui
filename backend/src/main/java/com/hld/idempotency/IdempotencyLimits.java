package com.hld.idempotency;

/** Every advertised finite bound comes from the authoritative model input. */
public record IdempotencyLimits(int minCalls, int maxCalls, int minSteps, int maxSteps,
        int maxUnits, int maxRetentionMs, int maxTimeMs, int maxIdLength,
        int maxDerivedIdLength, int maxExpiresAtMs, int maxPublishedUnits) {
    public static final IdempotencyLimits CURRENT = new IdempotencyLimits(
            IdempotencyInput.MIN_CALLS, IdempotencyInput.MAX_CALLS,
            IdempotencyInput.MIN_STEPS, IdempotencyInput.MAX_STEPS,
            IdempotencyInput.MAX_UNITS, IdempotencyInput.MAX_RETENTION_MS,
            IdempotencyInput.MAX_TIME_MS, IdempotencyInput.MAX_ID_LENGTH,
            IdempotencyInput.MAX_DERIVED_ID_LENGTH, IdempotencyInput.MAX_EXPIRES_AT_MS,
            IdempotencyInput.MAX_PUBLISHED_UNITS);
}
