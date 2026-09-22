package com.hld.api;

import com.hld.estimation.CapacityEstimateInput;
import com.hld.estimation.CapacityEstimateResult;
import com.hld.estimation.CapacityEstimator;
import com.hld.estimation.CapacityEstimatorDescriptor;
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
@RequestMapping("/api/v1/estimators")
public class EstimatorController {
    private static final String CAPACITY_ESTIMATION = "capacity-estimation";
    private final CapacityEstimator estimator;

    public EstimatorController(CapacityEstimator estimator) {
        this.estimator = estimator;
    }

    @GetMapping("/{id}")
    public CapacityEstimatorDescriptor descriptor(@PathVariable String id) {
        requireCapacityEstimator(id);
        CapacityEstimateInput baseline = input(1_000_000, 10, 5, 90, 1, 2, 365, 3, 200, 30);
        return new CapacityEstimatorDescriptor(
                CAPACITY_ESTIMATION,
                "Capacity Estimation",
                "estimator",
                CapacityEstimateInput.SCHEMA_VERSION,
                "Turn traffic, data, and latency assumptions into a transparent first-pass capacity range.",
                baseline,
                List.of(
                        new CapacityEstimatorDescriptor.Preset(
                                "baseline", "Interview baseline",
                                "Can you derive peak demand and retained data before choosing components?", baseline),
                        new CapacityEstimatorDescriptor.Preset(
                                "read-heavy", "Read-heavy product",
                                "Which outputs change when reads dominate but write volume remains meaningful?",
                                input(5_000_000, 16, 6, 96, 2, 4, 365, 3, 180, 40)),
                        new CapacityEstimatorDescriptor.Preset(
                                "write-heavy", "Write-heavy telemetry",
                                "How quickly does retained replicated data become the main design pressure?",
                                input(2_000_000, 40, 4, 25, 3, 1, 90, 3, 120, 35))),
                Map.of(
                        "maxDailyActiveUsers", 1_000_000_000L,
                        "maxRequestsPerUserPerDay", 100_000,
                        "maxPeakFactor", 1_000,
                        "maxRecordSizeKb", 1_000_000,
                        "maxResponseSizeKb", 1_000_000,
                        "maxRetentionDays", 36_500,
                        "maxReplicationFactor", 10,
                        "maxMeanLatencyMs", 600_000,
                        "maxHeadroomPercentage", 300),
                List.of(
                        "Decimal units keep every conversion visible and reproducible.",
                        "The traffic shape is summarized by one peak multiplier.",
                        "Results are estimates from stated inputs, not measured production limits."));
    }

    @PostMapping("/{id}/calculations")
    public CapacityEstimateResult calculate(
            @PathVariable String id, @Valid @RequestBody CapacityEstimateInput input) {
        requireCapacityEstimator(id);
        return estimator.calculate(input);
    }

    private CapacityEstimateInput input(
            long users, double requests, double peak, double reads, double recordKb,
            double responseKb, int retention, int copies, double latency, double headroom) {
        return new CapacityEstimateInput(
                CapacityEstimateInput.SCHEMA_VERSION, users, requests, peak, reads, recordKb,
                responseKb, retention, copies, latency, headroom);
    }

    private void requireCapacityEstimator(String id) {
        if (!CAPACITY_ESTIMATION.equals(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No estimator has id " + id + ".");
        }
    }
}
