package com.hld.simulation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.simulation.engine.FailureScheduleEntry;
import com.hld.simulation.engine.InFlightBehavior;
import com.hld.simulation.engine.SimulationBudget;
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
        assertThat(result.metrics().failed()).isZero();
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
        RequestFlowSimulator bounded = new RequestFlowSimulator(
                SimulationLimits.defaults(),
                new SimulationBudget(10_000, 150L, 2L * 1024 * 1024, 10_000L));

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
        RequestFlowSimulator bounded = new RequestFlowSimulator(
                SimulationLimits.defaults(),
                new SimulationBudget(3, 60_000L, 2L * 1024 * 1024, 10_000L));

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
                List.of(0L), List.of(100L), 1, 1, null, 42);


        assertThatThrownBy(() -> simulator.run(input))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("modelVersion must be");
    }

    @Test
    void enforcesConfiguredInputLimitsForDirectModelCalls() {
        RequestFlowSimulator bounded = new RequestFlowSimulator(
                new SimulationLimits(10, 2, 2, 5, 1_000, 500, 100, 2_000));
        RequestFlowInput input = RequestFlowInput.current(
                RoutingPolicy.ROUND_ROBIN, List.of(0L), List.of(100L), 3, 1, 42);

        assertThatThrownBy(() -> bounded.run(input))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("workersPerNode must be from 1 to 2");
    }

    // --- Failure schedule tests ---

    @Test
    void nodeFailureDropsInFlightWork() {
        RequestFlowResult result = simulator.run(RequestFlowInput.withFailures(
                RoutingPolicy.ROUND_ROBIN,
                List.of(0L, 0L, 0L, 0L),
                List.of(100L, 100L),
                1, 10,
                List.of(new FailureScheduleEntry("Node B", 50L, 250L, InFlightBehavior.FAIL)),
                7));

        // Request 2 goes to Node B at time 0, service 100ms, but Node B fails at 50ms
        RequestOutcome req2 = result.outcomes().stream()
                .filter(o -> "Request 2".equals(o.requestId()))
                .findFirst().orElseThrow();
        assertThat(req2.status()).isEqualTo("FAILED");
        assertThat(req2.nodeId()).isEqualTo("Node B");
        assertThat(result.metrics().failed()).isGreaterThan(0);

        // Request 1 on Node A should complete normally
        RequestOutcome req1 = result.outcomes().stream()
                .filter(o -> "Request 1".equals(o.requestId()))
                .findFirst().orElseThrow();
        assertThat(req1.status()).isEqualTo("COMPLETED");
    }

    @Test
    void nodeRecoveryRestoresWorkers() {
        // Node B fails at 50ms, recovers at 150ms. Requests arriving after 150ms
        // should be able to route to Node B again.
        RequestFlowResult result = simulator.run(RequestFlowInput.withFailures(
                RoutingPolicy.ROUND_ROBIN,
                List.of(0L, 0L, 200L, 200L),
                List.of(100L, 100L),
                1, 10,
                List.of(new FailureScheduleEntry("Node B", 50L, 150L, InFlightBehavior.FAIL)),
                7));

        // Requests 3 and 4 arrive at 200ms, after recovery
        List<RequestOutcome> laterOutcomes = result.outcomes().stream()
                .filter(o -> o.arrivalMs() == 200L)
                .toList();
        // At least one should go to Node B since it recovered
        assertThat(laterOutcomes).anyMatch(o -> "Node B".equals(o.nodeId()) && "COMPLETED".equals(o.status()));
    }

    @Test
    void allNodesFailedRejectsRequests() {
        RequestFlowResult result = simulator.run(RequestFlowInput.withFailures(
                RoutingPolicy.ROUND_ROBIN,
                List.of(100L, 100L),
                List.of(100L, 100L),
                1, 10,
                List.of(
                        new FailureScheduleEntry("Node A", 50L, null, InFlightBehavior.FAIL),
                        new FailureScheduleEntry("Node B", 50L, null, InFlightBehavior.FAIL)),
                7));

        // All requests at 100ms should be rejected since both nodes are down
        assertThat(result.outcomes()).allMatch(o -> "REJECTED".equals(o.status()));
    }

    @Test
    void failureScheduleRejectsOverlappingWindows() {
        assertThatThrownBy(() -> simulator.run(RequestFlowInput.withFailures(
                RoutingPolicy.ROUND_ROBIN,
                List.of(0L),
                List.of(100L),
                1, 10,
                List.of(
                        new FailureScheduleEntry("Node A", 10L, 50L, InFlightBehavior.FAIL),
                        new FailureScheduleEntry("Node A", 30L, 80L, InFlightBehavior.FAIL)),
                7)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Overlapping");
    }

    @Test
    void failureScheduleRejectsUnknownEntity() {
        assertThatThrownBy(() -> simulator.run(RequestFlowInput.withFailures(
                RoutingPolicy.ROUND_ROBIN,
                List.of(0L),
                List.of(100L),
                1, 10,
                List.of(new FailureScheduleEntry("Node Z", 10L, 50L, InFlightBehavior.FAIL)),
                7)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown entity");
    }

    @Test
    void modelVersion1_0RejectsFailureSchedule() {
        RequestFlowInput input = new RequestFlowInput("1.0", "1.0.0", RoutingPolicy.ROUND_ROBIN,
                List.of(0L), List.of(100L), 1, 1,
                List.of(new FailureScheduleEntry("Node A", 10L, 50L, InFlightBehavior.FAIL)),
                42);

        assertThatThrownBy(() -> simulator.run(input))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("not supported in model version 1.0.0");
    }

    @Test
    void noFailureScheduleMatchesOriginalBehavior() {
        // Running without a failure schedule should produce the same results as before
        RequestFlowResult withNull = simulator.run(RequestFlowInput.current(
                RoutingPolicy.ROUND_ROBIN,
                List.of(0L, 0L, 0L, 0L, 0L, 0L),
                List.of(100L, 100L),
                1, 10, 7));

        assertThat(withNull.outcomes()).extracting(RequestOutcome::nodeId)
                .containsExactly("Node A", "Node B", "Node A", "Node B", "Node A", "Node B");
        assertThat(withNull.outcomes()).extracting(RequestOutcome::latencyMs)
                .containsExactly(100L, 100L, 200L, 200L, 300L, 300L);
        assertThat(withNull.metrics().failed()).isZero();
        assertThat(withNull.status()).isEqualTo("completed");
    }

    @Test
    void pauseBehaviorIsRejected() {
        assertThatThrownBy(() -> simulator.run(RequestFlowInput.withFailures(
                RoutingPolicy.ROUND_ROBIN,
                List.of(0L),
                List.of(100L),
                1, 10,
                List.of(new FailureScheduleEntry("Node A", 10L, 50L, InFlightBehavior.PAUSE)),
                7)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("PAUSE");
    }

    // --- Byte budget tests ---

    @Test
    void traceSizeBudgetTruncatesTheResult() {
        // Use a tiny byte budget that can't fit all events
        RequestFlowSimulator bounded = new RequestFlowSimulator(
                SimulationLimits.defaults(),
                new SimulationBudget(10_000, 60_000L, 500L, 10_000L));

        RequestFlowResult result = bounded.run(RequestFlowInput.current(
                RoutingPolicy.ROUND_ROBIN,
                List.of(0L, 0L, 0L, 0L, 0L, 0L),
                List.of(100L, 100L),
                1, 10, 7));

        assertThat(result.status()).isEqualTo("limited");
        assertThat(result.truncationReason()).isEqualTo("trace_size_limit");
        assertThat(result.events().size()).isLessThan(18); // full trace would have ~18 events
    }

    @Test
    void modelVersion1_0AcceptedWithoutFailureSchedule() {
        RequestFlowInput input = new RequestFlowInput("1.0", "1.0.0", RoutingPolicy.ROUND_ROBIN,
                List.of(0L, 0L), List.of(100L, 100L), 1, 10, null, 42);

        RequestFlowResult result = simulator.run(input);
        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.modelVersion()).isEqualTo("1.0.0");
    }
}
