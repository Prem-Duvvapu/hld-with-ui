package com.hld.queues;

import com.hld.queues.QueueCapacityEvent.Kind;
import com.hld.queues.QueueCapacityOutcome.Status;
import com.hld.queues.QueueCapacityState.Worker;
import com.hld.simulation.engine.BudgetExceededException;
import com.hld.simulation.engine.SimulationBudget;
import com.hld.simulation.engine.SimulationContext;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** Plain Java shared-queue model. No routing, durability, acknowledgment, retries or random work. */
public final class QueueCapacitySimulator {
    public static final String SIMULATION_ID = "queues-tail-latency";
    public static final String MODEL_VERSION = QueueCapacityInput.MODEL_VERSION;
    public static final int MAX_JOBS = 100;
    public static final int MAX_WORKERS = 8;
    public static final int MAX_QUEUE_CAPACITY = 100;
    public static final long MAX_ARRIVAL_TIME_MS = 60_000;
    public static final long MAX_SERVICE_TIME_MS = 10_000;
    public static final long MAX_ABSOLUTE_SEED = 9_007_199_254_740_991L;
    public static final int MAX_MESSAGE_LENGTH = 128;
    private static final Pattern JOB_ID = Pattern.compile("[a-z][a-z0-9-]{0,31}");
    private static final List<String> ASSUMPTIONS = List.of(
            "One shared FIFO waiting queue feeds identical workers; service time belongs to each job.",
            "Waiting capacity excludes running jobs. A full waiting queue rejects arrivals without retry.",
            "All completions at a timestamp precede queued starts and new arrivals.",
            "Existing waiters start first; equal-time arrivals retain input order and use the first idle worker.",
            "Network overhead, failures, durable broker delivery, acknowledgments and retries are excluded.",
            "Successful latency statistics include completed jobs only; p95 uses nearest rank.",
            "The observation window starts at virtual time zero; throughput describes this finite batch.",
            "No choices are random in this version. Seed is replay metadata, not a workload generator.",
            "A cooperative wall-time stop is an external censored guard and may differ across machines.");

    private final SimulationBudget budget;

    public QueueCapacitySimulator() { this(SimulationBudget.defaults()); }

    public QueueCapacitySimulator(SimulationBudget budget) {
        if (budget == null || budget.maxEvents() < 0 || budget.maxTraceBytes() < 2
                || budget.maxVirtualTimeMs() < 0) {
            throw new IllegalArgumentException("Require nonnegative event/time limits and at least two trace bytes.");
        }
        this.budget = budget;
    }

    public QueueCapacityResult run(QueueCapacityInput input) {
        validate(input);
        return new Run(input, budget).execute();
    }

    private static void validate(QueueCapacityInput input) {
        if (input == null) throw new IllegalArgumentException("input is required");
        if (!QueueCapacityInput.SCHEMA_VERSION.equals(input.schemaVersion())) {
            throw new IllegalArgumentException("schemaVersion must be " + QueueCapacityInput.SCHEMA_VERSION);
        }
        if (!MODEL_VERSION.equals(input.modelVersion())) {
            throw new IllegalArgumentException("modelVersion must be " + MODEL_VERSION);
        }
        if (input.seed() < -MAX_ABSOLUTE_SEED || input.seed() > MAX_ABSOLUTE_SEED) {
            throw new IllegalArgumentException("seed must be a JavaScript-safe signed integer.");
        }
        if (input.workers() < 1 || input.workers() > MAX_WORKERS) {
            throw new IllegalArgumentException("workers must be from 1 to " + MAX_WORKERS);
        }
        if (input.queueCapacity() < 0 || input.queueCapacity() > MAX_QUEUE_CAPACITY) {
            throw new IllegalArgumentException("queueCapacity must be from 0 to " + MAX_QUEUE_CAPACITY);
        }
        if (input.jobs() == null || input.jobs().isEmpty() || input.jobs().size() > MAX_JOBS) {
            throw new IllegalArgumentException("jobs must contain from 1 to " + MAX_JOBS + " entries");
        }
        Set<String> ids = new HashSet<>();
        long previous = -1;
        for (QueueCapacityInput.Job job : input.jobs()) {
            if (job == null || job.id() == null || !JOB_ID.matcher(job.id()).matches()) {
                throw new IllegalArgumentException("Each job needs an ID matching [a-z][a-z0-9-]{0,31}.");
            }
            if (!ids.add(job.id())) throw new IllegalArgumentException("Job IDs must be unique.");
            if (job.arrivalTimeMs() < 0 || job.arrivalTimeMs() > MAX_ARRIVAL_TIME_MS) {
                throw new IllegalArgumentException("arrivalTimeMs must be from 0 to " + MAX_ARRIVAL_TIME_MS);
            }
            if (job.arrivalTimeMs() < previous) {
                throw new IllegalArgumentException("Job arrival times must be nondecreasing.");
            }
            if (job.serviceTimeMs() < 1 || job.serviceTimeMs() > MAX_SERVICE_TIME_MS) {
                throw new IllegalArgumentException("serviceTimeMs must be from 1 to " + MAX_SERVICE_TIME_MS);
            }
            previous = job.arrivalTimeMs();
        }
    }

