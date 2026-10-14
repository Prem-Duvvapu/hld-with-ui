package com.hld.transactions;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.transactions.ReservationInput.Action;
import com.hld.transactions.ReservationResult.Allocation;
import com.hld.transactions.ReservationResult.CheckSource;
import com.hld.transactions.ReservationResult.InvariantStatus;
import com.hld.transactions.ReservationResult.Invariants;
import com.hld.transactions.ReservationResult.Kind;
import com.hld.transactions.ReservationResult.RejectionReason;
import com.hld.transactions.ReservationResult.ReservationState;
import com.hld.transactions.ReservationResult.State;
import com.hld.transactions.ReservationResult.Status;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/** Small exact fixtures bind policy choices to their complete Java evidence. */
class ReservationAnalyzerTest {
    private final ReservationAnalyzer analyzer = new ReservationAnalyzer();

    private static State state(int initial, int remaining, List<ReservationState> actors, List<Allocation> allocations) {
        int allocated = allocations.stream().mapToInt(Allocation::quantity).sum();
        return new State(remaining, allocated, actors, allocations,
                new Invariants(remaining >= 0, allocated <= initial, remaining + allocated == initial, remaining + allocated));
    }

    @Test void unsafeBaselineRetainsEveryObservationAndExposesTheFirstBrokenPrefix() {
        var input = ReservationPresets.baseline();
        var result = analyzer.run(input);
        var initial = state(1, 1,
                List.of(new ReservationState("a", 1, Status.NOT_READ, null), new ReservationState("b", 1, Status.NOT_READ, null)), List.of());
        assertThat(result.input()).isEqualTo(input);
        assertThat(result.simulationId()).isEqualTo("transactions-isolation");
        assertThat(result.schemaVersion()).isEqualTo("1.0");
        assertThat(result.modelVersion()).isEqualTo("1.0.0");
        assertThat(result.kind()).isEqualTo("analysis");
        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.initialState()).isEqualTo(initial);
        assertThat(result.outcomes()).hasSize(4);
        assertThat(result.outcomes()).extracting(ReservationResult.Outcome::sequence).containsExactly(1, 2, 3, 4);
        assertThat(result.outcomes()).extracting(ReservationResult.Outcome::stepId).containsExactly("read-a", "read-b", "attempt-a", "attempt-b");
        assertThat(result.outcomes().get(0).postState()).isEqualTo(state(1, 1,
                List.of(new ReservationState("a", 1, Status.READ_OBSERVED, 1), new ReservationState("b", 1, Status.NOT_READ, null)), List.of()));
        assertThat(result.outcomes().get(1).postState()).isEqualTo(state(1, 1,
                List.of(new ReservationState("a", 1, Status.READ_OBSERVED, 1), new ReservationState("b", 1, Status.READ_OBSERVED, 1)), List.of()));
        assertThat(result.outcomes().get(2).postState()).isEqualTo(state(1, 0,
                List.of(new ReservationState("a", 1, Status.ACCEPTED, 1), new ReservationState("b", 1, Status.READ_OBSERVED, 1)),
                List.of(new Allocation("a", 1, "attempt-a"))));
        assertThat(result.finalState()).isEqualTo(state(1, 0,
                List.of(new ReservationState("a", 1, Status.ACCEPTED, 1), new ReservationState("b", 1, Status.ACCEPTED, 1)),
                List.of(new Allocation("a", 1, "attempt-a"), new Allocation("b", 1, "attempt-b"))));
        assertThat(result.finalState()).isEqualTo(result.outcomes().get(3).postState());
        assertThat(result.finalState().invariants()).isEqualTo(new Invariants(true, false, false, 2));
        assertThat(result.metrics()).isEqualTo(new ReservationResult.Metrics(2, 0, 0, 2, InvariantStatus.VIOLATED, "attempt-b"));
        assertThat(result.outcomes().get(2).postState().invariants()).isEqualTo(new Invariants(true, true, true, 1));
    }

    @Test void protectedBaselineChecksCurrentStockInsteadOfTheRetainedPreview() {
        var result = analyzer.run(ReservationPresets.protectedBaseline());
        var decision = result.outcomes().get(3);
        assertThat(decision.action()).isEqualTo(Action.ATTEMPT_RESERVE);
        assertThat(decision.kind()).isEqualTo(Kind.RESERVATION_REJECTED);
        assertThat(decision.checkedRemaining()).isZero();
        assertThat(decision.checkSource()).isEqualTo(CheckSource.CURRENT);
        assertThat(decision.quantity()).isEqualTo(1);
        assertThat(decision.rejectionReason()).isEqualTo(RejectionReason.INSUFFICIENT_STOCK);
        assertThat(decision.observedRemaining()).isNull();
        assertThat(decision.postState().reservations()).containsExactly(
                new ReservationState("a", 1, Status.ACCEPTED, 1), new ReservationState("b", 1, Status.REJECTED, 1));
        assertThat(decision.postState().allocations()).isEqualTo(result.outcomes().get(2).postState().allocations());
        assertThat(decision.postState().remainingUnits()).isEqualTo(result.outcomes().get(2).postState().remainingUnits());
        assertThat(result.metrics()).isEqualTo(new ReservationResult.Metrics(1, 1, 0, 1, InvariantStatus.PRESERVED, null));
        assertThat(result.outcomes()).allSatisfy(outcome -> assertThat(outcome.postState().invariants()).isEqualTo(new Invariants(true, true, true, 1)));
        assertThat(decision.explanation()).contains("current shared stock 0", "allocations are unchanged");
    }

    record Expected(String id, int accepted, int rejected, int remaining, int allocated,
            boolean capacity, boolean conserved, String firstViolation, List<String> allocationOrder) {}
    static Stream<Expected> presets() {
        return Stream.of(
                new Expected("unsafe-baseline", 2, 0, 0, 2, false, false, "attempt-b", List.of("a", "b")),
                new Expected("protected-baseline", 1, 1, 0, 1, true, true, null, List.of("a")),
                new Expected("serial-control", 1, 1, 0, 1, true, true, null, List.of("a")),
                new Expected("reverse-winner", 1, 1, 0, 1, true, true, null, List.of("b")),
                new Expected("conservation-gap", 2, 0, 1, 2, true, false, "attempt-b", List.of("a", "b")),
                new Expected("empty-stock", 0, 2, 0, 0, true, true, null, List.of()),
                new Expected("unequal-quantities", 1, 1, 0, 2, true, true, null, List.of("a")),
                new Expected("stale-restoration", 2, 0, 1, 3, false, false, "attempt-b", List.of("a", "b")));
    }

    @ParameterizedTest @MethodSource("presets")
    void everyCanonicalPresetHasItsExactOutcomeAndPopulation(Expected expected) {
        var preset = ReservationPresets.all().stream().filter(p -> p.id().equals(expected.id())).findFirst().orElseThrow();
        var result = analyzer.run(preset.input());
        assertThat(result.metrics().acceptedReservations()).isEqualTo(expected.accepted());
        assertThat(result.metrics().rejectedReservations()).isEqualTo(expected.rejected());
        assertThat(result.metrics().finalRemainingUnits()).isEqualTo(expected.remaining());
        assertThat(result.metrics().finalAllocatedUnits()).isEqualTo(expected.allocated());
        assertThat(result.metrics().firstViolationStepId()).isEqualTo(expected.firstViolation());
        assertThat(result.metrics().invariantStatus()).isEqualTo(expected.firstViolation() == null ? InvariantStatus.PRESERVED : InvariantStatus.VIOLATED);
        assertThat(result.finalState().invariants()).isEqualTo(new Invariants(true, expected.capacity(), expected.conserved(), expected.remaining() + expected.allocated()));
        assertThat(result.finalState().allocations()).extracting(Allocation::reservationId).isEqualTo(expected.allocationOrder());
        assertThat(result.finalState().allocations()).hasSize(expected.accepted());
        assertThat(result.finalState().reservations().stream().filter(r -> r.status() == Status.REJECTED)).hasSize(expected.rejected());
        assertThat(result.metrics().acceptedReservations() + result.metrics().rejectedReservations()).isEqualTo(preset.input().reservations().size());
        assertThat(result.outcomes()).hasSize(preset.input().schedule().size());
        assertThat(result.finalState()).isEqualTo(result.outcomes().get(result.outcomes().size() - 1).postState());
    }

    @Test void outcomeVariantsHaveOnlyApplicableEvidenceAndBoundedOriginalExplanations() {
        assertThat(ReservationPresets.all()).extracting(ReservationPresets.Preset::id).containsExactly(
                "unsafe-baseline", "protected-baseline", "serial-control", "reverse-winner",
                "conservation-gap", "empty-stock", "unequal-quantities", "stale-restoration");
        for (var preset : ReservationPresets.all()) {
            var result = analyzer.run(preset.input());
            assertThat(result.assumptions()).isNotEmpty().hasSizeLessThanOrEqualTo(12);
            assertThat(result.assumptions()).allSatisfy(text -> assertThat(text.length()).isBetween(1, 600));
            for (var outcome : result.outcomes()) {
                assertThat(outcome.explanation().length()).isBetween(1, 600);
                assertThat(outcome.reservationId()).isEqualTo(preset.input().schedule().get(outcome.sequence() - 1).reservationId());
                if (outcome.action() == Action.READ) {
                    assertThat(outcome.kind()).isEqualTo(Kind.READ_OBSERVED);
                    assertThat(outcome.observedRemaining()).isNotNull();
                    assertThat(outcome.checkedRemaining()).isNull();
                    assertThat(outcome.checkSource()).isNull();
                    assertThat(outcome.quantity()).isNull();
                    assertThat(outcome.rejectionReason()).isNull();
                } else {
                    assertThat(outcome.observedRemaining()).isNull();
                    assertThat(outcome.checkedRemaining()).isNotNull();
                    assertThat(outcome.checkSource()).isEqualTo(preset.input().strategy() == ReservationInput.Strategy.STALE_READ_WRITE ? CheckSource.SNAPSHOT : CheckSource.CURRENT);
                    assertThat(outcome.quantity()).isNotNull();
                    assertThat(outcome.rejectionReason()).isEqualTo(outcome.kind() == Kind.RESERVATION_REJECTED ? RejectionReason.INSUFFICIENT_STOCK : null);
                }
            }
        }
    }
}
