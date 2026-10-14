package com.hld.transactions;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.transactions.ReservationInput.Action;
import com.hld.transactions.ReservationInput.Reservation;
import com.hld.transactions.ReservationInput.Step;
import com.hld.transactions.ReservationInput.Strategy;
import com.hld.transactions.ReservationResult.CheckSource;
import com.hld.transactions.ReservationResult.InvariantStatus;
import com.hld.transactions.ReservationResult.Invariants;
import com.hld.transactions.ReservationResult.Kind;
import com.hld.transactions.ReservationResult.RejectionReason;
import com.hld.transactions.ReservationResult.State;
import com.hld.transactions.ReservationResult.Status;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;

class ReservationInterleavingsTest {
    private final ReservationAnalyzer analyzer = new ReservationAnalyzer();

    record Ordering(List<String> steps, List<String> staleAccepted, String protectedWinner, String violationStep) {}

    static Stream<Arguments> allLegalOrdersAndStrategies() {
        // The six linear extensions of READ a < ATTEMPT a and READ b < ATTEMPT b.
        // Expected outcomes are authored independently, not computed by a second engine.
        List<Ordering> orders = List.of(
                new Ordering(List.of("read-a", "attempt-a", "read-b", "attempt-b"), List.of("a"), "a", null),
                new Ordering(List.of("read-a", "read-b", "attempt-a", "attempt-b"), List.of("a", "b"), "a", "attempt-b"),
                new Ordering(List.of("read-a", "read-b", "attempt-b", "attempt-a"), List.of("b", "a"), "b", "attempt-a"),
                new Ordering(List.of("read-b", "attempt-b", "read-a", "attempt-a"), List.of("b"), "b", null),
                new Ordering(List.of("read-b", "read-a", "attempt-a", "attempt-b"), List.of("a", "b"), "a", "attempt-b"),
                new Ordering(List.of("read-b", "read-a", "attempt-b", "attempt-a"), List.of("b", "a"), "b", "attempt-a"));
        return orders.stream().flatMap(order -> Stream.of(Strategy.values())
                .map(strategy -> Arguments.of(strategy, order)));
    }

    private static Step step(String id) {
        return switch (id) {
            case "read-a" -> new Step(id, "a", Action.READ);
            case "read-b" -> new Step(id, "b", Action.READ);
            case "attempt-a" -> new Step(id, "a", Action.ATTEMPT_RESERVE);
            case "attempt-b" -> new Step(id, "b", Action.ATTEMPT_RESERVE);
            default -> throw new IllegalArgumentException("Unsupported test step " + id);
        };
    }

    private static ReservationInput input(Strategy strategy, int units, int aQuantity, int bQuantity, List<String> ids) {
        return new ReservationInput("1.0", "1.0.0", strategy, units,
                List.of(new Reservation("a", aQuantity), new Reservation("b", bQuantity)),
                ids.stream().map(ReservationInterleavingsTest::step).toList());
    }

    private static List<String> sharedReads() {
        return List.of("read-a", "read-b", "attempt-a", "attempt-b");
    }

