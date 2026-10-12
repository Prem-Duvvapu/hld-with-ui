package com.hld.delivery;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.List;

/** An admitted event with post-event changes; narration never reconstructs domain state. */
public record DeliveryEvent(
        int sequence,
        long timeMs,
        Kind kind,
        String messageId,
        String attemptId,
        String consumerId,
        String message,
        Changes changes,
        LedgerEntry ledgerEntry) {
    public record Changes(
            List<DeliveryState.Message> messages,
            List<DeliveryState.Consumer> consumers,
            List<DeliveryState.Attempt> attempts) {
        public Changes {
            messages = List.copyOf(messages);
            consumers = List.copyOf(consumers);
            attempts = List.copyOf(attempts);
        }
    }

    public enum Kind {
        MESSAGE_ENQUEUED("message.enqueued"),
        DELIVERY_STARTED("delivery.started"),
        EFFECT_COMMITTED("effect.committed"),
        ACK_SENT("ack.sent"),
        ACK_ACCEPTED("ack.accepted"),
        ACK_LOST("ack.lost"),
        ACK_STALE("ack.stale"),
        LEASE_EXPIRED("lease.expired"),
        MESSAGE_REQUEUED("message.requeued"),
        MESSAGE_DEAD_LETTERED("message.dead-lettered"),
        CONSUMER_CRASHED("consumer.crashed"),
        CONSUMER_RECOVERED("consumer.recovered"),
        ATTEMPT_CANCELLED("attempt.cancelled");

        private final String value;

        Kind(String value) {
            this.value = value;
        }

        @JsonValue
        public String value() {
            return value;
        }
    }
}
