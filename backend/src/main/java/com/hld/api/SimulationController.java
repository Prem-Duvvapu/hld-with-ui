package com.hld.api;

import com.hld.simulation.RequestFlowInput;
import com.hld.simulation.RequestFlowResult;
import com.hld.simulation.RequestFlowSimulator;
import com.hld.simulation.RoutingPolicy;
import com.hld.simulation.SimulationDescriptor;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/simulations")
public class SimulationController {
    private final RequestFlowSimulator simulator;

    public SimulationController(RequestFlowSimulator simulator) {
        this.simulator = simulator;
    }

    @GetMapping("/{id}")
    public SimulationDescriptor descriptor(@PathVariable String id) {
        requireRequestFlow(id);
        List<String> assumptions = List.of(
                "All nodes remain healthy during this model version.",
                "Network and balancer overhead are zero.",
                "Queues are FIFO and each node's workers are identical.",
                "Metrics describe this finite modeled run, not a production benchmark.");
        return new SimulationDescriptor(
                "request-flow",
                "Request Flow & Load Balancing",
                "simulation",
                RequestFlowSimulator.MODEL_VERSION,
                "A deterministic model of routing, finite worker pools, queueing, and rejection.",
                Map.of("maxRequests", 100, "maxNodes", 8, "maxWorkersPerNode", 8, "maxQueueCapacity", 100),
                List.of(
                        new SimulationDescriptor.SimulationPreset(
                                "baseline", "Six-request baseline",
                                "Where are requests 5 and 6 while the first four are processed?",
                                new RequestFlowInput(RoutingPolicy.ROUND_ROBIN,
                                        List.of(0L, 0L, 0L, 0L, 0L, 0L), List.of(100L, 100L), 1, 10, 7)),
                        new SimulationDescriptor.SimulationPreset(
                                "slow-node", "One slow node",
                                "Does the routing policy notice that Node B keeps work longer?",
                                new RequestFlowInput(RoutingPolicy.ROUND_ROBIN,
                                        List.of(0L, 0L, 150L, 200L), List.of(100L, 400L), 1, 10, 7)),
                        new SimulationDescriptor.SimulationPreset(
                                "overload", "Finite queue overload",
                                "Which requests are rejected when each node has one waiting slot?",
                                new RequestFlowInput(RoutingPolicy.ROUND_ROBIN,
                                        List.of(0L, 0L, 0L, 0L, 0L, 0L), List.of(100L, 100L), 1, 1, 7))),
                assumptions);
    }

    @PostMapping("/{id}/runs")
    public RequestFlowResult run(@PathVariable String id, @Valid @RequestBody RequestFlowInput input) {
        requireRequestFlow(id);
        return simulator.run(input);
    }

    private void requireRequestFlow(String id) {
        if (!"request-flow".equals(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No simulation has id " + id + ".");
        }
    }
}
