package com.hld.simulation.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.simulation.SimulationEvent;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class SimulationEngineTest {

    // --- EventEmitter ---

    @Test
    void emitterAcceptsEventsWithinBudget() {
        EventEmitter emitter = new EventEmitter(100, 100_000);
        SimulationEvent event = new SimulationEvent(1, 0L, "test.event", "R1", "N1", "Hello");
        assertThat(emitter.emit(event)).isTrue();
        assertThat(emitter.size()).isEqualTo(1);
        assertThat(emitter.truncationReason()).isNull();
    }

    @Test
    void emitterRejectsEventsAfterCountLimit() {
        EventEmitter emitter = new EventEmitter(2, 100_000);
        emitter.emit(new SimulationEvent(1, 0L, "a", "R1", "N1", "m1"));
        emitter.emit(new SimulationEvent(2, 0L, "b", "R1", "N1", "m2"));
        assertThat(emitter.emit(new SimulationEvent(3, 0L, "c", "R1", "N1", "m3"))).isFalse();
        assertThat(emitter.truncationReason()).isEqualTo("event_limit");
        assertThat(emitter.size()).isEqualTo(2);
    }

    @Test
    void emitterRejectsEventsAfterByteBudget() {
        // Each event ~140+ bytes estimated; a 200 byte budget fits ~1 event
        EventEmitter emitter = new EventEmitter(100, 200);
        emitter.emit(new SimulationEvent(1, 0L, "test.event", "R1", "N1", "A message"));
        assertThat(emitter.emit(new SimulationEvent(2, 0L, "test.event", "R1", "N1", "Another")))
                .isFalse();
        assertThat(emitter.truncationReason()).isEqualTo("trace_size_limit");
    }

    @Test
    void emitterTracksEstimatedBytes() {
        EventEmitter emitter = new EventEmitter(100, 100_000);
        assertThat(emitter.estimatedBytes()).isZero();
        emitter.emit(new SimulationEvent(1, 0L, "test", "R1", "N1", "msg"));
        assertThat(emitter.estimatedBytes()).isPositive();
    }

    // --- SeededRandom ---

    @Test
    void sameSeadProducesSameSequence() {
        SeededRandom r1 = new SeededRandom(42);
        SeededRandom r2 = new SeededRandom(42);
        for (int i = 0; i < 100; i++) {
            assertThat(r1.nextInt(1000)).isEqualTo(r2.nextInt(1000));
        }
    }

    @Test
    void differentSeedsProduceDifferentSequences() {
        SeededRandom r1 = new SeededRandom(42);
        SeededRandom r2 = new SeededRandom(99);
        boolean anyDifferent = false;
        for (int i = 0; i < 10; i++) {
            if (r1.nextInt(10_000) != r2.nextInt(10_000)) {
                anyDifferent = true;
                break;
            }
        }
        assertThat(anyDifferent).isTrue();
    }

    @Test
    void reportsAlgorithmName() {
        assertThat(new SeededRandom(1).algorithm()).isEqualTo("L64X128MixRandom");
    }

    // --- SimulationBudget ---

    @Test
    void defaultBudgetHasExpectedValues() {
        SimulationBudget budget = SimulationBudget.defaults();
        assertThat(budget.maxEvents()).isEqualTo(10_000);
        assertThat(budget.maxVirtualTimeMs()).isEqualTo(60_000L);
        assertThat(budget.maxTraceBytes()).isEqualTo(2L * 1024 * 1024);
        assertThat(budget.wallDeadlineMs()).isEqualTo(10_000L);
    }

    // --- SimulationContext ---

    @Test
    void contextEmitsEventsAndTracksExhaustion() {
        SimulationContext ctx = new SimulationContext(
                new SimulationBudget(2, 60_000L, 100_000L, 0L), 42, 43);
        assertThat(ctx.isExhausted()).isFalse();
        ctx.emit(new SimulationEvent(1, 0L, "a", "R1", "N1", "m"));
        ctx.emit(new SimulationEvent(2, 0L, "b", "R1", "N1", "m"));
        assertThat(ctx.isExhausted()).isFalse();
        // Third should be rejected by the emitter
        assertThat(ctx.emit(new SimulationEvent(3, 0L, "c", "R1", "N1", "m"))).isFalse();
        assertThat(ctx.isExhausted()).isTrue();
        assertThat(ctx.truncationReason()).isEqualTo("event_limit");
    }

    @Test
    void contextDetectsVirtualTimeExceeded() {
        SimulationContext ctx = new SimulationContext(
                new SimulationBudget(100, 1000L, 100_000L, 0L), 1, 2);
        assertThat(ctx.virtualTimeExceeded(999)).isFalse();
        assertThat(ctx.virtualTimeExceeded(1000)).isFalse();
        assertThat(ctx.virtualTimeExceeded(1001)).isTrue();
    }

    @Test
    void contextProvidesSeededRandomness() {
        SimulationContext ctx1 = new SimulationContext(SimulationBudget.defaults(), 42, 99);
        SimulationContext ctx2 = new SimulationContext(SimulationBudget.defaults(), 42, 99);
        assertThat(ctx1.workloadRandom().nextInt(1000))
                .isEqualTo(ctx2.workloadRandom().nextInt(1000));
        assertThat(ctx1.failureRandom().nextInt(1000))
                .isEqualTo(ctx2.failureRandom().nextInt(1000));
    }

    @Test
    void contextSeparatesWorkloadAndFailureSeeds() {
        SimulationContext ctx = new SimulationContext(SimulationBudget.defaults(), 42, 99);
        // Different seeds should generally produce different first values
        int workloadVal = ctx.workloadRandom().nextInt(100_000);
        int failureVal = ctx.failureRandom().nextInt(100_000);
        // Not guaranteed different for all seeds, but highly likely with these
        assertThat(workloadVal).isNotEqualTo(failureVal);
    }

    // --- FailureSchedule ---

    @Test
    void emptyScheduleIsValid() {
        FailureSchedule schedule = FailureSchedule.empty();
        assertThat(schedule.isEmpty()).isTrue();
        assertThat(schedule.entries()).isEmpty();
    }

    @Test
    void validScheduleIsAccepted() {
        FailureSchedule schedule = FailureSchedule.of(
                List.of(new FailureScheduleEntry("Node A", 100L, 200L, InFlightBehavior.FAIL)),
                60_000L,
                Set.of("Node A", "Node B"));
        assertThat(schedule.isEmpty()).isFalse();
        assertThat(schedule.entries()).hasSize(1);
    }

    @Test
    void detectsOverlappingFailureWindows() {
        assertThatThrownBy(() -> FailureSchedule.of(
                List.of(
                        new FailureScheduleEntry("Node A", 100L, 300L, InFlightBehavior.FAIL),
                        new FailureScheduleEntry("Node A", 200L, 400L, InFlightBehavior.FAIL)),
                60_000L,
                Set.of("Node A")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Overlapping");
    }

    @Test
    void detectsUnknownEntities() {
        assertThatThrownBy(() -> FailureSchedule.of(
                List.of(new FailureScheduleEntry("Node Z", 100L, 200L, InFlightBehavior.FAIL)),
                60_000L,
                Set.of("Node A")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown entity");
    }

    @Test
    void rejectsTimesExceedingMaxVirtualTime() {
        assertThatThrownBy(() -> FailureSchedule.of(
                List.of(new FailureScheduleEntry("Node A", 70_000L, null, InFlightBehavior.FAIL)),
                60_000L,
                Set.of("Node A")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("exceeds maxVirtualTimeMs");
    }

    @Test
    void isEntityFailedReturnsTrueWithinFailureWindow() {
        FailureSchedule schedule = FailureSchedule.of(
                List.of(new FailureScheduleEntry("Node A", 100L, 200L, InFlightBehavior.FAIL)),
                60_000L,
                Set.of("Node A"));
        assertThat(schedule.isEntityFailed("Node A", 50)).isFalse();
        assertThat(schedule.isEntityFailed("Node A", 100)).isTrue();
        assertThat(schedule.isEntityFailed("Node A", 150)).isTrue();
        assertThat(schedule.isEntityFailed("Node A", 200)).isFalse();
        assertThat(schedule.isEntityFailed("Node B", 150)).isFalse();
    }

    @Test
    void permanentFailureKeepsEntityDown() {
        FailureSchedule schedule = FailureSchedule.of(
                List.of(new FailureScheduleEntry("Node A", 100L, null, InFlightBehavior.FAIL)),
                60_000L,
                Set.of("Node A"));
        assertThat(schedule.isEntityFailed("Node A", 100)).isTrue();
        assertThat(schedule.isEntityFailed("Node A", 50_000)).isTrue();
    }

    @Test
    void nonOverlappingWindowsForSameEntityAreAllowed() {
        FailureSchedule schedule = FailureSchedule.of(
                List.of(
                        new FailureScheduleEntry("Node A", 100L, 200L, InFlightBehavior.FAIL),
                        new FailureScheduleEntry("Node A", 300L, 400L, InFlightBehavior.FAIL)),
                60_000L,
                Set.of("Node A"));
        assertThat(schedule.entries()).hasSize(2);
    }

    @Test
    void differentEntitiesCanFailSimultaneously() {
        FailureSchedule schedule = FailureSchedule.of(
                List.of(
                        new FailureScheduleEntry("Node A", 100L, 200L, InFlightBehavior.FAIL),
                        new FailureScheduleEntry("Node B", 100L, 200L, InFlightBehavior.FAIL)),
                60_000L,
                Set.of("Node A", "Node B"));
        assertThat(schedule.entries()).hasSize(2);
    }

    // --- FailureScheduleEntry validation ---

    @Test
    void entryRejectsBlankEntityId() {
        assertThatThrownBy(() -> new FailureScheduleEntry("", 100L, 200L, InFlightBehavior.FAIL))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("entityId");
    }

    @Test
    void entryRejectsNegativeFailTime() {
        assertThatThrownBy(() -> new FailureScheduleEntry("N", -1L, 200L, InFlightBehavior.FAIL))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("failAtMs");
    }

    @Test
    void entryRejectsRecoveryBeforeFailure() {
        assertThatThrownBy(() -> new FailureScheduleEntry("N", 200L, 100L, InFlightBehavior.FAIL))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("recoverAtMs must be after failAtMs");
    }
}
