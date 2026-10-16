package com.hld.retries;

import com.hld.retries.RetryResult.AttemptState;
import com.hld.retries.RetryResult.CallerState;
import com.hld.retries.RetryResult.Event;
import com.hld.retries.RetryResult.FailureCause;
import com.hld.retries.RetryResult.FailureReason;
import com.hld.retries.RetryResult.Kind;
import com.hld.retries.RetryResult.Metrics;
import com.hld.retries.RetryResult.Phase;
import com.hld.retries.RetryResult.RequestState;
import com.hld.retries.RetryResult.State;
import com.hld.retries.RetryResult.WorkerState;
import com.hld.retries.RetryResult.WorkState;
import com.hld.simulation.engine.SeededRandom;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.PriorityQueue;

/** Pure bounded virtual-time execution. Every mutable object belongs to one invocation. */
public final class RetrySimulator {
    public static final String SIMULATION_ID = "timeouts-retries";
    public static final List<String> ASSUMPTIONS = List.of(
            "This illustrative model separates a caller's waiting from accepted server work; it does not model business effects or durable storage.",
            "Authored arrivals and per-request service times determine work; networking and response delivery take zero time.",
            "Attempt timeout begins at send and includes queue wait. Timeout and overall deadline never cancel accepted queued or running work.",
            "Server workers run accepted work to completion in FIFO order; queue capacity excludes running work and idle workers can start with queue capacity zero.",
            "Dependency unavailability and a full waiting queue reject immediately without accepting server work.",
            "Only a response to the currently waiting attempt can succeed its logical request. Late completions cannot revive a caller or satisfy a newer attempt.",
            "Completion wins equality with the overall deadline or attempt timeout; overall deadline wins equality with attempt timeout.",
            "Existing FIFO work is promoted before same-time arrivals, and original sends precede same-time retry sends.",
            "Maximum attempts includes the original. The finite batch retry budget is consumed only by dispatched retries, including immediately rejected ones.",
            "Exponential backoff is capped; FULL jitter draws an inclusive integer delay from one run-local versioned seeded generator.",
            "A proposed retry at or after its arrival-relative overall deadline is not scheduled; the caller waits until that deadline to fail.",
            "All accepted server work drains before the result ends. No-op future timers do not extend the reported final time.",
            "Cancellation, idempotency, actual networking, retry trees, persistence and production latency measurements are excluded.");

    public RetryResult run(RetryInput input) {
        RetryValidator.validate(input);
        return new Execution(input).run();
    }

    private enum CallbackKind { COMPLETE, OVERALL_DEADLINE, ATTEMPT_TIMEOUT, ORIGINAL_SEND, RETRY_SEND }
    private record Callback(int time, CallbackKind kind, int requestIndex, int attemptNumber,
            int insertion, Caller caller, Attempt attempt) {}

    private static final class Execution {
        private final RetryInput input;
        private final SeededRandom random;
        private final List<Caller> callers = new ArrayList<>();
        private final List<Attempt> attempts = new ArrayList<>();
        private final List<Worker> workers = new ArrayList<>();
        private final ArrayDeque<Attempt> queue = new ArrayDeque<>();
        private final List<Event> events = new ArrayList<>();
        private final PriorityQueue<Callback> callbacks = new PriorityQueue<>(Comparator
                .comparingInt(Callback::time).thenComparingInt(c -> c.kind().ordinal())
                .thenComparingInt(Callback::requestIndex).thenComparingInt(Callback::attemptNumber)
                .thenComparingInt(Callback::insertion));
        private int now;
        private int callbackCount;
        private int budget;
        private int accepted;
        private int completed;
        private int rejected;
        private int timeouts;
        private int late;
        private int peakQueue;
        private int peakRunning;

        private Execution(RetryInput input) {
            this.input = input;
            random = new SeededRandom(input.seed());
            budget = input.retryBudget();
            for (int i = 0; i < input.requests().size(); i++) {
                var caller = new Caller(i, input.requests().get(i), input.overallTimeoutMs());
                callers.add(caller);
                schedule(caller.request.arrivalTimeMs(), CallbackKind.ORIGINAL_SEND, caller, null, 1);
                schedule(caller.deadline, CallbackKind.OVERALL_DEADLINE, caller, null, 0);
            }
            for (int i = 1; i <= input.workers(); i++) workers.add(new Worker("worker-" + i));
        }

