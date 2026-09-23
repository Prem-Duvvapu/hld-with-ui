package com.hld.api;

import com.hld.ratelimit.BackendFailurePolicy;
import com.hld.ratelimit.CounterScope;
import com.hld.ratelimit.RateLimitAlgorithm;
import com.hld.ratelimit.RateLimiterDescriptor;
import com.hld.ratelimit.RateLimiterInput;
import com.hld.ratelimit.RateLimiterResult;
import com.hld.ratelimit.RateLimiterSimulator;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/simulations/distributed-rate-limiter")
public class RateLimiterController {
    private final RateLimiterSimulator simulator;

    public RateLimiterController(RateLimiterSimulator simulator) {
        this.simulator = simulator;
    }

    @GetMapping
    public RateLimiterDescriptor descriptor() {
        return new RateLimiterDescriptor(
                "distributed-rate-limiter",
                "Distributed Rate Limiter",
                "simulation",
                RateLimiterInput.MODEL_VERSION,
                "Compare algorithms, counter placement, distributed overshoot, and backend failure policy.",
                Map.of("maxRequests", 500L, "maxNodes", 20L, "maxLimit", 10_000L,
                        "maxArrivalTimeMs", 300_000L),
                List.of(
                        new RateLimiterDescriptor.Preset(
                                "shared-window", "Shared fixed window",
                                "Which five requests pass when eight arrive in one window?",
                                input(RateLimitAlgorithm.FIXED_WINDOW, CounterScope.SHARED, 3, 5,
                                        true, BackendFailurePolicy.FAIL_CLOSED,
                                        List.of(0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L))),
                        new RateLimiterDescriptor.Preset(
                                "local-overshoot", "Local counter overshoot",
                                "Can three independent nodes enforce a global limit of five?",
                                input(RateLimitAlgorithm.FIXED_WINDOW, CounterScope.LOCAL_PER_NODE, 3, 5,
                                        true, BackendFailurePolicy.FAIL_CLOSED,
                                        List.of(0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L, 0L))),
                        new RateLimiterDescriptor.Preset(
                                "backend-outage", "Counter backend outage",
                                "What does fail-open protect, and what does it sacrifice?",
                                input(RateLimitAlgorithm.TOKEN_BUCKET, CounterScope.SHARED, 3, 5,
                                        false, BackendFailurePolicy.FAIL_OPEN,
                                        List.of(0L, 0L, 0L, 0L, 0L, 0L)))),
                List.of(
                        "One modeled identity sends every request and each request costs one token.",
                        "Application nodes are healthy and requests route round-robin.",
                        "Shared decisions are atomic with zero modeled counter latency.",
                        "Local counters intentionally demonstrate possible aggregate overshoot."));
    }

    @PostMapping("/runs")
    public RateLimiterResult run(@Valid @RequestBody RateLimiterInput input) {
        return simulator.run(input);
    }

    private RateLimiterInput input(
            RateLimitAlgorithm algorithm,
            CounterScope scope,
            int nodes,
            int limit,
            boolean backendAvailable,
            BackendFailurePolicy failurePolicy,
            List<Long> arrivals) {
        return new RateLimiterInput(
                RateLimiterInput.SCHEMA_VERSION,
                RateLimiterInput.MODEL_VERSION,
                algorithm,
                scope,
                nodes,
                limit,
                1_000,
                2,
                backendAvailable,
                failurePolicy,
                arrivals,
                42);
    }
}