    @ParameterizedTest(name = "{0}: {1}")
    @MethodSource("allLegalOrdersAndStrategies")
    void everyLegalTwoActorInterleavingHasItsExactBusinessOutcome(Strategy strategy, Ordering order) {
        var request = input(strategy, 1, 1, 1, order.steps());
        var result = analyzer.run(request);
        boolean protectedPolicy = strategy == Strategy.ATOMIC_CONDITIONAL_RESERVATION;
        List<String> accepted = protectedPolicy ? List.of(order.protectedWinner()) : order.staleAccepted();
        assertThat(result.finalState().allocations()).extracting(ReservationResult.Allocation::reservationId)
                .containsExactlyElementsOf(accepted);
        assertThat(result.finalState().remainingUnits()).isZero();
        assertThat(result.finalState().allocatedUnits()).isEqualTo(accepted.size());
        assertThat(result.metrics().acceptedReservations()).isEqualTo(accepted.size());
        assertThat(result.metrics().rejectedReservations()).isEqualTo(2 - accepted.size());
        assertThat(result.finalState().reservations()).extracting(ReservationResult.ReservationState::id)
                .containsExactly("a", "b");
        assertThat(result.finalState()).isEqualTo(result.outcomes().get(3).postState());
        assertThat(result.input()).isEqualTo(request);
        assertThat(result.outcomes()).extracting(ReservationResult.Outcome::stepId)
                .containsExactlyElementsOf(order.steps());
        assertThat(result.outcomes()).extracting(ReservationResult.Outcome::sequence).containsExactly(1, 2, 3, 4);

        State previous = result.initialState();
        for (var outcome : result.outcomes()) {
            if (outcome.action() == Action.READ) {
                assertThat(outcome.observedRemaining()).isEqualTo(previous.remainingUnits());
                assertThat(outcome.postState().remainingUnits()).isEqualTo(previous.remainingUnits());
                assertThat(outcome.postState().allocatedUnits()).isEqualTo(previous.allocatedUnits());
                assertThat(outcome.postState().allocations()).isEqualTo(previous.allocations());
            }
            previous = outcome.postState();
        }
        if (protectedPolicy || order.violationStep() == null) {
            assertThat(result.metrics().invariantStatus()).isEqualTo(InvariantStatus.PRESERVED);
            assertThat(result.metrics().firstViolationStepId()).isNull();
            assertThat(result.outcomes()).allSatisfy(outcome ->
                    assertThat(outcome.postState().invariants()).isEqualTo(new Invariants(true, true, true, 1)));
        } else {
            assertThat(result.metrics().invariantStatus()).isEqualTo(InvariantStatus.VIOLATED);
            assertThat(result.metrics().firstViolationStepId()).isEqualTo(order.violationStep());
            assertThat(result.finalState().invariants()).isEqualTo(new Invariants(true, false, false, 2));
            assertThat(result.outcomes().subList(0, 3)).allSatisfy(outcome ->
                    assertThat(outcome.postState().invariants()).isEqualTo(new Invariants(true, true, true, 1)));
        }
    }

    @Test
    void capacityCanHoldWhileAStaleAssignmentBreaksConservation() {
        var stale = analyzer.run(input(Strategy.STALE_READ_WRITE, 2, 1, 1, sharedReads()));
        assertThat(stale.finalState().remainingUnits()).isEqualTo(1);
        assertThat(stale.finalState().allocatedUnits()).isEqualTo(2);
        assertThat(stale.finalState().invariants()).isEqualTo(new Invariants(true, true, false, 3));
        assertThat(stale.metrics().firstViolationStepId()).isEqualTo("attempt-b");
        assertThat(stale.metrics().acceptedReservations()).isEqualTo(2);

        var conditional = analyzer.run(input(Strategy.ATOMIC_CONDITIONAL_RESERVATION, 2, 1, 1, sharedReads()));
        assertThat(conditional.finalState().remainingUnits()).isZero();
        assertThat(conditional.finalState().allocatedUnits()).isEqualTo(2);
        assertThat(conditional.finalState().invariants()).isEqualTo(new Invariants(true, true, true, 2));
        assertThat(conditional.metrics().invariantStatus()).isEqualTo(InvariantStatus.PRESERVED);
    }

    @Test
    void staleUnequalAssignmentCanRestoreStockWhileAcceptingAnotherAllocation() {
        var result = analyzer.run(input(Strategy.STALE_READ_WRITE, 2, 2, 1, sharedReads()));
        assertThat(result.outcomes().get(2).postState().remainingUnits()).isZero();
        assertThat(result.outcomes().get(2).postState().allocatedUnits()).isEqualTo(2);
        var b = result.outcomes().get(3);
        assertThat(b.kind()).isEqualTo(Kind.RESERVATION_ACCEPTED);
        assertThat(b.checkedRemaining()).isEqualTo(2);
        assertThat(b.checkSource()).isEqualTo(CheckSource.SNAPSHOT);
        assertThat(b.postState().remainingUnits()).isEqualTo(1);
        assertThat(b.postState().allocatedUnits()).isEqualTo(3);
        assertThat(b.postState().invariants()).isEqualTo(new Invariants(true, false, false, 4));
        assertThat(result.metrics().acceptedReservations()).isEqualTo(2);
        assertThat(result.metrics().finalAllocatedUnits()).isEqualTo(3);
        assertThat(result.metrics().firstViolationStepId()).isEqualTo("attempt-b");
        assertThat(b.postState().reservations()).allSatisfy(actor -> {
            assertThat(actor.status()).isEqualTo(Status.ACCEPTED);
            assertThat(actor.observedRemaining()).isEqualTo(2);
        });
    }

