package com.hld.retries;

import static com.hld.retries.RetryTestInputs.configured;
import static com.hld.retries.RetryTestInputs.preset;
import static org.assertj.core.api.Assertions.assertThat;

import com.hld.retries.RetryInput.Backoff;
import com.hld.retries.RetryInput.Jitter;
import com.hld.retries.RetryResult.*;
import java.util.List;
import org.junit.jupiter.api.Test;

class RetrySimulatorTest {
    private final RetrySimulator simulator = new RetrySimulator();
    private RetryResult run(String id) { return simulator.run(preset(id)); }
    private static RequestState request(State state, String id) {
        return state.requests().stream().filter(r -> r.id().equals(id)).findFirst().orElseThrow();
    }
    private static AttemptState attempt(State state, String id) {
        return state.attempts().stream().filter(a -> a.id().equals(id)).findFirst().orElseThrow();
    }
    private static Event event(RetryResult result, Kind kind, String attemptId) {
        return result.events().stream().filter(e -> e.kind() == kind && java.util.Objects.equals(e.attemptId(), attemptId))
                .findFirst().orElseThrow();
    }
    private static void metrics(RetryResult result, int originals, int success, int failed, int attempts,
            int retries, int rejected, int accepted, int completed, int late, int timeouts, int budget,
            int queue, int running, int finalTime, double attemptRatio, double executionRatio) {
        assertThat(result.metrics()).isEqualTo(new Metrics(originals, success, failed, attempts, retries,
                rejected, accepted, completed, late, timeouts, budget, queue, running, finalTime, attemptRatio, executionRatio));
    }

    @Test void timedOutCallersLeaveAcceptedWorkRunningAndQueuedUntilBothLateCompletions() {
        var result = run("late-work");
        metrics(result, 1, 0, 1, 2, 1, 0, 2, 2, 2, 2, 1, 1, 1, 160, 2, 2);
        assertThat(result.events()).extracting(Event::timeMs).containsExactly(0, 0, 0, 50, 50, 50, 50, 80, 80, 100, 100, 160);
        assertThat(result.events()).extracting(Event::kind).containsExactly(Kind.REQUEST_ARRIVED, Kind.ATTEMPT_SENT,
                Kind.WORK_STARTED, Kind.ATTEMPT_TIMED_OUT, Kind.RETRY_SCHEDULED, Kind.ATTEMPT_SENT,
                Kind.WORK_QUEUED, Kind.WORK_COMPLETED, Kind.WORK_STARTED, Kind.ATTEMPT_TIMED_OUT,
                Kind.REQUEST_FAILED, Kind.WORK_COMPLETED);
        var timeout = event(result, Kind.ATTEMPT_TIMED_OUT, "a-a1");
        assertThat(attempt(timeout.postState(), "a-a1").workState()).isEqualTo(WorkState.RUNNING);
        assertThat(request(timeout.postState(), "a").phase()).isEqualTo(Phase.DECIDING_RETRY);
        assertThat(request(timeout.postState(), "a").activeAttemptId()).isNull();
        var lateOriginal = event(result, Kind.WORK_COMPLETED, "a-a1");
        assertThat(request(lateOriginal.postState(), "a").activeAttemptId()).isEqualTo("a-a2");
        assertThat(request(lateOriginal.postState(), "a").phase()).isEqualTo(Phase.WAITING);
        assertThat(attempt(lateOriginal.postState(), "a-a1").callerState()).isEqualTo(CallerState.TIMED_OUT);
        assertThat(attempt(lateOriginal.postState(), "a-a2").callerState()).isEqualTo(CallerState.WAITING);
        var finalRequest = request(result.finalState(), "a");
        assertThat(finalRequest.finishedAtMs()).isEqualTo(100);
        assertThat(finalRequest.failureReason()).isEqualTo(FailureReason.ATTEMPTS_EXHAUSTED);
        assertThat(finalRequest.lastFailureCause()).isEqualTo(FailureCause.ATTEMPT_TIMEOUT);
        assertThat(result.finalState().attempts()).allSatisfy(a -> {
            assertThat(a.callerState()).isEqualTo(CallerState.TIMED_OUT);
            assertThat(a.workState()).isEqualTo(WorkState.COMPLETED);
        });
    }

