package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.catalog.CatalogService;
import com.hld.catalog.GuidedCheckpoint;
import com.hld.transactions.ReservationAnalyzer;
import com.hld.transactions.ReservationResult.Allocation;
import com.hld.transactions.ReservationResult.CheckSource;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** Authored checkpoint identities bind to real Java outcomes and complete selected-prefix states. */
@SpringBootTest
class ReservationGuidedCheckpointsTest {
    @Autowired CatalogService catalog;
    @Autowired ReservationController controller;
    @Autowired ReservationAnalyzer analyzer;

    record Expected(String id, String preset, String step, Kind kind, int sequence,
            Integer observed, Integer checked, CheckSource source, State state, String firstViolation) {}

    private static State state(int remaining, int allocated, int accounted, boolean capacity, boolean conserved,
            Status a, int aObserved, Status b, int bObserved, List<Allocation> allocations) {
        return new State(remaining, allocated,
                List.of(new ReservationState("a", 1, a, aObserved), new ReservationState("b", 1, b, bObserved)),
                allocations, new Invariants(true, capacity, conserved, accounted));
    }

    static Stream<Expected> checkpoints() {
        var aAllocation = List.of(new Allocation("a", 1, "attempt-a"));
        var bothAllocations = List.of(new Allocation("a", 1, "attempt-a"), new Allocation("b", 1, "attempt-b"));
        return Stream.of(
                new Expected("read-is-preview", "protected-baseline", "read-b", Kind.READ_OBSERVED, 2,
                        1, null, null, state(1, 0, 1, true, true, Status.READ_OBSERVED, 1, Status.READ_OBSERVED, 1, List.of()), null),
                new Expected("first-acceptance-looks-safe", "unsafe-baseline", "attempt-a", Kind.RESERVATION_ACCEPTED, 3,
                        null, 1, CheckSource.SNAPSHOT, state(0, 1, 1, true, true, Status.ACCEPTED, 1, Status.READ_OBSERVED, 1, aAllocation), "attempt-b"),
                new Expected("stale-second-acceptance", "unsafe-baseline", "attempt-b", Kind.RESERVATION_ACCEPTED, 4,
                        null, 1, CheckSource.SNAPSHOT, state(0, 2, 2, false, false, Status.ACCEPTED, 1, Status.ACCEPTED, 1, bothAllocations), "attempt-b"),
                new Expected("current-check-boundary", "protected-baseline", "attempt-a", Kind.RESERVATION_ACCEPTED, 3,
                        null, 1, CheckSource.CURRENT, state(0, 1, 1, true, true, Status.ACCEPTED, 1, Status.READ_OBSERVED, 1, aAllocation), null),
                new Expected("stale-preview-rejected", "protected-baseline", "attempt-b", Kind.RESERVATION_REJECTED, 4,
                        null, 0, CheckSource.CURRENT, state(0, 1, 1, true, true, Status.ACCEPTED, 1, Status.REJECTED, 1, aAllocation), null),
                new Expected("serial-order-hides-race", "serial-control", "attempt-b", Kind.RESERVATION_REJECTED, 4,
                        null, 0, CheckSource.SNAPSHOT, state(0, 1, 1, true, true, Status.ACCEPTED, 1, Status.REJECTED, 0, aAllocation), null),
                new Expected("capacity-not-conservation", "conservation-gap", "attempt-b", Kind.RESERVATION_ACCEPTED, 4,
                        null, 2, CheckSource.SNAPSHOT, state(1, 2, 3, true, false, Status.ACCEPTED, 2, Status.ACCEPTED, 2, bothAllocations), "attempt-b"),
                new Expected("empty-stock-valid-rejection", "empty-stock", "attempt-a", Kind.RESERVATION_REJECTED, 3,
                        null, 0, CheckSource.SNAPSHOT, state(0, 0, 0, true, true, Status.REJECTED, 0, Status.READ_OBSERVED, 0, List.of()), null));
    }

