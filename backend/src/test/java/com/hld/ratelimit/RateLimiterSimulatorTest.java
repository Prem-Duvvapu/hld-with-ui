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


    @Test
    void alignedWindowBoundaryPermitsTwoSeparateAllowances() {
        RateLimiterResult result = simulator.run(input(
                RateLimitAlgorithm.FIXED_WINDOW, CounterScope.SHARED, 3, 5,
                true, BackendFailurePolicy.FAIL_CLOSED,
                List.of(999L, 999L, 999L, 999L, 999L, 1_000L, 1_000L, 1_000L, 1_000L, 1_000L)));

        assertThat(result.metrics().allowed()).isEqualTo(10);
        assertThat(result.metrics().rejected()).isZero();
        assertThat(result.metrics().maximumAggregateAllowance()).isEqualTo(5);
        assertThat(result.outcomes().get(5).remaining()).isEqualTo(4);
    }

    @Test
    void fractionalTokensAndSlowerRefillChangeRetryDelay() {
        RateLimiterInput fastInput = input(
                RateLimitAlgorithm.TOKEN_BUCKET, CounterScope.SHARED, 3, 2,
                true, BackendFailurePolicy.FAIL_CLOSED, List.of(0L, 0L, 0L, 250L, 500L));
        RateLimiterResult fast = simulator.run(fastInput);
        assertThat(fast.outcomes()).extracting(RateLimitOutcome::decision)
                .containsExactly("ALLOWED", "ALLOWED", "REJECTED", "REJECTED", "ALLOWED");
        assertThat(fast.outcomes().get(2).retryAfterMs()).isEqualTo(500);
        assertThat(fast.outcomes().get(3).retryAfterMs()).isEqualTo(250);
        assertThat(fast.metrics().allowed()).isEqualTo(3);
        assertThat(fast.metrics().maximumAggregateAllowance()).isEqualTo(2);

        RateLimiterInput slowInput = new RateLimiterInput(
                "1.0", "1.0.0", RateLimitAlgorithm.TOKEN_BUCKET, CounterScope.SHARED,
                3, 2, 1_000, 1, true, BackendFailurePolicy.FAIL_CLOSED,
                List.of(0L, 0L, 0L, 500L), 42);
        RateLimiterResult slow = simulator.run(slowInput);
        assertThat(slow.outcomes()).extracting(RateLimitOutcome::decision)
                .containsExactly("ALLOWED", "ALLOWED", "REJECTED", "REJECTED");
        assertThat(slow.outcomes().get(2).retryAfterMs()).isEqualTo(1_000);
        assertThat(slow.outcomes().get(3).retryAfterMs()).isEqualTo(500);
    }

    @Test
    void outageBypassesAreDistinctFromAllowancesAndLocalStateIgnoresSharedOutage() {
        List<Long> arrivals = List.of(0L, 0L, 0L, 0L, 0L, 0L);
        RateLimiterResult open = simulator.run(input(
                RateLimitAlgorithm.TOKEN_BUCKET, CounterScope.SHARED, 3, 5,
                false, BackendFailurePolicy.FAIL_OPEN, arrivals));
        RateLimiterResult closed = simulator.run(input(
                RateLimitAlgorithm.TOKEN_BUCKET, CounterScope.SHARED, 3, 5,
                false, BackendFailurePolicy.FAIL_CLOSED, arrivals));
        RateLimiterResult local = simulator.run(input(
                RateLimitAlgorithm.TOKEN_BUCKET, CounterScope.LOCAL_PER_NODE, 3, 5,
                false, BackendFailurePolicy.FAIL_CLOSED, arrivals));

        assertThat(open.metrics().allowed()).isZero();
        assertThat(open.metrics().bypassed()).isEqualTo(6);
        assertThat(open.metrics().maximumAggregateAllowance()).isEqualTo(5);
        assertThat(open.outcomes()).allSatisfy(outcome -> assertThat(outcome.retryAfterMs()).isNull());
        assertThat(closed.metrics().rejected()).isEqualTo(6);
        assertThat(closed.outcomes()).allSatisfy(outcome -> assertThat(outcome.retryAfterMs()).isNull());
        assertThat(local.metrics().allowed()).isEqualTo(6);
        assertThat(local.metrics().bypassed()).isZero();
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
