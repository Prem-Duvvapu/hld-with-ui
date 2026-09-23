package com.hld.ratelimit;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class RateLimiterSimulator {
    private static final List<String> ASSUMPTIONS = List.of(
            "Every request belongs to one modeled identity and costs one token.",
            "Requests route round-robin across healthy application nodes.",
            "A shared counter applies decisions atomically with zero modeled network latency.",
            "Local counters do not coordinate, so their aggregate allowance can exceed the intended global limit.",
            "The result is an illustrative deterministic model, not a production throughput benchmark.");

    public RateLimiterResult run(RateLimiterInput input) {
        validate(input);
        List<IndexedArrival> arrivals = new ArrayList<>();
        for (int index = 0; index < input.arrivalTimesMs().size(); index++) {
            arrivals.add(new IndexedArrival(index, input.arrivalTimesMs().get(index)));
        }
        arrivals.sort(Comparator.comparingLong(IndexedArrival::timeMs).thenComparingInt(IndexedArrival::index));

        Map<String, CounterState> counters = new HashMap<>();
        List<RateLimitEvent> events = new ArrayList<>();
        List<RateLimitOutcome> outcomes = new ArrayList<>();
        int bypassed = 0;

        for (IndexedArrival arrival : arrivals) {
            String requestId = "Request " + (arrival.index() + 1);
            String nodeId = "Node " + (char) ('A' + arrival.index() % input.nodeCount());
            events.add(event(events, arrival.timeMs(), "request.arrived", requestId, nodeId,
                    requestId + " reached " + nodeId + "."));

            if (input.counterScope() == CounterScope.SHARED && !input.counterBackendAvailable()) {
                boolean allowed = input.backendFailurePolicy() == BackendFailurePolicy.FAIL_OPEN;
                String decision = allowed ? "BYPASSED" : "REJECTED";
                String reason = allowed ? "Shared counter unavailable; fail-open policy bypassed enforcement."
                        : "Shared counter unavailable; fail-closed policy rejected the request.";
                events.add(event(events, arrival.timeMs(), allowed ? "request.bypassed" : "request.rejected",
                        requestId, nodeId, reason));
                outcomes.add(new RateLimitOutcome(requestId, nodeId, arrival.timeMs(), decision, 0, null, reason));
                if (allowed) bypassed++;
                continue;
            }

            String counterId = input.counterScope() == CounterScope.SHARED ? "shared" : nodeId;
            CounterState state = counters.computeIfAbsent(counterId, ignored -> new CounterState(input.limit()));
            Decision decision = input.algorithm() == RateLimitAlgorithm.FIXED_WINDOW
                    ? fixedWindow(state, arrival.timeMs(), input)
                    : tokenBucket(state, arrival.timeMs(), input);
            String kind = decision.allowed() ? "request.allowed" : "request.rejected";
            String reason = explanation(input, counterId, decision);
            events.add(event(events, arrival.timeMs(), kind, requestId, nodeId, reason));
            outcomes.add(new RateLimitOutcome(requestId, nodeId, arrival.timeMs(),
                    decision.allowed() ? "ALLOWED" : "REJECTED", decision.remaining(),
                    decision.retryAfterMs(), reason));
        }

        int allowed = (int) outcomes.stream().filter(outcome -> "ALLOWED".equals(outcome.decision())).count();
        int rejected = (int) outcomes.stream().filter(outcome -> "REJECTED".equals(outcome.decision())).count();
        int counterCount = input.counterScope() == CounterScope.SHARED ? 1 : input.nodeCount();
        return new RateLimiterResult(
                "1.0", "distributed-rate-limiter", RateLimiterInput.MODEL_VERSION, input.seed(), "completed",
                ASSUMPTIONS, List.copyOf(events), List.copyOf(outcomes),
                new RateLimitMetrics(outcomes.size(), allowed, rejected, bypassed, input.limit(), counterCount,
                        Math.multiplyExact(input.limit(), counterCount)));
    }

    private Decision fixedWindow(CounterState state, long timeMs, RateLimiterInput input) {
        long windowStart = timeMs / input.windowMs() * input.windowMs();
        if (state.windowStartMs != windowStart) {
            state.windowStartMs = windowStart;
            state.used = 0;
        }
        if (state.used < input.limit()) {
            state.used++;
            return new Decision(true, input.limit() - state.used, null);
        }
        return new Decision(false, 0, windowStart + input.windowMs() - timeMs);
    }

    private Decision tokenBucket(CounterState state, long timeMs, RateLimiterInput input) {
        long elapsed = Math.max(0, timeMs - state.lastRefillMs);
        state.tokens = Math.min(input.limit(), state.tokens + elapsed * input.refillTokensPerSecond() / 1000.0);
        state.lastRefillMs = timeMs;
        if (state.tokens >= 1) {
            state.tokens -= 1;
            return new Decision(true, (int) Math.floor(state.tokens), null);
        }
        long retryAfter = (long) Math.ceil((1 - state.tokens) * 1000 / input.refillTokensPerSecond());
        return new Decision(false, 0, retryAfter);
    }

    private String explanation(RateLimiterInput input, String counterId, Decision decision) {
        String counter = "shared".equals(counterId) ? "the shared counter" : counterId + "'s local counter";
        if (decision.allowed()) {
            return counter + " allowed the request; " + decision.remaining() + " unit(s) remain.";
        }
        String retry = decision.retryAfterMs() == null ? "" : " Retry after " + decision.retryAfterMs() + " ms.";
        return counter + " had no allowance remaining." + retry;
    }

    private RateLimitEvent event(
            List<RateLimitEvent> events, long timeMs, String kind, String requestId, String nodeId, String message) {
        return new RateLimitEvent(events.size() + 1, timeMs, kind, requestId, nodeId, message);
    }

    private void validate(RateLimiterInput input) {
        if (!RateLimiterInput.SCHEMA_VERSION.equals(input.schemaVersion())) {
            throw new IllegalArgumentException("schemaVersion must be " + RateLimiterInput.SCHEMA_VERSION);
        }
        if (!RateLimiterInput.MODEL_VERSION.equals(input.modelVersion())) {
            throw new IllegalArgumentException("modelVersion must be " + RateLimiterInput.MODEL_VERSION);
        }
        if (input.algorithm() == null || input.counterScope() == null || input.backendFailurePolicy() == null) {
            throw new IllegalArgumentException("algorithm, counterScope, and backendFailurePolicy are required");
        }
        if (input.nodeCount() < 1 || input.nodeCount() > 20) {
            throw new IllegalArgumentException("nodeCount must be from 1 to 20");
        }
        if (input.limit() < 1 || input.limit() > 10_000) {
            throw new IllegalArgumentException("limit must be from 1 to 10000");
        }
        if (input.windowMs() < 100 || input.windowMs() > 60_000) {
            throw new IllegalArgumentException("windowMs must be from 100 to 60000");
        }
        if (input.refillTokensPerSecond() < 1 || input.refillTokensPerSecond() > 10_000) {
            throw new IllegalArgumentException("refillTokensPerSecond must be from 1 to 10000");
        }
        if (input.arrivalTimesMs() == null || input.arrivalTimesMs().isEmpty()
                || input.arrivalTimesMs().size() > 500
                || input.arrivalTimesMs().stream().anyMatch(time -> time == null || time < 0 || time > 300_000)) {
            throw new IllegalArgumentException("arrivalTimesMs must contain 1 to 500 values from 0 to 300000");
        }
    }

    private record IndexedArrival(int index, long timeMs) {}
    private record Decision(boolean allowed, int remaining, Long retryAfterMs) {}

    private static final class CounterState {
        private long windowStartMs = Long.MIN_VALUE;
        private int used;
        private double tokens;
        private long lastRefillMs;

        CounterState(int capacity) {
            this.tokens = capacity;
        }
    }
}
