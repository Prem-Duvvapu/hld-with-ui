package com.hld.simulation;

import com.hld.simulation.engine.BudgetExceededException;
import com.hld.simulation.engine.FailureSchedule;
import com.hld.simulation.engine.FailureScheduleEntry;
import com.hld.simulation.engine.InFlightBehavior;
import com.hld.simulation.engine.SimulationBudget;
import com.hld.simulation.engine.SimulationContext;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.PriorityQueue;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class RequestFlowSimulator {
    public static final String MODEL_VERSION = RequestFlowInput.CURRENT_MODEL_VERSION;
    private static final List<String> ASSUMPTIONS_1_0 = List.of(
            "All nodes are healthy for the full run.",
            "Network and load-balancer overhead are zero.",
            "Each node uses a FIFO queue and identical workers.",
            "A request keeps the service time of its selected node.",
            "Retries, cancellation, and health-check delay are outside this model version.");
    private static final List<String> ASSUMPTIONS_1_1 = List.of(
            "Network and load-balancer overhead are zero.",
            "Each node uses a FIFO queue and identical workers.",
            "A request keeps the service time of its selected node.",
            "Node failures follow the provided schedule; in-flight behavior is configurable.",
            "Retries, cancellation, and health-check delay are outside this model version.");
    private final SimulationLimits limits;
    private final SimulationBudget budget;

    public RequestFlowSimulator() {
        this(SimulationLimits.defaults(), SimulationBudget.defaults());
    }

    RequestFlowSimulator(SimulationLimits limits) {
        this(limits, SimulationBudget.defaults());
    }

    RequestFlowSimulator(SimulationLimits limits, SimulationBudget budget) {
        this.limits = limits;
        this.budget = budget;
    }

    public SimulationLimits limits() {
        return limits;
    }

    public SimulationBudget budget() {
        return budget;
    }

    public RequestFlowResult run(RequestFlowInput input) {
        validate(input);
        SimulationContext context = new SimulationContext(budget, input.seed(), input.seed() + 1);
        boolean hasFailures = input.failureSchedule() != null && !input.failureSchedule().isEmpty();
        List<String> assumptions = hasFailures ? ASSUMPTIONS_1_1 : ASSUMPTIONS_1_0;

        List<NodeRuntime> nodes = new ArrayList<>();
        for (int index = 0; index < input.nodeServiceTimesMs().size(); index++) {
            nodes.add(new NodeRuntime("Node " + (char) ('A' + index), input.nodeServiceTimesMs().get(index),
                    input.workersPerNode()));
        }

        Set<String> nodeIds = new LinkedHashSet<>();
        for (NodeRuntime node : nodes) nodeIds.add(node.id());

        FailureSchedule failureSchedule = hasFailures
                ? FailureSchedule.of(input.failureSchedule(), limits.maxVirtualTimeMs(), nodeIds)
                : FailureSchedule.empty();

        List<EventDraft> drafts = new ArrayList<>();
        List<RequestOutcome> outcomes = new ArrayList<>();
        long draftOrder = 0;
        int roundRobinIndex = 0;

        // Add failure/recovery events to the draft list
        for (FailureScheduleEntry entry : failureSchedule.entries()) {
            drafts.add(new EventDraft(entry.failAtMs(), draftOrder++, "node.failed", null, entry.entityId(),
                    entry.entityId() + " failed at " + entry.failAtMs() + " ms."));
            if (entry.recoverAtMs() != null) {
                drafts.add(new EventDraft(entry.recoverAtMs(), draftOrder++, "node.recovered", null,
                        entry.entityId(),
                        entry.entityId() + " recovered at " + entry.recoverAtMs() + " ms."));
            }
        }

        String wallTimeTruncation = null;
        try {
            for (int index = 0; index < input.arrivalTimesMs().size(); index++) {
                context.checkDeadline();
                long arrival = input.arrivalTimesMs().get(index);
                String requestId = "Request " + (index + 1);

                // Apply failures and recoveries up to the arrival time
                applyFailuresAndRecoveries(nodes, failureSchedule, arrival, drafts, outcomes);

                for (NodeRuntime node : nodes) node.removeCompleted(arrival);
                drafts.add(new EventDraft(arrival, draftOrder++, "request.arrived", requestId, null,
                        requestId + " reached the load balancer."));

                // Find eligible nodes (not failed)
                List<NodeRuntime> eligible = nodes.stream()
                        .filter(node -> !failureSchedule.isEntityFailed(node.id(), arrival))
                        .toList();

                if (eligible.isEmpty()) {
                    drafts.add(new EventDraft(arrival, draftOrder++, "request.rejected", requestId, null,
                            "All nodes are failed; " + requestId + " was rejected."));
                    outcomes.add(new RequestOutcome(requestId, null, "REJECTED", arrival,
                            null, null, null, null, null));
                    continue;
                }

                NodeRuntime selected;
                if (input.policy() == RoutingPolicy.ROUND_ROBIN) {
                    selected = eligible.get(roundRobinIndex % eligible.size());
                    roundRobinIndex++;
                } else {
                    selected = eligible.stream()
                            .min(Comparator.comparingInt(NodeRuntime::outstanding).thenComparing(NodeRuntime::id))
                            .orElseThrow();
                }
                drafts.add(new EventDraft(arrival, draftOrder++, "request.routed", requestId, selected.id(),
                        input.policy() + " selected " + selected.id() + " with " + selected.outstanding()
                                + " outstanding request(s)."));

                int capacity = input.workersPerNode() + input.queueCapacity();
                if (selected.outstanding() >= capacity) {
                    drafts.add(new EventDraft(arrival, draftOrder++, "request.rejected", requestId, selected.id(),
                            selected.id() + " had no free worker or waiting slot."));
                    outcomes.add(new RequestOutcome(requestId, selected.id(), "REJECTED", arrival,
                            null, null, null, null, null));
                    continue;
                }

                long workerAvailable = selected.nextWorkerAvailable();
                long start = Math.max(arrival, workerAvailable);
                long completion = Math.addExact(start, selected.serviceTimeMs());

                // Check if the node will fail before this request completes
                Long failureTime = findNextFailure(failureSchedule, selected.id(), start, completion);
                if (failureTime != null) {
                    FailureScheduleEntry failEntry = failureSchedule.failureAt(selected.id(), failureTime);
                    InFlightBehavior behavior = failEntry != null ? failEntry.inFlightBehavior()
                            : InFlightBehavior.FAIL;
                    if (behavior == InFlightBehavior.FAIL) {
                        selected.assignWithFailure(failureTime);
                        drafts.add(new EventDraft(start, draftOrder++, "request.started", requestId,
                                selected.id(), selected.id() + " started " + requestId + "."));
                        drafts.add(new EventDraft(failureTime, draftOrder++, "request.failed", requestId,
                                selected.id(),
                                requestId + " failed because " + selected.id() + " went down at "
                                        + failureTime + " ms."));
                        long queueMs = start - arrival;
                        outcomes.add(new RequestOutcome(requestId, selected.id(), "FAILED", arrival,
                                start, failureTime, queueMs, null, failureTime - arrival));
                        continue;
                    }
                    // COMPLETE behavior: let the request finish normally
                }

                long queue = start - arrival;
                selected.assign(completion);
                if (queue > 0) {
                    drafts.add(new EventDraft(arrival, draftOrder++, "request.queued", requestId, selected.id(),
                            requestId + " waited " + queue + " ms because every worker was busy."));
                }
                drafts.add(new EventDraft(start, draftOrder++, "request.started", requestId, selected.id(),
                        selected.id() + " started " + requestId + "."));
                drafts.add(new EventDraft(completion, draftOrder++, "request.completed", requestId, selected.id(),
                        requestId + " completed after " + queue + " ms waiting and "
                                + selected.serviceTimeMs() + " ms service."));
                outcomes.add(new RequestOutcome(requestId, selected.id(), "COMPLETED", arrival, start, completion,
                        queue, selected.serviceTimeMs(), completion - arrival));
            }
        } catch (BudgetExceededException e) {
            wallTimeTruncation = e.truncationReason();
        }

        drafts.sort(Comparator.comparingLong(EventDraft::timeMs).thenComparingLong(EventDraft::order));

        String truncationReason = wallTimeTruncation;
        for (EventDraft draft : drafts) {
            if (truncationReason != null && !"wall_time_limit".equals(truncationReason)) break;
            if (context.virtualTimeExceeded(draft.timeMs())) {
                if (truncationReason == null) truncationReason = "virtual_time_limit";
                break;
            }
            SimulationEvent event = new SimulationEvent(context.emitter().size() + 1, draft.timeMs(),
                    draft.kind(), draft.requestId(), draft.nodeId(), draft.message());
            if (!context.emit(event)) {
                truncationReason = context.truncationReason();
                break;
            }
        }

        List<SimulationEvent> events = context.emitter().events();
        List<String> terminalRequestIds = events.stream()
                .filter(event -> "request.completed".equals(event.kind())
                        || "request.rejected".equals(event.kind())
                        || "request.failed".equals(event.kind()))
                .map(SimulationEvent::requestId)
                .toList();
        List<RequestOutcome> visibleOutcomes = outcomes.stream()
                .filter(outcome -> terminalRequestIds.contains(outcome.requestId()))
                .toList();
        long lastVirtualTimeMs = events.isEmpty() ? 0 : events.get(events.size() - 1).timeMs();
        int incompleteRequests = input.arrivalTimesMs().size() - visibleOutcomes.size();
        String status = truncationReason == null ? "completed" : "limited";

        return new RequestFlowResult("1.0", "request-flow", input.modelVersion(), input.seed(), status,
                truncationReason, lastVirtualTimeMs, incompleteRequests, limits, assumptions,
                List.copyOf(events), List.copyOf(visibleOutcomes), metrics(visibleOutcomes));
    }

    private void applyFailuresAndRecoveries(
            List<NodeRuntime> nodes,
            FailureSchedule schedule,
            long currentTimeMs,
            List<EventDraft> drafts,
            List<RequestOutcome> outcomes) {
        // Process failure effects on in-flight requests
        for (NodeRuntime node : nodes) {
            for (FailureScheduleEntry entry : schedule.entriesFor(node.id())) {
                if (entry.failAtMs() <= currentTimeMs && !node.hasAppliedFailure(entry.failAtMs())) {
                    node.markFailureApplied(entry.failAtMs());
                    if (entry.inFlightBehavior() == InFlightBehavior.FAIL) {
                        node.failAllInFlight(entry.failAtMs());
                    }
                }
                if (entry.recoverAtMs() != null && entry.recoverAtMs() <= currentTimeMs
                        && !node.hasAppliedRecovery(entry.recoverAtMs())) {
                    node.markRecoveryApplied(entry.recoverAtMs());
                    node.recover(entry.recoverAtMs());
                }
            }
        }
    }

    private Long findNextFailure(FailureSchedule schedule, String entityId, long start, long end) {
        for (FailureScheduleEntry entry : schedule.entriesFor(entityId)) {
            if (entry.failAtMs() > start && entry.failAtMs() < end) {
                return entry.failAtMs();
            }
        }
        return null;
    }

    private void validate(RequestFlowInput input) {
        if (!RequestFlowInput.CURRENT_SCHEMA_VERSION.equals(input.schemaVersion())) {
            throw new IllegalArgumentException("schemaVersion must be " + RequestFlowInput.CURRENT_SCHEMA_VERSION);
        }
        if (!RequestFlowInput.MODEL_VERSION_1_0.equals(input.modelVersion())
                && !RequestFlowInput.MODEL_VERSION_1_1.equals(input.modelVersion())) {
            throw new IllegalArgumentException(
                    "modelVersion must be " + RequestFlowInput.MODEL_VERSION_1_0
                            + " or " + RequestFlowInput.MODEL_VERSION_1_1);
        }
        if (RequestFlowInput.MODEL_VERSION_1_0.equals(input.modelVersion())
                && input.failureSchedule() != null && !input.failureSchedule().isEmpty()) {
            throw new IllegalArgumentException(
                    "failureSchedule is not supported in model version " + RequestFlowInput.MODEL_VERSION_1_0);
        }
        if (input.arrivalTimesMs().size() > limits.maxRequests()) {
            throw new IllegalArgumentException("arrivalTimesMs cannot exceed " + limits.maxRequests() + " requests");
        }
        if (input.nodeServiceTimesMs().size() > limits.maxNodes()) {
            throw new IllegalArgumentException("nodeServiceTimesMs cannot exceed " + limits.maxNodes() + " nodes");
        }
        if (input.workersPerNode() < 1 || input.workersPerNode() > limits.maxWorkersPerNode()) {
            throw new IllegalArgumentException("workersPerNode must be from 1 to " + limits.maxWorkersPerNode());
        }
        if (input.queueCapacity() < 0 || input.queueCapacity() > limits.maxQueueCapacity()) {
            throw new IllegalArgumentException("queueCapacity must be from 0 to " + limits.maxQueueCapacity());
        }
        long previous = -1;
        for (long arrival : input.arrivalTimesMs()) {
            if (arrival < 0 || arrival > limits.maxArrivalTimeMs()) {
                throw new IllegalArgumentException("arrivalTimesMs values must be from 0 to "
                        + limits.maxArrivalTimeMs());
            }
            if (arrival < previous) throw new IllegalArgumentException("arrivalTimesMs must be nondecreasing");
            previous = arrival;
        }
        for (long serviceTime : input.nodeServiceTimesMs()) {
            if (serviceTime < 1 || serviceTime > limits.maxServiceTimeMs()) {
                throw new IllegalArgumentException("nodeServiceTimesMs values must be from 1 to "
                        + limits.maxServiceTimeMs());
            }
        }
        if (input.failureSchedule() != null) {
            for (FailureScheduleEntry entry : input.failureSchedule()) {
                if (entry.inFlightBehavior() == InFlightBehavior.PAUSE) {
                    throw new IllegalArgumentException(
                            "PAUSE in-flight behavior is not yet supported in request-flow");
                }
            }
        }
    }

    private RequestFlowMetrics metrics(List<RequestOutcome> outcomes) {
        List<RequestOutcome> completed = outcomes.stream()
                .filter(outcome -> "COMPLETED".equals(outcome.status()))
                .sorted(Comparator.comparingLong(RequestOutcome::latencyMs))
                .toList();
        int rejected = (int) outcomes.stream().filter(outcome -> "REJECTED".equals(outcome.status())).count();
        int failed = (int) outcomes.stream().filter(outcome -> "FAILED".equals(outcome.status())).count();
        if (completed.isEmpty()) return new RequestFlowMetrics(0, rejected, failed, null, null, null, 0);
        double mean = completed.stream().mapToLong(RequestOutcome::latencyMs).average().orElseThrow();
        int percentileIndex = Math.max(0, (int) Math.ceil(0.95 * completed.size()) - 1);
        long p95 = completed.get(percentileIndex).latencyMs();
        long firstArrival = outcomes.stream().mapToLong(RequestOutcome::arrivalMs).min().orElse(0);
        long lastCompletion = completed.stream().mapToLong(RequestOutcome::completionMs).max().orElse(firstArrival);
        long window = Math.max(0, lastCompletion - firstArrival);
        Double throughput = window == 0 ? null : completed.size() * 1000.0 / window;
        return new RequestFlowMetrics(completed.size(), rejected, failed, mean, p95, throughput, window);
    }

    private record EventDraft(long timeMs, long order, String kind, String requestId, String nodeId, String message) {}

    static final class NodeRuntime {
        private final String id;
        private final long serviceTimeMs;
        private final int maxWorkers;
        private final PriorityQueue<Long> workerAvailability = new PriorityQueue<>();
        private final List<Long> activeCompletions = new ArrayList<>();
        private final Set<Long> appliedFailures = new LinkedHashSet<>();
        private final Set<Long> appliedRecoveries = new LinkedHashSet<>();

        NodeRuntime(String id, long serviceTimeMs, int workers) {
            this.id = id;
            this.serviceTimeMs = serviceTimeMs;
            this.maxWorkers = workers;
            for (int i = 0; i < workers; i++) workerAvailability.add(0L);
        }

        String id() { return id; }
        long serviceTimeMs() { return serviceTimeMs; }
        int outstanding() { return activeCompletions.size(); }
        long nextWorkerAvailable() { return workerAvailability.remove(); }

        void assign(long completion) {
            workerAvailability.add(completion);
            activeCompletions.add(completion);
        }

        void assignWithFailure(long failureTime) {
            // Worker will be freed at failure time, not completion
            workerAvailability.add(failureTime);
            activeCompletions.add(failureTime);
        }

        void removeCompleted(long time) { activeCompletions.removeIf(completion -> completion <= time); }

        boolean hasAppliedFailure(long failAtMs) { return appliedFailures.contains(failAtMs); }
        void markFailureApplied(long failAtMs) { appliedFailures.add(failAtMs); }

        boolean hasAppliedRecovery(long recoverAtMs) { return appliedRecoveries.contains(recoverAtMs); }
        void markRecoveryApplied(long recoverAtMs) { appliedRecoveries.add(recoverAtMs); }

        /** Fail all in-flight work: clear workers and active completions. */
        void failAllInFlight(long failureTime) {
            activeCompletions.clear();
            workerAvailability.clear();
        }

        /** Recover: restore workers to idle state. */
        void recover(long recoveryTime) {
            activeCompletions.clear();
            workerAvailability.clear();
            for (int i = 0; i < maxWorkers; i++) workerAvailability.add(recoveryTime);
        }
    }
}