    private static final class Run {
        private final QueueCapacityInput input;
        private final SimulationBudget budget;
        private final SimulationContext guard;
        private final Map<String, Integer> jobIndexes = new HashMap<>();
        private final List<QueueCapacityOutcome> outcomes = new ArrayList<>();
        private final List<QueueCapacityEvent> events = new ArrayList<>();
        private final QueueCapacityState initialState;
        private QueueCapacityState state;
        private int nextArrival;
        private int peakWaiting;
        private long estimatedTraceBytes = 2;
        private long lastVirtualTimeMs;
        private String truncationReason;

        private Run(QueueCapacityInput input, SimulationBudget budget) {
            this.input = input;
            this.budget = budget;
            // Reuse external time guards only; the concrete typed collector owns queue events.
            this.guard = new SimulationContext(budget, input.seed(), input.seed());
            List<Worker> workers = new ArrayList<>();
            for (int i = 1; i <= input.workers(); i++) workers.add(idle("worker-" + i));
            this.initialState = new QueueCapacityState(List.of(), workers);
            this.state = initialState;
            for (int i = 0; i < input.jobs().size(); i++) {
                QueueCapacityInput.Job job = input.jobs().get(i);
                jobIndexes.put(job.id(), i);
                outcomes.add(new QueueCapacityOutcome(job.id(), Status.NOT_ARRIVED, job.arrivalTimeMs(),
                        job.serviceTimeMs(), null, null, null, null, null));
            }
        }

        private QueueCapacityResult execute() {
            while (true) {
                Long time = nextTime();
                if (time == null) break;
                if (!timeAllowed(time)) break;
                // Complete all workers first, including equal-time completions in worker order.
                for (int i = 0; i < state.workers().size(); i++) {
                    Worker worker = state.workers().get(i);
                    if (worker.jobId() != null && worker.scheduledCompletionAtMs().equals(time)
                            && !complete(i, time)) return result();
                }
                // A new arrival cannot jump ahead of an existing FIFO waiter.
                int workerIndex;
                while (!state.queuedJobIds().isEmpty() && (workerIndex = idleWorker()) >= 0) {
                    if (!start(state.queuedJobIds().get(0), workerIndex, time, true)) return result();
                }
                // Immediate worker reservation prevents a simultaneous burst overfilling a vacant pool.
                while (nextArrival < input.jobs().size()
                        && input.jobs().get(nextArrival).arrivalTimeMs() == time) {
                    QueueCapacityInput.Job job = input.jobs().get(nextArrival);
                    if (!arrive(job, time)) return result();
                    nextArrival++;
                }
            }
            return result();
        }

        private Long nextTime() {
            Long next = nextArrival < input.jobs().size() ? input.jobs().get(nextArrival).arrivalTimeMs() : null;
            for (Worker worker : state.workers()) {
                if (worker.jobId() != null && (next == null || worker.scheduledCompletionAtMs() < next)) {
                    next = worker.scheduledCompletionAtMs();
                }
            }
            return next;
        }

        private int idleWorker() {
            for (int i = 0; i < state.workers().size(); i++) {
                if (state.workers().get(i).jobId() == null) return i;
            }
            return -1;
        }

        private boolean arrive(QueueCapacityInput.Job job, long time) {
            int worker = idleWorker();
            if (worker >= 0) return start(job.id(), worker, time, false);
            QueueCapacityOutcome before = outcome(job.id());
            if (state.queuedJobIds().size() < input.queueCapacity()) {
                List<String> queue = new ArrayList<>(state.queuedJobIds());
                queue.add(job.id());
                QueueCapacityState next = new QueueCapacityState(queue, state.workers());
                QueueCapacityOutcome after = new QueueCapacityOutcome(job.id(), Status.QUEUED,
                        before.arrivalTimeMs(), before.serviceTimeMs(), null, null, null, null, null);
                return commit(time, Kind.QUEUED, job.id(), null,
                        "Job " + job.id() + " entered the shared waiting queue.", next, after);
            }
            QueueCapacityOutcome after = new QueueCapacityOutcome(job.id(), Status.REJECTED,
                    before.arrivalTimeMs(), before.serviceTimeMs(), null, null, time, null, null);
            return commit(time, Kind.REJECTED, job.id(), null,
                    "Job " + job.id() + " was rejected because the shared waiting queue is full.", state, after);
        }

