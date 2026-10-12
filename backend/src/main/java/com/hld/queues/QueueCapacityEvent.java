package com.hld.queues;

import com.fasterxml.jackson.annotation.JsonValue;

/** An admitted transition and its complete post-transition queue/worker state. */
public record QueueCapacityEvent(int sequence, long timeMs, Kind kind, String jobId,
                                 String workerId, String message, QueueCapacityState state) {
    public enum Kind {
        QUEUED("job.queued"), STARTED("job.started"),
        COMPLETED("job.completed"), REJECTED("job.rejected");

        private final String value;

        Kind(String value) { this.value = value; }

        @JsonValue public String value() { return value; }
    }
}