        private RetryResult run() {
            State initial = snapshot();
            while (!finished()) {
                Callback callback = callbacks.poll();
                if (callback == null) throw new IllegalStateException("Retry execution has unfinished work without a callback");
                now = callback.time();
                switch (callback.kind()) {
                    case ORIGINAL_SEND -> arrive(callback.caller());
                    case RETRY_SEND -> retry(callback.caller(), callback.time(), callback.attemptNumber());
                    case ATTEMPT_TIMEOUT -> timeout(callback.attempt());
                    case OVERALL_DEADLINE -> deadline(callback.caller());
                    case COMPLETE -> complete(callback.attempt());
                }
            }
            int successes = (int) callers.stream().filter(c -> c.phase == Phase.SUCCEEDED).count();
            int originals = callers.size();
            int finalTime = events.isEmpty() ? 0 : events.get(events.size() - 1).timeMs();
            var metrics = new Metrics(originals, successes, originals - successes, attempts.size(),
                    attempts.size() - originals, rejected, accepted, completed, late, timeouts,
                    input.retryBudget() - budget, peakQueue, peakRunning, finalTime,
                    (double) attempts.size() / originals, (double) completed / originals);
            return new RetryResult(SIMULATION_ID, RetryInput.SCHEMA_VERSION, RetryInput.MODEL_VERSION,
                    "simulation", "completed", input, random.algorithm(), initial, events, snapshot(), metrics, ASSUMPTIONS);
        }

        private boolean finished() {
            return completed == accepted && callers.stream().allMatch(Caller::terminal);
        }

        private void arrive(Caller caller) {
            if (caller.phase != Phase.NOT_ARRIVED) return;
            caller.phase = Phase.READY;
            emit(Kind.REQUEST_ARRIVED, caller, null, null, null, null,
                    caller.request.id() + " arrives. Its overall deadline is " + caller.deadline + " ms.");
            send(caller);
        }

        private void retry(Caller caller, int retryAt, int attemptNumber) {
            if (caller.phase != Phase.BACKING_OFF || caller.nextRetryAt == null
                    || caller.nextRetryAt != retryAt || caller.sent + 1 != attemptNumber) return;
            caller.nextRetryAt = null;
            if (now >= caller.deadline) {
                deadline(caller);
                return;
            }
            if (budget == 0) {
                fail(caller, FailureReason.RETRY_BUDGET_EXHAUSTED,
                        "The shared retry budget is exhausted at dispatch; no new attempt was sent.");
                return;
            }
            budget--;
            send(caller);
        }

        private void send(Caller caller) {
            Attempt attempt = new Attempt(caller, ++caller.sent, now);
            attempts.add(attempt);
            caller.phase = Phase.WAITING;
            caller.active = attempt;
            caller.nextRetryAt = null;
            emit(Kind.ATTEMPT_SENT, caller, attempt, null, null, null,
                    attempt.id + " is sent at " + now + " ms; server admission has not yet decided.");
            if (now < input.unavailableUntilMs()) {
                reject(attempt, FailureCause.DEPENDENCY_UNAVAILABLE);
                return;
            }
            Worker idle = idleWorker();
            if (idle == null && queue.size() >= input.queueCapacity()) {
                reject(attempt, FailureCause.QUEUE_FULL);
                return;
            }
            accepted++;
            attempt.timeoutAt = now + input.attemptTimeoutMs();
            schedule(attempt.timeoutAt, CallbackKind.ATTEMPT_TIMEOUT, caller, attempt, attempt.number);
            if (idle != null) {
                start(attempt, idle);
            } else {
                attempt.work = WorkState.QUEUED;
                queue.addLast(attempt);
                peakQueue = Math.max(peakQueue, queue.size());
                emit(Kind.WORK_QUEUED, caller, attempt, null, null, null,
                        attempt.id + " is accepted into FIFO waiting. Its caller timeout is " + attempt.timeoutAt + " ms.");
            }
        }

        private void reject(Attempt attempt, FailureCause cause) {
            attempt.work = WorkState.NOT_ACCEPTED;
            attempt.callerState = CallerState.REJECTED;
            attempt.callerFinishedAt = now;
            attempt.failureCause = cause;
            rejected++;
            stopWaiting(attempt.caller, cause);
            emit(Kind.ATTEMPT_REJECTED, attempt.caller, attempt, null, null, null,
                    attempt.id + " is rejected with " + cause + "; no server work was accepted.");
            decide(attempt.caller, attempt);
        }

