package com.hld.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class RateLimiterSimulatorTest {
    private final RateLimiterSimulator simulator = new RateLimiterSimulator();

    @Test
    void sharedFixedWindowEnforcesOneGlobalLimit() {
        RateLimiterResult result = simulator.run(input(
                RateLimitAlgorithm.FIXED_WINDOW, CounterScope.SHARED, 3, 5,
                true, BackendFailurePolicy.FAIL_CLOSED,
                List.of(0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L)));

        assertThat(result.metrics().allowed()).isEqualTo(5);
        assertThat(result.metrics().rejected()).isEqualTo(3);
        assertThat(result.metrics().maximumAggregateAllowance()).isEqualTo(5);
        assertThat(result.outcomes().get(5).retryAfterMs()).isEqualTo(1_000);
    }

    @Test
    void localCountersDemonstrateDistributedOvershoot() {
        RateLimiterResult result = simulator.run(input(
                RateLimitAlgorithm.FIXED_WINDOW, CounterScope.LOCAL_PER_NODE, 3, 5,
                true, BackendFailurePolicy.FAIL_CLOSED,
                List.of(0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L)));

        assertThat(result.metrics().allowed()).isEqualTo(12);
        assertThat(result.metrics().rejected()).isZero();
        assertThat(result.metrics().counters()).isEqualTo(3);
        assertThat(result.metrics().maximumAggregateAllowance()).isEqualTo(15);
    }

    @Test
    void tokenBucketRefillsWithVirtualTime() {
        RateLimiterResult result = simulator.run(input(
                RateLimitAlgorithm.TOKEN_BUCKET, CounterScope.SHARED, 1, 2,
                true, BackendFailurePolicy.FAIL_CLOSED, List.of(0L, 0L, 0L, 500L)));

        assertThat(result.outcomes()).extracting(RateLimitOutcome::decision)
                .containsExactly("ALLOWED", "ALLOWED", "REJECTED", "ALLOWED");
    }

    @Test
    void unavailableSharedBackendUsesTheDeclaredFailurePolicy() {
        RateLimiterResult open = simulator.run(input(
                RateLimitAlgorithm.FIXED_WINDOW, CounterScope.SHARED, 2, 1,
                false, BackendFailurePolicy.FAIL_OPEN, List.of(0L, 0L)));
        RateLimiterResult closed = simulator.run(input(
                RateLimitAlgorithm.FIXED_WINDOW, CounterScope.SHARED, 2, 1,
                false, BackendFailurePolicy.FAIL_CLOSED, List.of(0L, 0L)));

        assertThat(open.metrics().bypassed()).isEqualTo(2);
        assertThat(open.metrics().rejected()).isZero();
        assertThat(closed.metrics().rejected()).isEqualTo(2);
    }

    @Test
    void replayIsExactAndStateIsRequestLocal() {
        RateLimiterInput input = input(
                RateLimitAlgorithm.TOKEN_BUCKET, CounterScope.SHARED, 2, 4,
                true, BackendFailurePolicy.FAIL_CLOSED, List.of(0L, 0L, 500L));
        assertThat(simulator.run(input)).isEqualTo(simulator.run(input));
    }

    private RateLimiterInput input(
            RateLimitAlgorithm algorithm,
            CounterScope scope,
            int nodes,
            int limit,
            boolean backendAvailable,
            BackendFailurePolicy failurePolicy,
            List<Long> arrivals) {
        return new RateLimiterInput("1.0", "1.0.0", algorithm, scope, nodes, limit,
                1_000, 2, backendAvailable, failurePolicy, arrivals, 42);
    }
}
