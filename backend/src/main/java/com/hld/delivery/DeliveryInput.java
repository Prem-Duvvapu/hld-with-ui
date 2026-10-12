package com.hld.delivery;

import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Finite, illustrative broker delivery inputs; no network or vendor SDK is involved. */
public record DeliveryInput(
        @JsonProperty(required = true) @NotNull @Pattern(regexp = "1\\.0") String schemaVersion,
        @JsonProperty(required = true) @NotNull @Pattern(regexp = "1\\.0\\.0") String modelVersion,
        @JsonProperty(required = true) @NotNull @Size(min = 1, max = MAX_MESSAGES)
                List<@NotNull @Valid Message> messages,
        @JsonProperty(required = true) @NotNull @Size(min = 1, max = MAX_CONSUMERS)
                List<@NotNull @Valid Consumer> consumers,
        @JsonProperty(required = true) @Min(1) @Max(MAX_PROCESSING_TIME_MS) long processingTimeMs,
        @JsonProperty(required = true) @Min(1) @Max(MAX_ACKNOWLEDGMENT_DELAY_MS)
                long acknowledgmentDelayMs,
        @JsonProperty(required = true) @Min(1) @Max(MAX_VISIBILITY_TIMEOUT_MS)
                long visibilityTimeoutMs,
        @JsonProperty(required = true) @Min(1) @Max(MAX_DELIVERY_ATTEMPTS) int maxDeliveryAttempts,
        @JsonProperty(required = true) @NotNull AcknowledgmentPolicy acknowledgmentPolicy,
        @JsonProperty(required = true) @NotNull @Size(max = MAX_FAILURES)
                List<@NotNull @Valid Failure> failures,
        @JsonProperty(required = true) @NotNull @Size(max = MAX_LOST_ACKNOWLEDGMENTS)
                List<@NotNull @Valid LostAcknowledgment> lostAcknowledgments,
        @JsonProperty(required = true) @Min(-MAX_ABSOLUTE_SEED) @Max(MAX_ABSOLUTE_SEED) long seed) {
    public static final String SCHEMA_VERSION = "1.0";
    public static final String MODEL_VERSION = "1.0.0";
    public static final String ID_PATTERN = "^[a-z][a-z0-9-]{0,31}$";
    public static final int MAX_MESSAGES = 20;
    public static final int MAX_CONSUMERS = 3;
    public static final long MAX_PROCESSING_TIME_MS = 1_000;
    public static final long MAX_ACKNOWLEDGMENT_DELAY_MS = 1_000;
    public static final long MAX_VISIBILITY_TIMEOUT_MS = 60_000;
    public static final int MAX_DELIVERY_ATTEMPTS = 5;
    public static final int MAX_FAILURES = 8;
    public static final int MAX_LOST_ACKNOWLEDGMENTS = 20;
    public static final long MAX_TIME_MS = 60_000;
    public static final long MAX_ABSOLUTE_SEED = 9_007_199_254_740_991L;

    public DeliveryInput {
        // Preserve invalid nulls for direct validation while taking ownership of each list.
        messages = copyAllowingNull(messages);
        consumers = copyAllowingNull(consumers);
        failures = copyAllowingNull(failures);
        lostAcknowledgments = copyAllowingNull(lostAcknowledgments);
    }

    private static <T> List<T> copyAllowingNull(List<T> values) {
        return values == null ? null : Collections.unmodifiableList(new ArrayList<>(values));
    }

    public enum AcknowledgmentPolicy {
        ACK_BEFORE_EFFECT,
        ACK_AFTER_EFFECT
    }

    public enum FailureAction {
        CRASH,
        RECOVER
    }

    public record Message(
            @JsonProperty(required = true) @NotNull @Pattern(regexp = ID_PATTERN) String id,
            @JsonProperty(required = true) @Min(0) @Max(MAX_TIME_MS) long enqueueTimeMs) {}

    public record Consumer(
            @JsonProperty(required = true) @NotNull @Pattern(regexp = ID_PATTERN) String id) {}

    public record Failure(
            @JsonProperty(required = true) @NotNull @Pattern(regexp = ID_PATTERN) String consumerId,
            @JsonProperty(required = true) @NotNull FailureAction action,
            @JsonProperty(required = true) @Min(0) @Max(MAX_TIME_MS) long timeMs) {}

    public record LostAcknowledgment(
            @JsonProperty(required = true) @NotNull @Pattern(regexp = ID_PATTERN) String messageId,
            @JsonProperty(required = true) @Min(1) @Max(MAX_DELIVERY_ATTEMPTS) int attempt) {}
}