        private void timeout(Attempt attempt) {
            Caller caller = attempt.caller;
            if (attempt.callerState != CallerState.WAITING || caller.phase != Phase.WAITING || caller.active != attempt) return;
            attempt.callerState = CallerState.TIMED_OUT;
            attempt.callerFinishedAt = now;
            attempt.failureCause = FailureCause.ATTEMPT_TIMEOUT;
            timeouts++;
            stopWaiting(caller, FailureCause.ATTEMPT_TIMEOUT);
            emit(Kind.ATTEMPT_TIMED_OUT, caller, attempt, null, null, null,
                    attempt.id + " reaches its caller timeout at " + now + " ms. Accepted server work remains " + attempt.work + ".");
            decide(caller, attempt);
        }

        private void stopWaiting(Caller caller, FailureCause cause) {
            caller.active = null;
            caller.nextRetryAt = null;
            caller.lastFailure = cause;
            caller.phase = Phase.DECIDING_RETRY;
        }

        private void decide(Caller caller, Attempt failedAttempt) {
            if (caller.sent >= input.maxAttempts()) {
                fail(caller, FailureReason.ATTEMPTS_EXHAUSTED, "Maximum attempts includes the original; no further attempt is allowed.");
                return;
            }
            if (budget == 0) {
                fail(caller, FailureReason.RETRY_BUDGET_EXHAUSTED, "The shared retry budget has no token for another attempt.");
                return;
            }
            int cap = input.backoff() == RetryInput.Backoff.IMMEDIATE ? 0
                    : Math.min(input.maxDelayMs(), input.baseDelayMs() * (1 << (caller.sent - 1)));
            int delay = input.jitter() == RetryInput.Jitter.FULL ? random.nextInt(cap + 1) : cap;
            int retryAt = now + delay;
            if (retryAt >= caller.deadline) {
                caller.phase = Phase.AWAITING_DEADLINE;
                emit(Kind.RETRY_BLOCKED_BY_DEADLINE, caller, failedAttempt, delay, null, retryAt,
                        "Chosen delay " + delay + " ms proposes " + retryAt + " ms, at or after overall deadline "
                                + caller.deadline + " ms. No retry is scheduled; wait for the actual deadline.");
            } else {
                caller.phase = Phase.BACKING_OFF;
                caller.nextRetryAt = retryAt;
                schedule(retryAt, CallbackKind.RETRY_SEND, caller, null, caller.sent + 1);
                emit(Kind.RETRY_SCHEDULED, caller, failedAttempt, delay, retryAt, null,
                        "Chosen delay " + delay + " ms schedules a retry at " + retryAt
                                + " ms. Its budget token is checked and consumed only at dispatch.");
            }
        }

        private void deadline(Caller caller) {
            if (caller.terminal()) return;
            if (caller.active != null && caller.active.callerState == CallerState.WAITING) {
                caller.active.callerState = CallerState.DEADLINE_EXCEEDED;
                caller.active.callerFinishedAt = now;
            }
            fail(caller, FailureReason.OVERALL_DEADLINE,
                    "The overall deadline stops caller waiting and future retries; accepted server work continues.");
        }

        private void fail(Caller caller, FailureReason reason, String explanation) {
            caller.phase = Phase.FAILED;
            caller.finishedAt = now;
            caller.failure = reason;
            caller.active = null;
            caller.nextRetryAt = null;
            emit(Kind.REQUEST_FAILED, caller, null, null, null, null, explanation);
        }

        private void start(Attempt attempt, Worker worker) {
            worker.attempt = attempt;
            attempt.work = WorkState.RUNNING;
            attempt.startedAt = now;
            peakRunning = Math.max(peakRunning, (int) workers.stream().filter(w -> w.attempt != null).count());
            schedule(now + attempt.caller.request.serviceTimeMs(), CallbackKind.COMPLETE,
                    attempt.caller, attempt, attempt.number);
            emit(Kind.WORK_STARTED, attempt.caller, attempt, null, null, null,
                    attempt.id + " starts on " + worker.id + " at " + now + " ms. Caller state is " + attempt.callerState + ".");
        }

