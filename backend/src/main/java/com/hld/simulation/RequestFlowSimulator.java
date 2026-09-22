package com.hld.simulation;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.PriorityQueue;
import org.springframework.stereotype.Service;

@Service
public class RequestFlowSimulator {
    public static final String MODEL_VERSION = "1.0.0";
    private static final List<String> ASSUMPTIONS = List.of(
            "All nodes are healthy for the full run.",
            "Network and load-balancer overhead are zero.",
            "Each node uses a FIFO queue and identical workers.",
            "A request keeps the service time of its selected node.",
            "Retries, cancellation, and health-check delay are outside this model version.");

    public RequestFlowResult run(RequestFlowInput input) {
        validate(input);
        List<NodeRuntime> nodes = new ArrayList<>();
        for (int index = 0; index < input.nodeServiceTimesMs().size(); index++) {
            nodes.add(new NodeRuntime("Node " + (char) ('A' + index), input.nodeServiceTimesMs().get(index),
                    input.workersPerNode()));
        }

        List<EventDraft> drafts = new ArrayList<>();
        List<RequestOutcome> outcomes = new ArrayList<>();
        long draftOrder = 0;
        int roundRobinIndex = 0;

        for (int index = 0; index < input.arrivalTimesMs().size(); index++) {
            long arrival = input.arrivalTimesMs().get(index);
            String requestId = "Request " + (index + 1);
            for (NodeRuntime node : nodes) node.removeCompleted(arrival);
            drafts.add(new EventDraft(arrival, draftOrder++, "request.arrived", requestId, null,
                    requestId + " reached the load balancer."));

            NodeRuntime selected;
            if (input.policy() == RoutingPolicy.ROUND_ROBIN) {
                selected = nodes.get(roundRobinIndex % nodes.size());
                roundRobinIndex++;
            } else {
                selected = nodes.stream()
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

        drafts.sort(Comparator.comparingLong(EventDraft::timeMs).thenComparingLong(EventDraft::order));
        List<SimulationEvent> events = new ArrayList<>();
        for (int i = 0; i < drafts.size(); i++) {
            EventDraft draft = drafts.get(i);
            events.add(new SimulationEvent(i + 1, draft.timeMs(), draft.kind(), draft.requestId(),
                    draft.nodeId(), draft.message()));
        }

        return new RequestFlowResult("request-flow", MODEL_VERSION, input.seed(), "completed", ASSUMPTIONS,
                List.copyOf(events), List.copyOf(outcomes), metrics(outcomes));
    }

    private void validate(RequestFlowInput input) {
        long previous = -1;
        for (long arrival : input.arrivalTimesMs()) {
            if (arrival < previous) throw new IllegalArgumentException("arrivalTimesMs must be nondecreasing");
            previous = arrival;
        }
    }

    private RequestFlowMetrics metrics(List<RequestOutcome> outcomes) {
        List<RequestOutcome> completed = outcomes.stream()
                .filter(outcome -> "COMPLETED".equals(outcome.status()))
                .sorted(Comparator.comparingLong(RequestOutcome::latencyMs))
                .toList();
        int rejected = (int) outcomes.stream().filter(outcome -> "REJECTED".equals(outcome.status())).count();
        if (completed.isEmpty()) return new RequestFlowMetrics(0, rejected, null, null, null, 0);
        double mean = completed.stream().mapToLong(RequestOutcome::latencyMs).average().orElseThrow();
        int percentileIndex = Math.max(0, (int) Math.ceil(0.95 * completed.size()) - 1);
        long p95 = completed.get(percentileIndex).latencyMs();
        long firstArrival = outcomes.stream().mapToLong(RequestOutcome::arrivalMs).min().orElse(0);
        long lastCompletion = completed.stream().mapToLong(RequestOutcome::completionMs).max().orElse(firstArrival);
        long window = Math.max(0, lastCompletion - firstArrival);
        Double throughput = window == 0 ? null : completed.size() * 1000.0 / window;
        return new RequestFlowMetrics(completed.size(), rejected, mean, p95, throughput, window);
    }

    private record EventDraft(long timeMs, long order, String kind, String requestId, String nodeId, String message) {}

    private static final class NodeRuntime {
        private final String id;
        private final long serviceTimeMs;
        private final PriorityQueue<Long> workerAvailability = new PriorityQueue<>();
        private final List<Long> activeCompletions = new ArrayList<>();

        NodeRuntime(String id, long serviceTimeMs, int workers) {
            this.id = id;
            this.serviceTimeMs = serviceTimeMs;
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
        void removeCompleted(long time) { activeCompletions.removeIf(completion -> completion <= time); }
    }
}
