package com.hld.queues;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.queues.QueueCapacityEvent.Kind;
import com.hld.queues.QueueCapacityInput.Job;
import com.hld.queues.QueueCapacityOutcome.Status;
import com.hld.simulation.engine.SimulationBudget;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/** Hand-calculated finite-worker fixtures; these are not broker delivery guarantees. */
class QueueCapacitySimulatorTest {
    private final QueueCapacitySimulator simulator = new QueueCapacitySimulator();

    static QueueCapacityInput input(int workers, int capacity, List<Job> jobs) {
        return new QueueCapacityInput("1.0", "1.0.0", workers, capacity, jobs, 7);
    }

    static List<Job> burst(int count, long service) {
        return java.util.stream.IntStream.rangeClosed(1, count)
                .mapToObj(i -> new Job("job-" + i, 0, service)).toList();
    }

    private QueueCapacityOutcome outcome(QueueCapacityResult result, String id) {
        return result.outcomes().stream().filter(o -> o.jobId().equals(id)).findFirst().orElseThrow();
    }

    @Test void oneWaitingSlotAcceptsTwoAndRejectsTwoWithoutCountingRejectedLatency() {
        var result = simulator.run(input(1, 1, burst(4, 10)));
        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.outcomes()).extracting(QueueCapacityOutcome::status)
                .containsExactly(Status.COMPLETED, Status.COMPLETED, Status.REJECTED, Status.REJECTED);
        assertThat(result.outcomes().subList(0, 2)).extracting(QueueCapacityOutcome::waitTimeMs).containsExactly(0L, 10L);
        assertThat(result.outcomes().subList(0, 2)).extracting(QueueCapacityOutcome::terminalTimeMs).containsExactly(10L, 20L);
        var metrics = result.metrics();
        assertThat(metrics.completed()).isEqualTo(2);
        assertThat(metrics.rejected()).isEqualTo(2);
        assertThat(metrics.successfulSamples()).isEqualTo(2);
        assertThat(metrics.meanSuccessfulWaitMs()).isEqualTo(5.0);
        assertThat(metrics.meanSuccessfulLatencyMs()).isEqualTo(15.0);
        assertThat(metrics.p95SuccessfulLatencyMs()).isEqualTo(20L);
        assertThat(metrics.peakWaiting()).isEqualTo(1);
        assertThat(metrics.observationStartMs()).isZero();
        assertThat(metrics.observationEndMs()).isEqualTo(20);
        assertThat(metrics.completedThroughputPerSecond()).isEqualTo(100.0);
        assertThat(result.outcomes().subList(2, 4)).allSatisfy(o -> {
            assertThat(o.startTimeMs()).isNull();
            assertThat(o.waitTimeMs()).isNull();
            assertThat(o.latencyMs()).isNull();
            assertThat(o.terminalTimeMs()).isZero();
        });
        assertObservedPrefix(result);
    }

    @Test void moreWaitingCapacityTradesRejectionsForLongerSuccessfulWaiting() {
        var result = simulator.run(input(1, 3, burst(4, 10)));
        assertThat(result.outcomes()).extracting(QueueCapacityOutcome::waitTimeMs).containsExactly(0L, 10L, 20L, 30L);
        assertThat(result.outcomes()).extracting(QueueCapacityOutcome::terminalTimeMs).containsExactly(10L, 20L, 30L, 40L);
        assertThat(result.metrics().completed()).isEqualTo(4);
        assertThat(result.metrics().rejected()).isZero();
        assertThat(result.metrics().meanSuccessfulLatencyMs()).isEqualTo(25.0);
        assertThat(result.metrics().p95SuccessfulLatencyMs()).isEqualTo(40L);
        assertThat(result.metrics().meanSuccessfulWaitMs()).isEqualTo(15.0);
        assertThat(result.metrics().p95SuccessfulWaitMs()).isEqualTo(30L);
        assertThat(result.metrics().peakWaiting()).isEqualTo(3);
        assertObservedPrefix(result);
    }

    @Test void zeroWaitingCapacityStillAllowsIdleWorkersToStart() {
        var result = simulator.run(input(1, 0, burst(4, 10)));
        assertThat(result.metrics().completed()).isEqualTo(1);
        assertThat(result.metrics().rejected()).isEqualTo(3);
        assertThat(result.metrics().peakWaiting()).isZero();
        assertThat(result.events()).noneMatch(e -> e.kind() == Kind.QUEUED);
        assertThat(outcome(result, "job-1").waitTimeMs()).isZero();
        assertObservedPrefix(result);
    }

    @Test void workerSlotsAndWaitingSlotsAreSeparateCapacity() {
        var result = simulator.run(input(2, 1, burst(4, 10)));
        assertThat(result.metrics().completed()).isEqualTo(3);
        assertThat(result.metrics().rejected()).isEqualTo(1);
        assertThat(result.outcomes().subList(0, 3)).extracting(QueueCapacityOutcome::waitTimeMs)
                .containsExactly(0L, 0L, 10L);
        assertThat(outcome(result, "job-1").workerId()).isNotEqualTo(outcome(result, "job-2").workerId());
        assertThat(outcome(result, "job-3").workerId()).isEqualTo(outcome(result, "job-1").workerId());
        assertObservedPrefix(result);
    }

    @Test void aCompletionDispatchesAnExistingWaiterBeforeTheSameTimeArrival() {
        var result = simulator.run(input(1, 1, List.of(
                new Job("first", 0, 10), new Job("waiting", 0, 10), new Job("new", 10, 10))));
        assertThat(outcome(result, "waiting").startTimeMs()).isEqualTo(10L);
        assertThat(outcome(result, "new").startTimeMs()).isEqualTo(20L);
        assertThat(outcome(result, "new").status()).isEqualTo(Status.COMPLETED);
        assertThat(result.events().stream().filter(e -> e.timeMs() == 10).toList())
                .extracting(QueueCapacityEvent::kind).containsExactly(Kind.COMPLETED, Kind.STARTED, Kind.QUEUED);
        assertObservedPrefix(result);
    }

    @Test void aSameTimeArrivalUsesTheFreedWorkerEvenWithoutWaitingCapacity() {
        var result = simulator.run(input(1, 0, List.of(new Job("first", 0, 10), new Job("next", 10, 5))));
        assertThat(result.metrics().completed()).isEqualTo(2);
        assertThat(result.metrics().rejected()).isZero();
        assertThat(outcome(result, "next").startTimeMs()).isEqualTo(10L);
        assertThat(outcome(result, "next").terminalTimeMs()).isEqualTo(15L);
    }

    @Test void fifoDoesNotMoveAShortJobAheadOfASlowWaitingJob() {
        var result = simulator.run(input(1, 2, List.of(
                new Job("running", 0, 10), new Job("slow", 1, 100), new Job("short", 2, 1))));
        assertThat(outcome(result, "slow").startTimeMs()).isEqualTo(10L);
        assertThat(outcome(result, "slow").waitTimeMs()).isEqualTo(9L);
        assertThat(outcome(result, "short").startTimeMs()).isEqualTo(110L);
        assertThat(outcome(result, "short").waitTimeMs()).isEqualTo(108L);
        assertThat(outcome(result, "short").terminalTimeMs()).isEqualTo(111L);
    }

    @Test void nearestRankP95UsesOnlyCompletedSamples() {
        var result = simulator.run(input(1, 0, List.of(new Job("fast", 0, 1), new Job("slow", 1, 100))));
        assertThat(result.metrics().successfulSamples()).isEqualTo(2);
        assertThat(result.metrics().meanSuccessfulLatencyMs()).isEqualTo(50.5);
        assertThat(result.metrics().p95SuccessfulLatencyMs()).isEqualTo(100L);
    }

    @Test void finiteBatchThroughputIncludesTheDeclaredIdleObservationPrefix() {
        var result = simulator.run(input(1, 0, List.of(new Job("later", 9, 1))));
        assertThat(result.metrics().observationStartMs()).isZero();
        assertThat(result.metrics().observationEndMs()).isEqualTo(10);
        assertThat(result.metrics().completedThroughputPerSecond()).isEqualTo(100.0);
        assertThat(outcome(result, "later").waitTimeMs()).isZero();
        assertThat(outcome(result, "later").latencyMs()).isEqualTo(1L);
    }

    @Test void inputAndReturnedCollectionsDoNotExposeMutableRunState() {
        var mutable = new ArrayList<>(burst(4, 10));
        var saved = input(1, 1, mutable);
        mutable.clear();
        assertThat(saved.jobs()).hasSize(4);
        assertThatThrownBy(() -> saved.jobs().clear()).isInstanceOf(UnsupportedOperationException.class);
        var result = simulator.run(saved);
        assertThatThrownBy(() -> result.events().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> result.outcomes().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> result.finalState().workers().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> result.initialState().queuedJobIds().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test void replayAndConcurrentCallsOnOneSimulatorRetainEachInputsResult() throws Exception {
        var inputs = List.of(input(1, 1, burst(4, 10)), input(2, 3, burst(6, 3)),
                input(1, 0, List.of(new Job("later", 9, 2))));
        var expected = inputs.stream().map(simulator::run).toList();
        for (int i = 0; i < inputs.size(); i++) assertThat(simulator.run(inputs.get(i))).isEqualTo(expected.get(i));
        var executor = Executors.newFixedThreadPool(6);
        try {
            List<Callable<QueueCapacityResult>> calls = new ArrayList<>();
            for (int i = 0; i < 12; i++) {
                var next = inputs.get(i % inputs.size());
                calls.add(() -> simulator.run(next));
            }
            var futures = executor.invokeAll(calls, 5, TimeUnit.SECONDS);
            for (int i = 0; i < futures.size(); i++) {
                assertThat(futures.get(i).get()).isEqualTo(expected.get(i % inputs.size()));
            }
        } finally {
            executor.shutdownNow();
            assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test void changingAnUnusedSeedPreservesBehaviorAndRecordsTheActualSeed() {
        var first = simulator.run(input(1, 1, burst(4, 10)));
        for (long seed : new long[] {-9_007_199_254_740_991L, 0, 9_007_199_254_740_991L}) {
            var changed = simulator.run(new QueueCapacityInput("1.0", "1.0.0", 1, 1, burst(4, 10), seed));
            assertThat(changed.seed()).isEqualTo(seed);
            assertThat(changed.events()).isEqualTo(first.events());
            assertThat(changed.outcomes()).isEqualTo(first.outcomes());
            assertThat(changed.metrics()).isEqualTo(first.metrics());
        }
    }

    @Test void eventBudgetStopsBeforeAnyUnemittedTransitionMutatesState() {
        for (int count : new int[] {0, 1, 2, 3, 4, 5, 6, 7}) {
            var result = new QueueCapacitySimulator(new SimulationBudget(count, 60_000, 2_097_152, 0))
                    .run(input(1, 3, burst(4, 10)));
            assertThat(result.status()).isEqualTo("limited");
            assertThat(result.truncationReason()).isEqualTo("event_limit");
            assertThat(result.events()).hasSize(count);
            assertObservedPrefix(result);
            if (count == 0) {
                assertThat(result.metrics().notArrived()).isEqualTo(4);
                assertThat(result.metrics().successfulSamples()).isZero();
                assertThat(result.metrics().meanSuccessfulLatencyMs()).isNull();
                assertThat(result.metrics().meanSuccessfulWaitMs()).isNull();
                assertThat(result.metrics().p95SuccessfulLatencyMs()).isNull();
                assertThat(result.metrics().p95SuccessfulWaitMs()).isNull();
            }
        }
    }

    @Test void virtualTimeBudgetRetainsRunningAndNotArrivedPopulationsWithoutFutureCompletion() {
        var result = new QueueCapacitySimulator(new SimulationBudget(10_000, 5, 2_097_152, 0)).run(input(1, 1,
                List.of(new Job("running", 0, 10), new Job("waiting", 1, 10), new Job("future", 8, 10))));
        assertThat(result.status()).isEqualTo("limited");
        assertThat(result.truncationReason()).isEqualTo("virtual_time_limit");
        assertThat(result.metrics().running()).isEqualTo(1);
        assertThat(result.metrics().queued()).isEqualTo(1);
        assertThat(result.metrics().notArrived()).isEqualTo(1);
        assertThat(result.metrics().completed()).isZero();
        assertThat(result.events()).allMatch(e -> e.timeMs() <= 5);
        assertObservedPrefix(result);
    }

    @Test void virtualTimeBoundaryIsInclusiveAndDoesNotRequireACompletionBeyondIt() {
        var result = new QueueCapacitySimulator(new SimulationBudget(10_000, 10, 2_097_152, 0))
                .run(input(1, 0, List.of(new Job("exact", 0, 10))));
        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.metrics().completed()).isEqualTo(1);
        assertThat(result.lastVirtualTimeMs()).isEqualTo(10);
    }

    @Test void maximumAllowedArrivalCanStartButCannotFabricateAnOutOfBudgetCompletion() {
        var result = simulator.run(input(8, 100, List.of(new Job("last", 60_000, 10_000))));
        assertThat(result.status()).isEqualTo("limited");
        assertThat(result.truncationReason()).isEqualTo("virtual_time_limit");
        assertThat(outcome(result, "last").status()).isEqualTo(Status.RUNNING);
        assertThat(outcome(result, "last").terminalTimeMs()).isNull();
        assertThat(result.metrics().successfulSamples()).isZero();
        assertObservedPrefix(result);
    }

    static void assertObservedPrefix(QueueCapacityResult result) {
        var m = result.metrics();
        assertThat(m.completed() + m.rejected() + m.queued() + m.running() + m.notArrived()).isEqualTo(m.totalJobs());
        assertThat(result.outcomes()).hasSize(m.totalJobs());
        assertThat(result.outcomes().stream().filter(o -> o.status() == Status.COMPLETED).count()).isEqualTo(m.completed());
        assertThat(result.outcomes().stream().filter(o -> o.status() == Status.REJECTED).count()).isEqualTo(m.rejected());
        assertThat(result.outcomes().stream().filter(o -> o.status() == Status.QUEUED).count()).isEqualTo(m.queued());
        assertThat(result.outcomes().stream().filter(o -> o.status() == Status.RUNNING).count()).isEqualTo(m.running());
        assertThat(result.outcomes().stream().filter(o -> o.status() == Status.NOT_ARRIVED).count()).isEqualTo(m.notArrived());
        assertThat(result.events().stream().filter(e -> e.kind() == Kind.COMPLETED).count()).isEqualTo(m.completed());
        assertThat(result.events().stream().filter(e -> e.kind() == Kind.REJECTED).count()).isEqualTo(m.rejected());
        var expectedState = result.events().isEmpty() ? result.initialState() : result.events().get(result.events().size() - 1).state();
        assertThat(result.finalState()).isEqualTo(expectedState);
        assertThat(result.finalState().queuedJobIds()).hasSize(m.queued());
        assertThat(result.finalState().workers().stream().filter(w -> w.jobId() != null).count()).isEqualTo(m.running());
        for (int i = 0; i < result.events().size(); i++) {
            var event = result.events().get(i);
            assertThat(event.sequence()).isEqualTo(i + 1);
            assertThat(event.state().workers()).hasSize(result.initialState().workers().size());
            if (i > 0) assertThat(event.timeMs()).isGreaterThanOrEqualTo(result.events().get(i - 1).timeMs());
        }
        if (!result.events().isEmpty()) {
            assertThat(result.lastVirtualTimeMs()).isEqualTo(result.events().get(result.events().size() - 1).timeMs());
        }
    }

    static Stream<Arguments> invalidInputs() {
        var jobs = burst(1, 10);
        return Stream.of(
                Arguments.of("schema", new QueueCapacityInput("future", "1.0.0", 1, 1, jobs, 7)),
                Arguments.of("model", new QueueCapacityInput("1.0", "future", 1, 1, jobs, 7)),
                Arguments.of("null schema", new QueueCapacityInput(null, "1.0.0", 1, 1, jobs, 7)),
                Arguments.of("null model", new QueueCapacityInput("1.0", null, 1, 1, jobs, 7)),
                Arguments.of("seed below JSON-safe bound", new QueueCapacityInput("1.0", "1.0.0", 1, 1, jobs, -9_007_199_254_740_992L)),
                Arguments.of("seed above JSON-safe bound", new QueueCapacityInput("1.0", "1.0.0", 1, 1, jobs, 9_007_199_254_740_992L)),
                Arguments.of("zero workers", input(0, 1, jobs)), Arguments.of("too many workers", input(9, 1, jobs)),
                Arguments.of("negative capacity", input(1, -1, jobs)), Arguments.of("too much capacity", input(1, 101, jobs)),
                Arguments.of("empty jobs", input(1, 1, List.of())), Arguments.of("too many jobs", input(1, 1, burst(101, 1))),
                Arguments.of("duplicate IDs", input(1, 1, List.of(new Job("same", 0, 1), new Job("same", 1, 1)))),
                Arguments.of("arrival order", input(1, 1, List.of(new Job("one", 2, 1), new Job("two", 1, 1)))),
                Arguments.of("negative arrival", input(1, 1, List.of(new Job("one", -1, 1)))),
                Arguments.of("too late", input(1, 1, List.of(new Job("one", 60_001, 1)))),
                Arguments.of("zero service", input(1, 1, List.of(new Job("one", 0, 0)))),
                Arguments.of("too long service", input(1, 1, List.of(new Job("one", 0, 10_001)))),
                Arguments.of("arrival overflow", input(1, 1, List.of(new Job("one", Long.MAX_VALUE, 1)))),
                Arguments.of("service overflow", input(1, 1, List.of(new Job("one", 0, Long.MAX_VALUE)))),
                Arguments.of("null job ID", input(1, 1, List.of(new Job(null, 0, 1)))),
                Arguments.of("empty job ID", input(1, 1, List.of(new Job("", 0, 1)))),
                Arguments.of("upper case ID", input(1, 1, List.of(new Job("One", 0, 1)))),
                Arguments.of("Unicode ID", input(1, 1, List.of(new Job("雪", 0, 1)))),
                Arguments.of("long ID", input(1, 1, List.of(new Job("j".repeat(33), 0, 1)))),
                Arguments.of("null input", (QueueCapacityInput) null));
    }

    @ParameterizedTest(name = "rejects {0}") @MethodSource("invalidInputs")
    void rejectsInvalidDomainInputs(String name, QueueCapacityInput invalid) {
        assertThatThrownBy(() -> simulator.run(invalid)).as(name).isInstanceOf(IllegalArgumentException.class);
    }

    @Test void rejectsNullJobCollectionsAndElementsAtTheDomainBoundary() {
        assertThatThrownBy(() -> simulator.run(input(1, 1, null))).isInstanceOf(IllegalArgumentException.class);
        var nullable = new ArrayList<Job>(); nullable.add(null);
        assertThatThrownBy(() -> simulator.run(input(1, 1, nullable))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test void rejectsInvalidExecutionBudgetsRatherThanIgnoringTheirBounds() {
        for (SimulationBudget budget : new SimulationBudget[] {
                null, new SimulationBudget(-1, 60_000, 2_097_152, 0),
                new SimulationBudget(10_000, -1, 2_097_152, 0),
                new SimulationBudget(10_000, 60_000, 1, 0)}) {
            assertThatThrownBy(() -> new QueueCapacitySimulator(budget)).isInstanceOf(IllegalArgumentException.class);
        }
    }
}