    @Test
    void aCurrentStateRejectionChangesActorStatusButNoStockOrAllocations() {
        var result = analyzer.run(input(Strategy.ATOMIC_CONDITIONAL_RESERVATION, 2, 2, 1, sharedReads()));
        var before = result.outcomes().get(2).postState();
        var rejected = result.outcomes().get(3);
        assertThat(rejected.kind()).isEqualTo(Kind.RESERVATION_REJECTED);
        assertThat(rejected.checkSource()).isEqualTo(CheckSource.CURRENT);
        assertThat(rejected.checkedRemaining()).isZero();
        assertThat(rejected.quantity()).isEqualTo(1);
        assertThat(rejected.rejectionReason()).isEqualTo(RejectionReason.INSUFFICIENT_STOCK);
        assertThat(rejected.postState().remainingUnits()).isEqualTo(before.remainingUnits());
        assertThat(rejected.postState().allocatedUnits()).isEqualTo(before.allocatedUnits());
        assertThat(rejected.postState().allocations()).isEqualTo(before.allocations());
        assertThat(before.reservations().get(1).status()).isEqualTo(Status.READ_OBSERVED);
        assertThat(rejected.postState().reservations().get(1).status()).isEqualTo(Status.REJECTED);
        assertThat(rejected.postState().reservations().get(1).observedRemaining()).isEqualTo(2);
        assertThat(rejected.postState().invariants()).isEqualTo(new Invariants(true, true, true, 2));
    }

    @Test
    void reversingUnequalAttemptsChangesWhoWinsWithoutInventingFairness() {
        var request = input(Strategy.ATOMIC_CONDITIONAL_RESERVATION, 2, 2, 1,
                List.of("read-a", "read-b", "attempt-b", "attempt-a"));
        var result = analyzer.run(request);
        assertThat(result.finalState().allocations()).containsExactly(new ReservationResult.Allocation("b", 1, "attempt-b"));
        assertThat(result.finalState().remainingUnits()).isEqualTo(1);
        assertThat(result.finalState().allocatedUnits()).isEqualTo(1);
        assertThat(result.outcomes().get(3).checkedRemaining()).isEqualTo(1);
        assertThat(result.outcomes().get(3).quantity()).isEqualTo(2);
        assertThat(result.finalState().reservations().get(0).status()).isEqualTo(Status.REJECTED);
        assertThat(result.finalState().reservations().get(1).status()).isEqualTo(Status.ACCEPTED);
        assertThat(result.metrics().acceptedReservations()).isEqualTo(1);
        assertThat(result.metrics().invariantStatus()).isEqualTo(InvariantStatus.PRESERVED);
    }

    @ParameterizedTest
    @EnumSource(Strategy.class)
    void zeroStockProducesTwoValidBusinessRejectionsRatherThanAnExecutionFailure(Strategy strategy) {
        var result = analyzer.run(input(strategy, 0, 1, 1, sharedReads()));
        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.finalState().allocations()).isEmpty();
        assertThat(result.finalState().remainingUnits()).isZero();
        assertThat(result.finalState().allocatedUnits()).isZero();
        assertThat(result.finalState().invariants()).isEqualTo(new Invariants(true, true, true, 0));
        assertThat(result.metrics().acceptedReservations()).isZero();
        assertThat(result.metrics().rejectedReservations()).isEqualTo(2);
        assertThat(result.finalState().reservations()).allSatisfy(actor -> {
            assertThat(actor.status()).isEqualTo(Status.REJECTED);
            assertThat(actor.observedRemaining()).isZero();
        });
    }

    @ParameterizedTest
    @EnumSource(Strategy.class)
    void exactQuantityIsSufficientAndLargerQuantityIsRejected(Strategy strategy) {
        var result = analyzer.run(input(strategy, 1, 2, 1, sharedReads()));
        assertThat(result.outcomes().get(2).kind()).isEqualTo(Kind.RESERVATION_REJECTED);
        assertThat(result.outcomes().get(3).kind()).isEqualTo(Kind.RESERVATION_ACCEPTED);
        assertThat(result.finalState().allocations()).containsExactly(new ReservationResult.Allocation("b", 1, "attempt-b"));
        assertThat(result.finalState().remainingUnits()).isZero();
        assertThat(result.finalState().invariants()).isEqualTo(new Invariants(true, true, true, 1));
    }
}
