package com.hld.retries;

import static com.hld.retries.RetryTestInputs.configured;
import static org.assertj.core.api.Assertions.assertThat;

import com.hld.retries.RetryInput.Backoff;
import com.hld.retries.RetryInput.Request;
import com.hld.retries.RetryResult.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class RetrySchedulingTest {
    private final RetrySimulator simulator = new RetrySimulator();

    @ParameterizedTest @CsvSource({"50,100,50,RESPONDED,SUCCEEDED,0", "50,100,51,TIMED_OUT,FAILED,1",
            "100,50,50,RESPONDED,SUCCEEDED,0", "100,50,51,DEADLINE_EXCEEDED,FAILED,0",
            "50,50,51,DEADLINE_EXCEEDED,FAILED,0"})
    void completionWinsEachSeparateEqualityButOneMillisecondLaterPreservesTheCorrectFailureCause(
            int timeout, int overall, int service, CallerState caller, Phase phase, int timeouts) {
        var result = simulator.run(configured(c -> {
            c.attemptTimeout = timeout; c.overallTimeout = overall; c.maxAttempts = 1;
            c.requests = List.of(new Request("a", 0, service));
        }));
        var request = result.finalState().requests().get(0);
        var attempt = result.finalState().attempts().get(0);
        assertThat(request.phase()).isEqualTo(phase);
        assertThat(attempt.callerState()).isEqualTo(caller);
        assertThat(result.metrics().attemptTimeouts()).isEqualTo(timeouts);
        assertThat(result.metrics().finalTimeMs()).isEqualTo(service);
        assertThat(result.metrics().lateCompletions()).isEqualTo(phase == Phase.FAILED ? 1 : 0);
        if (caller == CallerState.DEADLINE_EXCEEDED) {
            assertThat(request.failureReason()).isEqualTo(FailureReason.OVERALL_DEADLINE);
            assertThat(request.lastFailureCause()).isNull();
            assertThat(attempt.failureCause()).isNull();
        }
    }

    @Test void overallDeadlineIsArrivalRelativeAndDoesNotOverwriteHistoricalTimedOutSiblings() {
        var delayed = simulator.run(configured(c -> {
            c.overallTimeout = 50; c.attemptTimeout = 100; c.maxAttempts = 1;
            c.requests = List.of(new Request("a", 10, 51));
        }));
        assertThat(delayed.initialState().requests().get(0).overallDeadlineAtMs()).isEqualTo(60);
        assertThat(delayed.finalState().requests().get(0).finishedAtMs()).isEqualTo(60);
        var result = simulator.run(configured(c -> { c.overallTimeout = 75; c.maxAttempts = 3; }));
        var first = result.finalState().attempts().get(0);
        var second = result.finalState().attempts().get(1);
        assertThat(first.callerState()).isEqualTo(CallerState.TIMED_OUT);
        assertThat(first.callerFinishedAtMs()).isEqualTo(50);
        assertThat(first.failureCause()).isEqualTo(FailureCause.ATTEMPT_TIMEOUT);
        assertThat(second.callerState()).isEqualTo(CallerState.DEADLINE_EXCEEDED);
        assertThat(second.callerFinishedAtMs()).isEqualTo(75);
        assertThat(second.failureCause()).isNull();
        assertThat(result.metrics().attemptTimeouts()).isEqualTo(1);
        assertThat(result.metrics().completedServerWork()).isEqualTo(2);
    }

    @Test void timedOutQueuedWorkStillStartsInFifoOrderAndDrainsAfterBothCallersFail() {
        var result = simulator.run(configured(c -> {
            c.attemptTimeout = 30; c.maxAttempts = 1;
            c.requests = List.of(new Request("a", 0, 100), new Request("b", 0, 10));
        }));
        var timedOut = result.events().stream().filter(e -> e.kind() == Kind.ATTEMPT_TIMED_OUT && e.requestId().equals("b")).findFirst().orElseThrow();
        assertThat(timedOut.postState().queue()).containsExactly("b-a1");
        var queued = timedOut.postState().attempts().get(1);
        assertThat(queued.callerState()).isEqualTo(CallerState.TIMED_OUT);
        assertThat(queued.workState()).isEqualTo(WorkState.QUEUED);
        assertThat(queued.timeoutAtMs()).isEqualTo(30);
        assertThat(result.finalState().attempts()).extracting(AttemptState::startedAtMs).containsExactly(0, 100);
        assertThat(result.finalState().attempts()).extracting(AttemptState::completedAtMs).containsExactly(100, 110);
        assertThat(result.metrics().lateCompletions()).isEqualTo(2);
        assertThat(result.metrics().finalTimeMs()).isEqualTo(110);
    }

    @Test void originalsAtTheSameTimePrecedeRetriesEvenWhenTheRetryRequestHasLowerInputIndex() {
        var result = simulator.run(configured(c -> {
            c.unavailable = 10; c.attemptTimeout = 20; c.overallTimeout = 100; c.queue = 1;
            c.backoff = Backoff.EXPONENTIAL; c.base = 10; c.cap = 10;
            c.requests = List.of(new Request("a", 0, 5), new Request("b", 10, 5));
        }));
        assertThat(result.events().stream().filter(e -> e.kind() == Kind.ATTEMPT_SENT && e.timeMs() == 10).toList())
                .extracting(Event::attemptId).containsExactly("b-a1", "a-a2");
        assertThat(result.events().stream().filter(e -> e.kind() == Kind.WORK_STARTED).toList())
                .extracting(Event::attemptId).containsExactly("b-a1", "a-a2");
        assertThat(result.metrics().succeededRequests()).isEqualTo(2);
        assertThat(result.metrics().finalTimeMs()).isEqualTo(20);
    }

    @Test void completionPromotesExistingFifoWaiterBeforeANewEqualTimeArrival() {
        var result = simulator.run(configured(c -> {
            c.queue = 1; c.attemptTimeout = 100; c.maxAttempts = 1;
            c.requests = List.of(new Request("a", 0, 10), new Request("b", 0, 10), new Request("c", 10, 10));
        }));
        assertThat(result.events().stream().filter(e -> e.kind() == Kind.WORK_STARTED).toList())
                .extracting(Event::attemptId).containsExactly("a-a1", "b-a1", "c-a1");
        assertThat(result.finalState().attempts()).extracting(AttemptState::startedAtMs).containsExactly(0, 10, 20);
        assertThat(result.metrics().succeededRequests()).isEqualTo(3);
    }

    @Test void lowestIdleWorkerIsChosenAndQueueCapacityExcludesRunningWork() {
        var result = simulator.run(configured(c -> {
            c.workers = 3; c.queue = 0; c.attemptTimeout = 100; c.maxAttempts = 1;
            c.requests = List.of(new Request("a", 0, 10), new Request("b", 0, 20), new Request("c", 0, 30));
        }));
        var starts = result.events().stream().filter(e -> e.kind() == Kind.WORK_STARTED).toList();
        assertThat(starts).hasSize(3);
        for (int i = 0; i < 3; i++) {
            assertThat(starts.get(i).postState().workers().get(i).id()).isEqualTo("worker-" + (i + 1));
            assertThat(starts.get(i).postState().workers().get(i).attemptId()).isEqualTo(starts.get(i).attemptId());
        }
        assertThat(result.metrics().peakRunningWork()).isEqualTo(3);
        assertThat(result.metrics().peakQueueDepth()).isZero();
    }

    @Test void maxAttemptsPrecedesBudgetAndOriginalsNeverConsumeTokens() {
        for (int maximum : List.of(1, 2)) {
            var result = simulator.run(configured(c -> { c.budget = 0; c.maxAttempts = maximum; c.unavailable = 100; }));
            assertThat(result.metrics().attemptsSent()).isEqualTo(1);
            assertThat(result.metrics().retryBudgetUsed()).isZero();
            assertThat(result.finalState().requests().get(0).failureReason()).isEqualTo(maximum == 1
                    ? FailureReason.ATTEMPTS_EXHAUSTED : FailureReason.RETRY_BUDGET_EXHAUSTED);
            assertThat(result.events()).noneSatisfy(e -> assertThat(e.kind()).isEqualTo(Kind.RETRY_SCHEDULED));
        }
    }

    @Test void dependencyRecoveryEqualityAdmitsAndFutureOriginalArrivalsPreventPrematureStop() {
        var result = simulator.run(configured(c -> {
            c.unavailable = 10; c.maxAttempts = 1; c.attemptTimeout = 100;
            c.requests = List.of(new Request("a", 0, 5), new Request("b", 10, 5));
        }));
        assertThat(result.finalState().requests()).extracting(RequestState::phase).containsExactly(Phase.FAILED, Phase.SUCCEEDED);
        assertThat(result.metrics().finalTimeMs()).isEqualTo(15);
        assertThat(result.metrics().acceptedServerWork()).isEqualTo(1);
    }
    @Test void aLaterDispatchRechecksBudgetEvenAfterDependencyRecovery() {
        var result = simulator.run(configured(c -> {
            c.unavailable = 45; c.overallTimeout = 200; c.budget = 1; c.maxAttempts = 3;
            c.backoff = Backoff.EXPONENTIAL; c.base = 40; c.cap = 80;
            c.requests = List.of(new Request("a", 0, 20), new Request("b", 10, 20));
        }));
        assertThat(result.finalState().attempts()).extracting(AttemptState::id).containsExactly("a-a1", "b-a1", "a-a2");
        assertThat(result.finalState().requests()).extracting(RequestState::finishedAtMs).containsExactly(40, 50);
        assertThat(result.finalState().requests()).allSatisfy(r ->
                assertThat(r.failureReason()).isEqualTo(FailureReason.RETRY_BUDGET_EXHAUSTED));
        assertThat(result.metrics().acceptedServerWork()).isZero();
        assertThat(result.metrics().finalTimeMs()).isEqualTo(50);
    }

    @Test void aRetryExactlyAtTheOverallDeadlineIsBlockedAndBackoffCapsSaturate() {
        var equal = simulator.run(configured(c -> {
            c.unavailable = 60; c.overallTimeout = 40; c.maxAttempts = 3;
            c.backoff = Backoff.EXPONENTIAL; c.base = 40; c.cap = 80;
        }));
        assertThat(equal.metrics().attemptsSent()).isEqualTo(1);
        assertThat(equal.events().stream().filter(e -> e.kind() == Kind.RETRY_BLOCKED_BY_DEADLINE).findFirst().orElseThrow()
                .proposedRetryAtMs()).isEqualTo(40);
        assertThat(equal.finalState().requests().get(0).finishedAtMs()).isEqualTo(40);
        var capped = simulator.run(configured(c -> {
            c.unavailable = 10000; c.overallTimeout = 10000; c.maxAttempts = 5;
            c.backoff = Backoff.EXPONENTIAL; c.base = 400; c.cap = 500;
        }));
        assertThat(capped.events().stream().filter(e -> e.kind() == Kind.RETRY_SCHEDULED).toList())
                .extracting(Event::delayMs).containsExactly(400, 500, 500, 500);
        assertThat(capped.finalState().attempts()).extracting(AttemptState::sentAtMs).containsExactly(0, 400, 900, 1400, 1900);
    }

}
