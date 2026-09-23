package com.hld.simulation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class RequestFlowSimulatorTest {
    private final RequestFlowSimulator simulator = new RequestFlowSimulator();

    @Test
    void baselineMatchesTheHandCalculatedFixture() {
        RequestFlowResult result = simulator.run(RequestFlowInput.current(
                RoutingPolicy.ROUND_ROBIN,
                List.of(0L, 0L, 0L, 0L, 0L, 0L),
                List.of(100L, 100L),
                1,
                10,
                7));

        assertThat(result.outcomes()).extracting(RequestOutcome::nodeId)
                .containsExactly("Node A", "Node B", "Node A", "Node B", "Node A", "Node B");
        assertThat(result.outcomes()).extracting(RequestOutcome::latencyMs)
                .containsExactly(100L, 100L, 200L, 200L, 300L, 300L);
        assertThat(result.metrics().meanLatencyMs()).isEqualTo(200.0);
        assertThat(result.metrics().p95LatencyMs()).isEqualTo(300L);
        assertThat(result.metrics().throughputPerSecond()).isEqualTo(20.0);
        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.truncationReason()).isNull();
        assertThat(result.lastVirtualTimeMs()).isEqualTo(300);
        assertThat(result.incompleteRequests()).isZero();
    }

    @Test
    void aFiniteQueueRejectsOnlyRequestsWithoutAWaitingSlot() {
        RequestFlowResult result = simulator.run(RequestFlowInput.current(
                RoutingPolicy.ROUND_ROBIN,
                List.of(0L, 0L, 0L, 0L, 0L, 0L),
                List.of(100L, 100L),
                1,
                1,
                7));

        assertThat(result.metrics().completed()).isEqualTo(4);
        assertThat(result.metrics().rejected()).isEqualTo(2);
        assertThat(result.outcomes()).extracting(RequestOutcome::status)
                .containsExactly("COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "REJECTED", "REJECTED");
    }

    @Test
    void leastOutstandingChangesTheSlowNodeFixtureForRequestFour() {
        List<Long> arrivals = List.of(0L, 0L, 150L, 200L);
        RequestFlowResult roundRobin = simulator.run(RequestFlowInput.current(
                RoutingPolicy.ROUND_ROBIN, arrivals, List.of(100L, 400L), 1, 10, 7));
        RequestFlowResult leastOutstanding = simulator.run(RequestFlowInput.current(
                RoutingPolicy.LEAST_OUTSTANDING, arrivals, List.of(100L, 400L), 1, 10, 7));

        assertThat(roundRobin.outcomes().get(3).latencyMs()).isEqualTo(600L);
        assertThat(leastOutstanding.outcomes().get(3).nodeId()).isEqualTo("Node A");
        assertThat(leastOutstanding.outcomes().get(3).latencyMs()).isEqualTo(150L);
    }

    @Test
    void eachRunOwnsItsState() {
        RequestFlowInput input = RequestFlowInput.current(
                RoutingPolicy.ROUND_ROBIN, List.of(0L, 0L), List.of(100L, 100L), 1, 1, 42);
        assertThat(simulator.run(input)).isEqualTo(simulator.run(input));
    }

    @Test
    void returnsAnExplicitLimitedResultWhenTheVirtualTimeBudgetIsReached() {
        RequestFlowSimulator bounded = new RequestFlowSimulator(new SimulationLimits(100, 8, 8, 100, 10_000, 150));

        RequestFlowResult result = bounded.run(RequestFlowInput.current(
                RoutingPolicy.ROUND_ROBIN, List.of(0L, 0L, 0L, 0L, 0L, 0L),
                List.of(100L, 100L), 1, 10, 7));

        assertThat(result.status()).isEqualTo("limited");
        assertThat(result.truncationReason()).isEqualTo("virtual_time_limit");
        assertThat(result.lastVirtualTimeMs()).isEqualTo(100);
        assertThat(result.incompleteRequests()).isEqualTo(4);
        assertThat(result.outcomes()).hasSize(2);
        assertThat(result.metrics().completed()).isEqualTo(2);
        assertThat(result.events()).allMatch(event -> event.timeMs() <= 150);
    }

    @Test
    void eventBudgetStopsTheTraceWithoutReportingUnseenOutcomes() {
        RequestFlowSimulator bounded = new RequestFlowSimulator(new SimulationLimits(100, 8, 8, 100, 3, 60_000));

        RequestFlowResult result = bounded.run(RequestFlowInput.current(
                RoutingPolicy.ROUND_ROBIN, List.of(0L, 0L), List.of(100L), 1, 10, 7));

        assertThat(result.status()).isEqualTo("limited");
        assertThat(result.truncationReason()).isEqualTo("event_limit");
        assertThat(result.events()).hasSize(3);
        assertThat(result.outcomes()).isEmpty();
        assertThat(result.incompleteRequests()).isEqualTo(2);
    }

    @Test
    void rejectsAnIncompatibleModelVersion() {
        RequestFlowInput input = new RequestFlowInput("1.0", "2.0.0", RoutingPolicy.ROUND_ROBIN,
                List.of(0L), List.of(100L), 1, 1, 42);

        assertThatThrownBy(() -> simulator.run(input))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("modelVersion must be 1.0.0");
    }
}