        private void complete(Attempt attempt) {
            if (attempt.work != WorkState.RUNNING) return;
            Worker worker = workers.stream().filter(w -> w.attempt == attempt).findFirst().orElseThrow();
            worker.attempt = null;
            attempt.work = WorkState.COMPLETED;
            attempt.completedAt = now;
            completed++;
            Caller caller = attempt.caller;
            boolean onTime = attempt.callerState == CallerState.WAITING && caller.phase == Phase.WAITING && caller.active == attempt;
            if (!onTime) late++;
            emit(Kind.WORK_COMPLETED, caller, attempt, null, null, null,
                    attempt.id + " completes server work at " + now + " ms. "
                            + (onTime ? "Its current caller is still waiting." : "Its caller is no longer waiting; this completion is late."));
            if (onTime) {
                attempt.callerState = CallerState.RESPONDED;
                attempt.callerFinishedAt = now;
                caller.phase = Phase.SUCCEEDED;
                caller.finishedAt = now;
                caller.active = null;
                caller.nextRetryAt = null;
                emit(Kind.REQUEST_SUCCEEDED, caller, null, null, null, null,
                        caller.request.id() + " succeeds from its waiting attempt's response at " + now + " ms.");
            }
            while (!queue.isEmpty()) {
                Worker idle = idleWorker();
                if (idle == null) break;
                start(queue.removeFirst(), idle);
            }
        }

        private Worker idleWorker() {
            return workers.stream().filter(worker -> worker.attempt == null).findFirst().orElse(null);
        }

        private void schedule(int time, CallbackKind kind, Caller caller, Attempt attempt, int number) {
            if (time < now || time > RetryInput.MAX_VIRTUAL_TIME_MS || callbackCount >= RetryInput.MAX_CALLBACKS)
                throw new IllegalStateException("Retry callback exceeded its proven finite execution bounds");
            callbacks.add(new Callback(time, kind, caller.index, number, callbackCount++, caller, attempt));
        }

        private void emit(Kind kind, Caller caller, Attempt attempt, Integer delay,
                Integer retryAt, Integer proposedRetryAt, String explanation) {
            if (events.size() >= RetryInput.MAX_EVENTS)
                throw new IllegalStateException("Retry events exceeded their proven finite bound");
            events.add(new Event(events.size() + 1, now, kind, caller.request.id(),
                    attempt == null ? null : attempt.id, delay, retryAt, proposedRetryAt, explanation, snapshot()));
        }

        private State snapshot() {
            return new State(callers.stream().map(c -> new RequestState(c.request.id(), c.deadline,
                    c.phase, c.sent, c.active == null ? null : c.active.id, c.nextRetryAt,
                    c.finishedAt, c.failure, c.lastFailure)).toList(),
                    attempts.stream().map(a -> new AttemptState(a.id, a.caller.request.id(), a.number,
                            a.sentAt, a.callerState, a.work, a.startedAt, a.completedAt,
                            a.callerFinishedAt, a.timeoutAt, a.failureCause)).toList(),
                    workers.stream().map(w -> new WorkerState(w.id, w.attempt == null ? null : w.attempt.id)).toList(),
                    queue.stream().map(a -> a.id).toList(), budget);
        }
    }

    private static final class Caller {
        private final int index;
        private final RetryInput.Request request;
        private final int deadline;
        private Phase phase = Phase.NOT_ARRIVED;
        private int sent;
        private Attempt active;
        private Integer nextRetryAt;
        private Integer finishedAt;
        private FailureReason failure;
        private FailureCause lastFailure;
        private Caller(int index, RetryInput.Request request, int overallTimeout) {
            this.index = index;
            this.request = request;
            deadline = request.arrivalTimeMs() + overallTimeout;
        }
        private boolean terminal() { return phase == Phase.SUCCEEDED || phase == Phase.FAILED; }
    }

    private static final class Attempt {
        private final String id;
        private final Caller caller;
        private final int number;
        private final int sentAt;
        private CallerState callerState = CallerState.WAITING;
        private WorkState work = WorkState.PENDING_ADMISSION;
        private Integer startedAt;
        private Integer completedAt;
        private Integer callerFinishedAt;
        private Integer timeoutAt;
        private FailureCause failureCause;
        private Attempt(Caller caller, int number, int sentAt) {
            this.caller = caller;
            this.number = number;
            this.sentAt = sentAt;
            id = caller.request.id() + "-a" + number;
        }
    }
    private static final class Worker {
        private final String id;
        private Attempt attempt;
        private Worker(String id) { this.id = id; }
    }
}
