package com.hld.api;

import com.hld.cache.CacheAsideDescriptor;
import com.hld.cache.CacheAsideDescriptor.CacheAsidePreset;
import com.hld.cache.CacheAsideInput;
import com.hld.cache.CacheAsideLimits;
import com.hld.cache.CacheAsideSimulator;
import com.hld.cache.CacheOperation;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/simulations")
public class CacheAsideController {

    private final SimulationResponses responses;
    private final CacheAsideSimulator simulator;

    public CacheAsideController(CacheAsideSimulator simulator, SimulationResponses responses) {
        this.simulator = simulator;
        this.responses = responses;
    }

    @GetMapping("/cache-aside")
    public CacheAsideDescriptor descriptor() {
        return new CacheAsideDescriptor(
                "cache-aside",
                "Cache-Aside",
                "simulation",
                CacheAsideSimulator.MODEL_VERSION,
                "A deterministic model of cache-aside reads, misses, fills, TTL expiry, "
                        + "stale data, and origin/cache availability.",
                CacheAsideLimits.CURRENT,
                List.of(
                        new CacheAsidePreset("baseline", "Baseline: hit, miss, and stale read",
                                "Why did the GET at 70 ms return v1 after the origin update?",
                                CacheAsideInput.create(2, 20, 100, "v1",
                                        List.of(
                                                new CacheOperation("GET", "k", null, 0),
                                                new CacheOperation("GET", "k", null, 30),
                                                new CacheOperation("UPDATE", "k", "v2", 40),
                                                new CacheOperation("GET", "k", null, 70),
                                                new CacheOperation("GET", "k", null, 120)),
                                        7)),
                        new CacheAsidePreset("cold-burst", "Cold burst: concurrent misses",
                                "Will these five concurrent reads for the same key result in one origin read?",
                                CacheAsideInput.create(2, 20, 100, "v1",
                                        List.of(
                                                new CacheOperation("GET", "k", null, 0),
                                                new CacheOperation("GET", "k", null, 1),
                                                new CacheOperation("GET", "k", null, 2),
                                                new CacheOperation("GET", "k", null, 3),
                                                new CacheOperation("GET", "k", null, 4)),
                                        7)),
                        new CacheAsidePreset("cache-unavailable", "Cache unavailable",
                                "What happens to origin load when the cache is down?",
                                CacheAsideInput.withAvailability(2, 20, 100, "v1",
                                        List.of(
                                                new CacheOperation("GET", "k", null, 0),
                                                new CacheOperation("GET", "k", null, 30),
                                                new CacheOperation("GET", "k", null, 60)),
                                        false, true, 7)),
                        new CacheAsidePreset("origin-unavailable", "Origin unavailable",
                                "What can fail when the cache is healthy but the origin is down?",
                                CacheAsideInput.withAvailability(2, 20, 100, "v1",
                                        List.of(
                                                new CacheOperation("GET", "k", null, 0),
                                                new CacheOperation("GET", "k", null, 30)),
                                        true, false, 7))),
                CacheAsideSimulator.ASSUMPTIONS);
    }

    @PostMapping("/cache-aside/runs")
    public ResponseEntity<byte[]> run(@Valid @RequestBody CacheAsideInput input) {
        return responses.json(simulator.run(input));
    }
}