    @Test void aLongerCallerTimeoutAvoidsTheRetryHereAndNoopTimersDoNotExtendFinalTime() {
        var result = run("healthy-timeout");
        metrics(result, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 80, 1, 1);
        assertThat(result.events()).extracting(Event::kind).containsExactly(Kind.REQUEST_ARRIVED, Kind.ATTEMPT_SENT,
                Kind.WORK_STARTED, Kind.WORK_COMPLETED, Kind.REQUEST_SUCCEEDED);
        var completion = event(result, Kind.WORK_COMPLETED, "a-a1");
        assertThat(attempt(completion.postState(), "a-a1").callerState()).isEqualTo(CallerState.WAITING);
        assertThat(request(result.finalState(), "a").phase()).isEqualTo(Phase.SUCCEEDED);
        assertThat(attempt(result.finalState(), "a-a1").callerFinishedAtMs()).isEqualTo(80);
    }

    @Test void zeroWaitingCapacityRejectsTheRetryButPermitsTheOriginalIdleWorkerStart() {
        var result = run("queue-full");
        metrics(result, 1, 0, 1, 2, 1, 1, 1, 1, 1, 1, 1, 0, 1, 80, 2, 1);
        var rejected = attempt(result.finalState(), "a-a2");
        assertThat(rejected.workState()).isEqualTo(WorkState.NOT_ACCEPTED);
        assertThat(rejected.callerState()).isEqualTo(CallerState.REJECTED);
        assertThat(rejected.failureCause()).isEqualTo(FailureCause.QUEUE_FULL);
        assertThat(rejected.timeoutAtMs()).isNull();
        assertThat(rejected.startedAtMs()).isNull();
        assertThat(rejected.completedAtMs()).isNull();
        assertThat(request(result.finalState(), "a").lastFailureCause()).isEqualTo(FailureCause.QUEUE_FULL);
    }

    @Test void immediateRetriesExhaustAttemptsDuringAnOutageWithoutCreatingServerWork() {
        var result = run("immediate-outage");
        metrics(result, 1, 0, 1, 3, 2, 3, 0, 0, 0, 0, 2, 0, 0, 0, 3, 0);
        assertThat(result.events()).allSatisfy(e -> assertThat(e.timeMs()).isZero());
        assertThat(result.finalState().attempts()).allSatisfy(a -> {
            assertThat(a.workState()).isEqualTo(WorkState.NOT_ACCEPTED);
            assertThat(a.failureCause()).isEqualTo(FailureCause.DEPENDENCY_UNAVAILABLE);
        });
    }

    @Test void exponentialBackoffCrossesRecoveryAndRetainsActualEarlierFailureHistoryOnSuccess() {
        var result = run("backoff-recovery");
        metrics(result, 1, 1, 0, 3, 2, 2, 1, 1, 0, 0, 2, 0, 1, 140, 3, 1);
        assertThat(result.finalState().attempts()).extracting(AttemptState::sentAtMs).containsExactly(0, 40, 120);
        assertThat(result.events().stream().filter(e -> e.kind() == Kind.RETRY_SCHEDULED).toList())
                .extracting(Event::delayMs).containsExactly(40, 80);
        assertThat(request(result.finalState(), "a").failureReason()).isNull();
        assertThat(request(result.finalState(), "a").lastFailureCause()).isEqualTo(FailureCause.DEPENDENCY_UNAVAILABLE);
        assertThat(attempt(result.finalState(), "a-a1").callerFinishedAtMs()).isZero();
        assertThat(attempt(result.finalState(), "a-a2").callerFinishedAtMs()).isEqualTo(40);
    }