    @ParameterizedTest @MethodSource("checkpoints")
    void eachCanonicalCheckpointResolvesItsExactKindAndCompleteReturnedPrefix(Expected expected) {
        var checkpoint = catalog.draftTopic("transactions-isolation").checkpoints().stream()
                .filter(c -> c.id().equals(expected.id())).findFirst().orElseThrow();
        assertThat(checkpoint.simulationId()).isEqualTo("transactions-isolation");
        assertThat(checkpoint.presetId()).isEqualTo(expected.preset());
        var target = checkpoint.target();
        assertThat(target.stepId()).isEqualTo(expected.step());
        assertThat(target.kind()).isEqualTo(expected.kind().name());
        assertThat(target.occurrence()).isEqualTo(1);
        assertThat(target.operation()).isNull(); assertThat(target.jobId()).isNull();
        assertThat(target.messageId()).isNull(); assertThat(target.attemptId()).isNull(); assertThat(target.operationId()).isNull();
        var preset = controller.descriptor().presets().stream().filter(p -> p.id().equals(checkpoint.presetId())).findFirst().orElseThrow();
        var result = analyzer.run(preset.input());
        var matches = result.outcomes().stream().filter(o -> o.stepId().equals(target.stepId()) && o.kind().name().equals(target.kind())).toList();
        assertThat(matches).as(expected.id() + " semantic step target").hasSize(1);
        var outcome = matches.get(0);
        assertThat(outcome.sequence()).isEqualTo(expected.sequence());
        assertThat(outcome.reservationId()).isEqualTo(preset.input().schedule().get(expected.sequence() - 1).reservationId());
        assertThat(outcome.action()).isEqualTo(preset.input().schedule().get(expected.sequence() - 1).action());
        assertThat(outcome.observedRemaining()).isEqualTo(expected.observed());
        assertThat(outcome.checkedRemaining()).isEqualTo(expected.checked());
        assertThat(outcome.checkSource()).isEqualTo(expected.source());
        assertThat(outcome.quantity()).isEqualTo(expected.kind() == Kind.READ_OBSERVED ? null : 1);
        assertThat(outcome.rejectionReason()).isEqualTo(expected.kind() == Kind.RESERVATION_REJECTED ? RejectionReason.INSUFFICIENT_STOCK : null);
        assertThat(outcome.postState()).isEqualTo(expected.state());
        assertThat(result.metrics().firstViolationStepId()).isEqualTo(expected.firstViolation());
        assertThat(result.finalState()).isEqualTo(result.outcomes().get(result.outcomes().size() - 1).postState());
        assertThat(result.input()).isEqualTo(preset.input());
        assertThat(result.modelVersion()).isEqualTo("1.0.0");
        assertThat(result.schemaVersion()).isEqualTo("1.0");
        assertThat(result.kind()).isEqualTo("analysis");
    }

    @Test void authoredCoverageUsesFivePresetsAllThreeKindsAndNoInventedTimingOrExtraPresets() {
        var checkpoints = catalog.draftTopic("transactions-isolation").checkpoints();
        assertThat(checkpoints).extracting(GuidedCheckpoint::id).containsExactly(
                "read-is-preview", "first-acceptance-looks-safe", "stale-second-acceptance", "current-check-boundary",
                "stale-preview-rejected", "serial-order-hides-race", "capacity-not-conservation", "empty-stock-valid-rejection");
        assertThat(checkpoints.stream().map(GuidedCheckpoint::presetId).distinct()).containsExactlyInAnyOrder(
                "protected-baseline", "unsafe-baseline", "serial-control", "conservation-gap", "empty-stock");
        assertThat(checkpoints.stream().map(c -> c.target().kind()).distinct()).containsExactlyInAnyOrder(
                "READ_OBSERVED", "RESERVATION_ACCEPTED", "RESERVATION_REJECTED");
        assertThat(controller.descriptor().presets()).hasSize(8);
        for (var checkpoint : checkpoints) assertThat(checkpoint.tradeoff().options()).extracting(GuidedCheckpoint.Tradeoff.Option::id)
                .contains(checkpoint.tradeoff().recommendedOptionId());
    }

    @Test void unknownStepOrWrongActualKindCannotResolveEvenWhenTheArrayPositionExists() {
        var result = analyzer.run(controller.descriptor().presets().get(0).input());
        for (var target : List.of(
                new GuidedCheckpoint.Target(null, null, null, null, null, "missing", "READ_OBSERVED", 1),
                new GuidedCheckpoint.Target(null, null, null, null, null, "read-a", "RESERVATION_ACCEPTED", 1)))
            assertThat(result.outcomes().stream().filter(o -> target.stepId().equals(o.stepId()) && target.kind().equals(o.kind().name()))).isEmpty();
    }

    @Test void passingAndRejectedPrefixesMustNotBorrowTheLaterWholeScheduleFacts() {
        var unsafe = analyzer.run(controller.descriptor().presets().stream().filter(p -> p.id().equals("unsafe-baseline")).findFirst().orElseThrow().input());
        assertThat(unsafe.outcomes().get(2).postState().invariants()).isEqualTo(new Invariants(true, true, true, 1));
        assertThat(unsafe.finalState().invariants()).isEqualTo(new Invariants(true, false, false, 2));
        var empty = analyzer.run(controller.descriptor().presets().stream().filter(p -> p.id().equals("empty-stock")).findFirst().orElseThrow().input());
        assertThat(empty.outcomes().get(2).postState().reservations()).containsExactly(
                new ReservationState("a", 1, Status.REJECTED, 0), new ReservationState("b", 1, Status.READ_OBSERVED, 0));
        assertThat(empty.metrics().rejectedReservations()).isEqualTo(2);
    }
}
