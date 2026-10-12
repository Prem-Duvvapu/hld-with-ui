package com.hld.delivery;

import com.hld.delivery.DeliveryInput.AcknowledgmentPolicy;
import com.hld.delivery.DeliveryInput.Failure;
import com.hld.delivery.DeliveryInput.FailureAction;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** Direct domain validation, including references and chronological consumer failure rules. */
public final class DeliveryValidator {
    private static final Pattern ID = Pattern.compile(DeliveryInput.ID_PATTERN);

    private DeliveryValidator() {}

    public static void validate(DeliveryInput input) {
        require(input != null, "input is required");
        require(
                DeliveryInput.SCHEMA_VERSION.equals(input.schemaVersion()),
                "schemaVersion must be 1.0");
        require(
                DeliveryInput.MODEL_VERSION.equals(input.modelVersion()),
                "modelVersion must be 1.0.0");
        range(
                input.seed(),
                -DeliveryInput.MAX_ABSOLUTE_SEED,
                DeliveryInput.MAX_ABSOLUTE_SEED,
                "seed");
        range(
                input.processingTimeMs(),
                1,
                DeliveryInput.MAX_PROCESSING_TIME_MS,
                "processingTimeMs");
        range(
                input.acknowledgmentDelayMs(),
                1,
                DeliveryInput.MAX_ACKNOWLEDGMENT_DELAY_MS,
                "acknowledgmentDelayMs");
        range(
                input.visibilityTimeoutMs(),
                1,
                DeliveryInput.MAX_VISIBILITY_TIMEOUT_MS,
                "visibilityTimeoutMs");
        range(
                input.maxDeliveryAttempts(),
                1,
                DeliveryInput.MAX_DELIVERY_ATTEMPTS,
                "maxDeliveryAttempts");
        require(input.acknowledgmentPolicy() != null, "acknowledgmentPolicy is required");
        if (input.acknowledgmentPolicy() == AcknowledgmentPolicy.ACK_BEFORE_EFFECT) {
            require(
                    input.acknowledgmentDelayMs() < input.processingTimeMs(),
                    "ACK_BEFORE_EFFECT requires acknowledgmentDelayMs < processingTimeMs");
        }
        size(input.messages(), 1, DeliveryInput.MAX_MESSAGES, "messages");
        size(input.consumers(), 1, DeliveryInput.MAX_CONSUMERS, "consumers");
        size(input.failures(), 0, DeliveryInput.MAX_FAILURES, "failures");
        size(
                input.lostAcknowledgments(),
                0,
                DeliveryInput.MAX_LOST_ACKNOWLEDGMENTS,
                "lostAcknowledgments");

        Set<String> messageIds = new HashSet<>();
        for (var message : input.messages()) {
            require(message != null, "messages must not contain null");
            identity(message.id(), "message ID");
            require(messageIds.add(message.id()), "message IDs must be unique");
            range(message.enqueueTimeMs(), 0, DeliveryInput.MAX_TIME_MS, "enqueueTimeMs");
        }
        Set<String> consumerIds = new HashSet<>();
        for (var consumer : input.consumers()) {
            require(consumer != null, "consumers must not contain null");
            identity(consumer.id(), "consumer ID");
            require(consumerIds.add(consumer.id()), "consumer IDs must be unique");
        }

        Map<String, List<Failure>> failuresByConsumer = new HashMap<>();
        for (Failure failure : input.failures()) {
            require(failure != null, "failures must not contain null");
            identity(failure.consumerId(), "failure consumer ID");
            require(consumerIds.contains(failure.consumerId()), "failure consumer must exist");
            require(failure.action() != null, "failure action is required");
            range(failure.timeMs(), 0, DeliveryInput.MAX_TIME_MS, "failure timeMs");
            failuresByConsumer
                    .computeIfAbsent(failure.consumerId(), ignored -> new ArrayList<>())
                    .add(failure);
        }
        // Input order controls scheduling ties; sorting this separate validation copy must not
        // change it.
        for (List<Failure> failures : failuresByConsumer.values()) {
            failures.sort(Comparator.comparingLong(Failure::timeMs));
            FailureAction expected = FailureAction.CRASH;
            long previousTime = -1;
            for (Failure failure : failures) {
                require(
                        failure.timeMs() != previousTime,
                        "one consumer cannot have two failure actions at the same time");
                require(
                        failure.action() == expected,
                        "consumer failures must alternate CRASH and RECOVER chronologically");
                previousTime = failure.timeMs();
                expected =
                        expected == FailureAction.CRASH
                                ? FailureAction.RECOVER
                                : FailureAction.CRASH;
            }
        }

        Set<DeliveryInput.LostAcknowledgment> selectors = new HashSet<>();
        for (var lost : input.lostAcknowledgments()) {
            require(lost != null, "lostAcknowledgments must not contain null");
            identity(lost.messageId(), "lost acknowledgment message ID");
            require(
                    messageIds.contains(lost.messageId()),
                    "lost acknowledgment message must exist");
            range(lost.attempt(), 1, input.maxDeliveryAttempts(), "lost acknowledgment attempt");
            require(selectors.add(lost), "lost acknowledgment selectors must be unique");
        }
    }

    private static void identity(String id, String label) {
        require(
                id != null && ID.matcher(id).matches(),
                label + " must match " + DeliveryInput.ID_PATTERN);
    }

    private static void size(List<?> list, int min, int max, String label) {
        require(list != null, label + " is required");
        require(
                list.size() >= min && list.size() <= max,
                label + " must contain " + min + "–" + max + " entries");
    }

    private static void range(long value, long min, long max, String label) {
        require(value >= min && value <= max, label + " must be within " + min + "–" + max);
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalArgumentException(message);
    }
}