    @Test void aRetryBeyondTheOverallDeadlineHasObservableWaitingButNoPhantomAttempt() {
        var result = run("deadline-before-retry");
        metrics(result, 1, 0, 1, 2, 1, 2, 0, 0, 0, 0, 1, 0, 0, 100, 2, 0);
        var blocked = result.events().stream().filter(e -> e.kind() == Kind.RETRY_BLOCKED_BY_DEADLINE).findFirst().orElseThrow();
        assertThat(blocked.timeMs()).isEqualTo(40);
        assertThat(blocked.delayMs()).isEqualTo(80);
        assertThat(blocked.proposedRetryAtMs()).isEqualTo(120);
        assertThat(blocked.retryAtMs()).isNull();
        var waiting = request(blocked.postState(), "a");
        assertThat(waiting.phase()).isEqualTo(Phase.AWAITING_DEADLINE);
        assertThat(waiting.activeAttemptId()).isNull();
        assertThat(waiting.nextRetryAtMs()).isNull();
        assertThat(waiting.finishedAtMs()).isNull();
        assertThat(result.finalState().attempts()).hasSize(2);
        assertThat(request(result.finalState(), "a").failureReason()).isEqualTo(FailureReason.OVERALL_DEADLINE);
        assertThat(result.finalState().attempts()).extracting(AttemptState::callerFinishedAtMs).containsExactly(0, 40);
    }

    @Test void sharedBudgetIsConsumedAtDispatchAndDeniedDispatchCreatesNoAttemptRow() {
        var result = run("retry-budget");
        metrics(result, 2, 0, 2, 3, 1, 3, 0, 0, 0, 0, 1, 0, 0, 40, 1.5, 0);
        assertThat(result.events().stream().filter(e -> e.kind() == Kind.RETRY_SCHEDULED).toList()).hasSize(2);
        assertThat(result.finalState().attempts()).extracting(AttemptState::id).containsExactly("a-a1", "b-a1", "a-a2");
        assertThat(result.finalState().requests()).allSatisfy(r -> {
            assertThat(r.failureReason()).isEqualTo(FailureReason.RETRY_BUDGET_EXHAUSTED);
            assertThat(r.finishedAtMs()).isEqualTo(40);
        });
        assertThat(result.finalState().retryBudgetRemaining()).isZero();
    }

    @Test void fullJitterReplaysExactlyUsesTheRecordedBoundAndDoesNotResetTheStreamPerCaller() {
        var input = preset("jittered-recovery");
        var expected = simulator.run(input);
        assertThat(simulator.run(input)).isEqualTo(expected);
        assertThat(expected.randomAlgorithm()).isNotBlank();
        var plans = expected.events().stream().filter(e -> e.kind() == Kind.RETRY_SCHEDULED || e.kind() == Kind.RETRY_BLOCKED_BY_DEADLINE).toList();
        assertThat(plans).isNotEmpty();
        for (var e : plans) {
            int attemptNumber = attempt(e.postState(), e.attemptId()).number();
            int cap = Math.min(input.maxDelayMs(), input.baseDelayMs() * (1 << (attemptNumber - 1)));
            assertThat(e.delayMs()).isBetween(0, cap);
            assertThat(e.retryAtMs() != null ? e.retryAtMs() : e.proposedRetryAtMs()).isEqualTo(e.timeMs() + e.delayMs());
        }
        var changed = configured(c -> {
            c.seed = 43L; c.requests = input.requests(); c.unavailable = input.unavailableUntilMs();
            c.attemptTimeout = input.attemptTimeoutMs(); c.overallTimeout = input.overallTimeoutMs();
            c.maxAttempts = input.maxAttempts(); c.backoff = Backoff.EXPONENTIAL; c.base = 40; c.cap = 80;
            c.jitter = Jitter.FULL; c.budget = input.retryBudget();
        });
        assertThat(simulator.run(changed).events()).isNotEqualTo(expected.events());
        assertThat(simulator.run(input)).isEqualTo(expected);
        // No ordering or success-improvement claim is inferred from changing the seed.
        var random = new com.hld.simulation.engine.SeededRandom(input.seed());
        var initialPlans = plans.stream().filter(e -> e.timeMs() == 0 && e.postState().attempts().stream()
                .filter(a -> a.id().equals(e.attemptId())).findFirst().orElseThrow().number() == 1).toList();
        assertThat(initialPlans).hasSize(2);
        assertThat(initialPlans.get(0).delayMs()).isEqualTo(random.nextInt(41));
        assertThat(initialPlans.get(1).delayMs()).isEqualTo(random.nextInt(41));
    }
}
