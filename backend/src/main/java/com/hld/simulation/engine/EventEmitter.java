package com.hld.simulation.engine;

import com.hld.simulation.SimulationEvent;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Collects simulation events while enforcing event-count and trace-byte
 * budgets. The byte estimate uses a conservative approximation of the
 * JSON-serialized size of each event to avoid full serialization on
 * every emission.
 * <p>
 * Once a budget is reached the emitter records the truncation reason
 * and silently stops accepting events. The caller must check
 * {@link #truncationReason()} after the run completes.
 */
public final class EventEmitter {
    /** Overhead per event: braces, commas, field names, quotes. */
    private static final int PER_EVENT_OVERHEAD = 120;

    private final int maxEvents;
    private final long maxTraceBytes;
    private final List<SimulationEvent> events = new ArrayList<>();
    private long estimatedBytes;
    private String truncationReason;

    public EventEmitter(int maxEvents, long maxTraceBytes) {
        this.maxEvents = maxEvents;
        this.maxTraceBytes = maxTraceBytes;
    }

    /**
     * Attempts to emit an event. Returns {@code true} if the event was
     * accepted, {@code false} if a budget was already exceeded or this
     * event caused one to be reached.
     */
    public boolean emit(SimulationEvent event) {
        if (truncationReason != null) return false;

        if (events.size() >= maxEvents) {
            truncationReason = "event_limit";
            return false;
        }

        long eventBytes = estimateBytes(event);
        if (estimatedBytes + eventBytes > maxTraceBytes) {
            truncationReason = "trace_size_limit";
            return false;
        }

        events.add(event);
        estimatedBytes += eventBytes;
        return true;
    }

    /** Returns an unmodifiable view of all accepted events. */
    public List<SimulationEvent> events() {
        return Collections.unmodifiableList(events);
    }

    /** Returns the current number of accepted events. */
    public int size() {
        return events.size();
    }

    /** Returns the estimated serialized byte size of all accepted events. */
    public long estimatedBytes() {
        return estimatedBytes;
    }

    /**
     * Returns the truncation reason if a budget was reached, or
     * {@code null} if the emitter can still accept events.
     */
    public String truncationReason() {
        return truncationReason;
    }

    /** Returns {@code true} if a budget has been reached. */
    public boolean isExhausted() {
        return truncationReason != null;
    }

    private static long estimateBytes(SimulationEvent event) {
        long size = PER_EVENT_OVERHEAD;
        size += stringLength(event.requestId());
        size += stringLength(event.nodeId());
        size += stringLength(event.kind());
        size += stringLength(event.message());
        // sequence and timeMs are numbers; typically < 20 digits total
        size += 20;
        return size;
    }

    private static int stringLength(String value) {
        return value == null ? 4 : value.length() + 2; // 2 for quotes
    }
}