        private boolean start(String jobId, int workerIndex, long time, boolean queued) {
            QueueCapacityOutcome before = outcome(jobId);
            List<String> queue = new ArrayList<>(state.queuedJobIds());
            if (queued) queue.remove(0);
            List<Worker> workers = new ArrayList<>(state.workers());
            Worker worker = workers.get(workerIndex);
            long completion = Math.addExact(time, before.serviceTimeMs());
            workers.set(workerIndex, new Worker(worker.id(), jobId, time, completion));
            QueueCapacityState next = new QueueCapacityState(queue, workers);
            QueueCapacityOutcome after = new QueueCapacityOutcome(jobId, Status.RUNNING,
                    before.arrivalTimeMs(), before.serviceTimeMs(), worker.id(), time, null,
                    time - before.arrivalTimeMs(), null);
            return commit(time, Kind.STARTED, jobId, worker.id(),
                    "Job " + jobId + " started on " + worker.id() + ".", next, after);
        }

        private boolean complete(int workerIndex, long time) {
            Worker worker = state.workers().get(workerIndex);
            QueueCapacityOutcome before = outcome(worker.jobId());
            List<Worker> workers = new ArrayList<>(state.workers());
            workers.set(workerIndex, idle(worker.id()));
            QueueCapacityState next = new QueueCapacityState(state.queuedJobIds(), workers);
            QueueCapacityOutcome after = new QueueCapacityOutcome(before.jobId(), Status.COMPLETED,
                    before.arrivalTimeMs(), before.serviceTimeMs(), before.workerId(), before.startTimeMs(),
                    time, before.waitTimeMs(), time - before.arrivalTimeMs());
            return commit(time, Kind.COMPLETED, before.jobId(), worker.id(),
                    "Job " + before.jobId() + " completed on " + worker.id() + ".", next, after);
        }

        /** Reserve the entire transition before changing authoritative state, outcomes or counters. */
        private boolean commit(long time, Kind kind, String jobId, String workerId, String message,
                QueueCapacityState next, QueueCapacityOutcome after) {
            if (!timeAllowed(time)) return false;
            if (events.size() >= budget.maxEvents()) {
                truncationReason = "event_limit";
                return false;
            }
            if (message.length() > MAX_MESSAGE_LENGTH) throw new IllegalStateException("Unbounded event narration.");
            QueueCapacityEvent event = new QueueCapacityEvent(events.size() + 1, time, kind, jobId, workerId, message, next);
            long charge = estimatedEventBytes(event) + (events.isEmpty() ? 0 : 1);
            if (charge > budget.maxTraceBytes() - estimatedTraceBytes) {
                truncationReason = "trace_size_limit";
                return false;
            }
            events.add(event);
            estimatedTraceBytes += charge;
            state = next;
            outcomes.set(jobIndexes.get(jobId), after);
            peakWaiting = Math.max(peakWaiting, state.queuedJobIds().size());
            lastVirtualTimeMs = time;
            checkInvariants();
            return true;
        }

        private boolean timeAllowed(long time) {
            if (guard.virtualTimeExceeded(time)) {
                truncationReason = "virtual_time_limit";
                return false;
            }
            try {
                guard.checkDeadline();
            } catch (BudgetExceededException exception) {
                truncationReason = exception.truncationReason();
                return false;
            }
            return true;
        }

        private QueueCapacityOutcome outcome(String id) { return outcomes.get(jobIndexes.get(id)); }

        private void checkInvariants() {
            if (state.queuedJobIds().size() > input.queueCapacity()) throw new IllegalStateException("Waiting queue overflow.");
            Set<String> assigned = new HashSet<>();
            for (String jobId : state.queuedJobIds()) {
                if (!assigned.add(jobId) || outcome(jobId).status() != Status.QUEUED) {
                    throw new IllegalStateException("Queue state disagrees with job progress.");
                }
            }
            for (Worker worker : state.workers()) {
                if (worker.jobId() == null) continue;
                QueueCapacityOutcome job = outcome(worker.jobId());
                if (!assigned.add(worker.jobId()) || job.status() != Status.RUNNING
                        || !worker.id().equals(job.workerId()) || !worker.startedAtMs().equals(job.startTimeMs())
                        || worker.scheduledCompletionAtMs() != job.startTimeMs() + job.serviceTimeMs()) {
                    throw new IllegalStateException("Worker state disagrees with job progress.");
                }
            }
            for (QueueCapacityOutcome job : outcomes) {
                if ((job.status() == Status.QUEUED || job.status() == Status.RUNNING) != assigned.contains(job.jobId())) {
                    throw new IllegalStateException("A job has missing or duplicate queue/worker ownership.");
                }
            }
        }

