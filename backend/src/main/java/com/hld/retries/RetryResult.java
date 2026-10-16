package com.hld.retries;

import java.util.List;

/** Immutable virtual-time evidence. Completion counts server work, not business effects. */
public record RetryResult(String simulationId, String schemaVersion, String modelVersion,
        String kind, String status, RetryInput input, String randomAlgorithm,
        State initialState, List<Event> events, State finalState, Metrics metrics,
        List<String> assumptions) {
    public RetryResult {
        events = List.copyOf(events);
        assumptions = List.copyOf(assumptions);
    }
    public record State(List<RequestState> requests, List<AttemptState> attempts,
            List<WorkerState> workers, List<String> queue, int retryBudgetRemaining) {
        public State {
            requests = List.copyOf(requests);
            attempts = List.copyOf(attempts);
            workers = List.copyOf(workers);
            queue = List.copyOf(queue);
        }
    }
    public record RequestState(String id, int overallDeadlineAtMs, Phase phase, int attemptsSent,
            String activeAttemptId, Integer nextRetryAtMs, Integer finishedAtMs,
            FailureReason failureReason, FailureCause lastFailureCause) {}
    public record AttemptState(String id, String requestId, int number, int sentAtMs,
            CallerState callerState, WorkState workState, Integer startedAtMs,
            Integer completedAtMs, Integer callerFinishedAtMs, Integer timeoutAtMs,
            FailureCause failureCause) {}
    public record WorkerState(String id, String attemptId) {}
    public record Event(int sequence, int timeMs, Kind kind, String requestId, String attemptId,
            Integer delayMs, Integer retryAtMs, Integer proposedRetryAtMs, String explanation,
            State postState) {}
    public record Metrics(int originalRequests, int succeededRequests, int failedRequests,
            int attemptsSent, int retriesSent, int rejectedAttempts, int acceptedServerWork,
            int completedServerWork, int lateCompletions, int attemptTimeouts,
            int retryBudgetUsed, int peakQueueDepth, int peakRunningWork, int finalTimeMs,
            double attemptAmplification, double executionAmplification) {}

    public enum Phase { NOT_ARRIVED, READY, WAITING, DECIDING_RETRY, BACKING_OFF, AWAITING_DEADLINE, SUCCEEDED, FAILED }
    public enum FailureReason { ATTEMPTS_EXHAUSTED, RETRY_BUDGET_EXHAUSTED, OVERALL_DEADLINE }
    public enum FailureCause { DEPENDENCY_UNAVAILABLE, QUEUE_FULL, ATTEMPT_TIMEOUT }
    public enum CallerState { WAITING, REJECTED, TIMED_OUT, DEADLINE_EXCEEDED, RESPONDED }
    public enum WorkState { PENDING_ADMISSION, NOT_ACCEPTED, QUEUED, RUNNING, COMPLETED }
    public enum Kind {
        REQUEST_ARRIVED, ATTEMPT_SENT, WORK_QUEUED, WORK_STARTED, ATTEMPT_REJECTED,
        ATTEMPT_TIMED_OUT, WORK_COMPLETED, RETRY_SCHEDULED, RETRY_BLOCKED_BY_DEADLINE,
        REQUEST_SUCCEEDED, REQUEST_FAILED
    }
}
