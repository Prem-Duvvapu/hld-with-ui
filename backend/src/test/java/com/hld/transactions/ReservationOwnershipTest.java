package com.hld.transactions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.transactions.ReservationInput.Action;
import com.hld.transactions.ReservationInput.Reservation;
import com.hld.transactions.ReservationInput.Step;
import com.hld.transactions.ReservationInput.Strategy;
import com.hld.transactions.ReservationResult.InvariantStatus;
import com.hld.transactions.ReservationResult.Invariants;
import com.hld.transactions.ReservationResult.State;
import com.hld.transactions.ReservationResult.Status;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class ReservationOwnershipTest {
    private final ReservationAnalyzer analyzer = new ReservationAnalyzer();

    @Test
    void modifyingCallerListsAfterConstructionCannotChangeCapturedInputOrExecution() {
        var baseline = ReservationPresets.baseline();
        var actors = new ArrayList<>(baseline.reservations());
        var steps = new ArrayList<>(baseline.schedule());
        var input = new ReservationInput("1.0", "1.0.0", baseline.strategy(), baseline.initialUnits(), actors, steps);
        actors.set(0, new Reservation("changed", 20));
        steps.set(0, new Step("changed", "changed", Action.ATTEMPT_RESERVE));
        actors.clear();
        steps.clear();
        assertThat(input).isEqualTo(baseline);
        assertThat(analyzer.run(input)).isEqualTo(analyzer.run(baseline));
        assertThatThrownBy(() -> input.reservations().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> input.schedule().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void completeSnapshotsRetainEarlierKnowledgeAndAllocationsAfterLaterActions() {
        var result = analyzer.run(ReservationPresets.baseline());
        assertThat(result.initialState().remainingUnits()).isEqualTo(1);
        assertThat(result.initialState().allocatedUnits()).isZero();
        assertThat(result.initialState().allocations()).isEmpty();
        assertThat(result.initialState().reservations()).allSatisfy(actor -> {
            assertThat(actor.status()).isEqualTo(Status.NOT_READ);
            assertThat(actor.observedRemaining()).isNull();
        });
        var afterFirstRead = result.outcomes().get(0).postState();
        assertThat(afterFirstRead.allocations()).isEmpty();
        assertThat(afterFirstRead.reservations().get(0).status()).isEqualTo(Status.READ_OBSERVED);
        assertThat(afterFirstRead.reservations().get(0).observedRemaining()).isEqualTo(1);
        assertThat(afterFirstRead.reservations().get(1).status()).isEqualTo(Status.NOT_READ);
        assertThat(afterFirstRead.reservations().get(1).observedRemaining()).isNull();
        var afterFirstAcceptance = result.outcomes().get(2).postState();
        assertThat(afterFirstAcceptance.allocations()).containsExactly(new ReservationResult.Allocation("a", 1, "attempt-a"));
        assertThat(afterFirstAcceptance.reservations().get(1).status()).isEqualTo(Status.READ_OBSERVED);
        assertThat(afterFirstAcceptance.invariants()).isEqualTo(new Invariants(true, true, true, 1));
        assertThat(result.finalState().allocations()).hasSize(2);
        assertThat(result.finalState().invariants()).isEqualTo(new Invariants(true, false, false, 2));
        assertThat(afterFirstRead.remainingUnits()).isEqualTo(1);
        assertThat(afterFirstRead.allocatedUnits()).isZero();
        assertThat(result.finalState()).isEqualTo(result.outcomes().get(3).postState());
    }

    @Test
    void everyReturnedCollectionRejectsMutationIncludingNestedSnapshots() {
        var result = analyzer.run(ReservationPresets.baseline());
        assertThatThrownBy(() -> result.outcomes().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> result.assumptions().clear()).isInstanceOf(UnsupportedOperationException.class);
        List<State> states = new ArrayList<>();
        states.add(result.initialState());
        states.addAll(result.outcomes().stream().map(ReservationResult.Outcome::postState).toList());
        states.add(result.finalState());
        for (State state : states) {
            assertThatThrownBy(() -> state.reservations().clear()).isInstanceOf(UnsupportedOperationException.class);
            assertThatThrownBy(() -> state.allocations().add(new ReservationResult.Allocation("other", 1, "other-step")))
                    .isInstanceOf(UnsupportedOperationException.class);
        }
    }

    @Test
    void resultAndSnapshotConstructorsDefensivelyOwnMutableCollectionArguments() {
        var original = analyzer.run(ReservationPresets.baseline());
        var actors = new ArrayList<>(original.initialState().reservations());
        var allocations = new ArrayList<>(original.initialState().allocations());
        var copiedState = new State(1, 0, actors, allocations, new Invariants(true, true, true, 1));
        actors.clear();
        allocations.add(new ReservationResult.Allocation("other", 1, "other-step"));
        assertThat(copiedState).isEqualTo(original.initialState());

        var outcomes = new ArrayList<>(original.outcomes());
        var assumptions = new ArrayList<>(original.assumptions());
        var copiedResult = new ReservationResult(original.simulationId(), original.schemaVersion(), original.modelVersion(),
                original.kind(), original.status(), original.input(), copiedState, outcomes, original.finalState(),
                original.metrics(), assumptions);
        outcomes.clear();
        assumptions.clear();
        assertThat(copiedResult).isEqualTo(original);
    }

    @Test
    void repeatedAndConcurrentMixedRequestsShareNoActorOrInventoryState() throws Exception {
        // Threads exercise simultaneous API-style calls, never scheduling actions inside a model run.
        var unsafe = ReservationPresets.baseline();
        var protectedInput = ReservationPresets.protectedBaseline();
        var empty = new ReservationInput("1.0", "1.0.0", Strategy.ATOMIC_CONDITIONAL_RESERVATION,
                0, unsafe.reservations(), unsafe.schedule());
        var inputs = List.of(unsafe, protectedInput, empty);
        var expected = inputs.stream().map(analyzer::run).toList();
        assertThat(expected.get(0).metrics().acceptedReservations()).isEqualTo(2);
        assertThat(expected.get(1).metrics().acceptedReservations()).isEqualTo(1);
        assertThat(expected.get(2).metrics().acceptedReservations()).isZero();
        var executor = Executors.newFixedThreadPool(4);
        var start = new CountDownLatch(1);
        try {
            var futures = IntStream.range(0, 24).mapToObj(index -> executor.submit(() -> {
                start.await();
                return analyzer.run(inputs.get(index % inputs.size()));
            })).toList();
            start.countDown();
            for (int index = 0; index < futures.size(); index++)
                assertThat(futures.get(index).get(5, TimeUnit.SECONDS)).as("isolated request %s", index)
                        .isEqualTo(expected.get(index % inputs.size()));
            for (int index = 0; index < inputs.size(); index++)
                assertThat(analyzer.run(inputs.get(index))).isEqualTo(expected.get(index));
        } finally {
            start.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void maximumBoundedInputCanExposeEightyAllocatedUnitsWithoutClampingTheUnsafeResult() {
        var reservations = IntStream.range(0, 4)
                .mapToObj(index -> new Reservation("a" + "x".repeat(30) + index, 20)).toList();
        var schedule = new ArrayList<Step>();
        for (int index = 0; index < 4; index++)
            schedule.add(new Step("r" + "x".repeat(30) + index, reservations.get(index).id(), Action.READ));
        for (int index = 0; index < 4; index++)
            schedule.add(new Step("w" + "x".repeat(30) + index, reservations.get(index).id(), Action.ATTEMPT_RESERVE));
        var input = new ReservationInput("1.0", "1.0.0", Strategy.STALE_READ_WRITE, 20, reservations, schedule);
        var result = analyzer.run(input);
        assertThat(result.outcomes()).hasSize(8);
        assertThat(result.finalState().reservations()).hasSize(4);
        assertThat(result.finalState().allocations()).hasSize(4);
        assertThat(result.finalState().remainingUnits()).isZero();
        assertThat(result.finalState().allocatedUnits()).isEqualTo(80);
        assertThat(result.finalState().invariants()).isEqualTo(new Invariants(true, false, false, 80));
        assertThat(result.metrics().acceptedReservations()).isEqualTo(4);
        assertThat(result.metrics().firstViolationStepId()).isEqualTo("w" + "x".repeat(30) + "1");
        assertThat(result.metrics().invariantStatus()).isEqualTo(InvariantStatus.VIOLATED);

        var protectedInput = new ReservationInput("1.0", "1.0.0", Strategy.ATOMIC_CONDITIONAL_RESERVATION,
                20, reservations, schedule);
        var protectedResult = analyzer.run(protectedInput);
        assertThat(protectedResult.finalState().allocatedUnits()).isEqualTo(20);
        assertThat(protectedResult.metrics().acceptedReservations()).isEqualTo(1);
        assertThat(protectedResult.metrics().rejectedReservations()).isEqualTo(3);
        assertThat(protectedResult.finalState().invariants()).isEqualTo(new Invariants(true, true, true, 20));
    }
}