        private QueueCapacityResult result() {
            int completed = 0, rejected = 0, queued = 0, running = 0, notArrived = 0;
            List<Long> waits = new ArrayList<>(), latencies = new ArrayList<>();
            for (QueueCapacityOutcome job : outcomes) {
                switch (job.status()) {
                    case COMPLETED -> { completed++; waits.add(job.waitTimeMs()); latencies.add(job.latencyMs()); }
                    case REJECTED -> rejected++;
                    case QUEUED -> queued++;
                    case RUNNING -> running++;
                    case NOT_ARRIVED -> notArrived++;
                }
            }
            if (completed + rejected + queued + running + notArrived != input.jobs().size()) {
                throw new IllegalStateException("Job populations do not reconcile.");
            }
            if (truncationReason == null && queued + running + notArrived != 0) {
                throw new IllegalStateException("Execution ended with unfinished work.");
            }
            QueueCapacityMetrics metrics = new QueueCapacityMetrics(input.jobs().size(), completed, rejected,
                    queued, running, notArrived, completed, mean(waits), mean(latencies), percentile95(waits),
                    percentile95(latencies), peakWaiting, 0, lastVirtualTimeMs,
                    lastVirtualTimeMs == 0 ? null : completed * 1000.0 / lastVirtualTimeMs);
            return new QueueCapacityResult(QueueCapacityInput.SCHEMA_VERSION, SIMULATION_ID, MODEL_VERSION,
                    input.seed(), truncationReason == null ? "completed" : "limited", truncationReason,
                    lastVirtualTimeMs, ASSUMPTIONS, initialState, events, state, outcomes, metrics);
        }

        private static Worker idle(String id) { return new Worker(id, null, null, null); }

        private static Double mean(List<Long> values) {
            return values.isEmpty() ? null : values.stream().mapToLong(Long::longValue).average().orElseThrow();
        }

        private static Long percentile95(List<Long> values) {
            if (values.isEmpty()) return null;
            List<Long> sorted = values.stream().sorted().toList();
            int rank = (95 * sorted.size() + 99) / 100;
            return sorted.get(rank - 1);
        }

        /** Count every field, including nullable fields, plus worst-case JSON string escaping. */
        private static long estimatedEventBytes(QueueCapacityEvent event) {
            long bytes = "{\"sequence\":,\"timeMs\":,\"kind\":,\"jobId\":,\"workerId\":,\"message\":,\"state\":}".length();
            bytes += 11 + 20; // Signed int sequence and signed long time, even though modeled times are nonnegative.
            bytes += escapedStringBytes(event.kind().value()) + escapedStringBytes(event.jobId());
            bytes += escapedStringBytes(event.workerId()) + escapedStringBytes(event.message());
            bytes += "{\"queuedJobIds\":[],\"workers\":[]}".length();
            for (int i = 0; i < event.state().queuedJobIds().size(); i++) {
                if (i > 0) bytes++;
                bytes += escapedStringBytes(event.state().queuedJobIds().get(i));
            }
            for (int i = 0; i < event.state().workers().size(); i++) {
                if (i > 0) bytes++;
                Worker worker = event.state().workers().get(i);
                bytes += "{\"id\":,\"jobId\":,\"startedAtMs\":,\"scheduledCompletionAtMs\":}".length();
                bytes += escapedStringBytes(worker.id()) + escapedStringBytes(worker.jobId());
                bytes += worker.startedAtMs() == null ? 4 : 20;
                bytes += worker.scheduledCompletionAtMs() == null ? 4 : 20;
            }
            return bytes;
        }

        private static long escapedStringBytes(String value) {
            if (value == null) return 4;
            long bytes = 2; // String quotes.
            for (int i = 0; i < value.length(); i++) {
                char unit = value.charAt(i);
                if (unit == '"' || unit == '\\') bytes += 2;
                else if (unit < 0x20 || unit > 0x7f) bytes += 6;
                else bytes++;
            }
            return bytes;
        }
    }
}
