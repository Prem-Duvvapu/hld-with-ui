package com.hld.estimation;

import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class CapacityEstimator {
    private static final double SECONDS_PER_DAY = 86_400.0;
    private static final double BYTES_PER_KILOBYTE = 1_000.0;
    private static final double BYTES_PER_GIGABYTE = 1_000_000_000.0;

    public CapacityEstimateResult calculate(CapacityEstimateInput input) {
        if (!CapacityEstimateInput.SCHEMA_VERSION.equals(input.schemaVersion())) {
            throw new IllegalArgumentException("schemaVersion must be " + CapacityEstimateInput.SCHEMA_VERSION);
        }

        double dailyRequests = input.dailyActiveUsers() * input.requestsPerUserPerDay();
        double averageRps = dailyRequests / SECONDS_PER_DAY;
        double peakRps = averageRps * input.peakFactor();
        double readFraction = input.readPercentage() / 100.0;
        double peakReads = peakRps * readFraction;
        double peakWrites = peakRps * (100.0 - input.readPercentage()) / 100.0;
        double dailyWrites = dailyRequests * (100.0 - input.readPercentage()) / 100.0;
        double rawStorageGb = dailyWrites * input.recordSizeKb() * BYTES_PER_KILOBYTE
                * input.retentionDays() / BYTES_PER_GIGABYTE;
        double replicatedStorageGb = rawStorageGb * input.replicationFactor();
        double dailyResponseGb = dailyRequests * input.responseSizeKb() * BYTES_PER_KILOBYTE
                / BYTES_PER_GIGABYTE;
        double peakResponseMbps = peakRps * input.responseSizeKb() * BYTES_PER_KILOBYTE * 8.0 / 1_000_000.0;
        double concurrency = peakRps * input.meanLatencyMs() / 1_000.0;
        double peakWithHeadroom = peakRps * (1.0 + input.headroomPercentage() / 100.0);

        CapacityMetrics metrics = new CapacityMetrics(
                dailyRequests, averageRps, peakRps, peakReads, peakWrites, dailyWrites, rawStorageGb,
                replicatedStorageGb, dailyResponseGb, peakResponseMbps, concurrency, peakWithHeadroom);

        List<CalculationStep> steps = List.of(
                step("daily-requests", "Daily requests", "daily users × requests per user", dailyRequests, "requests/day",
                        "The total request volume implied by the usage assumptions."),
                step("average-rate", "Average request rate", "daily requests ÷ 86,400", averageRps, "requests/s",
                        "A daily average; it does not describe bursts."),
                step("peak-rate", "Peak request rate", "average request rate × peak factor", peakRps, "requests/s",
                        "The modeled busy-period rate before extra headroom."),
                step("write-volume", "Daily writes", "daily requests × write fraction", dailyWrites, "writes/day",
                        "Assumes every write creates one new record."),
                step("raw-storage", "Raw retained data", "daily writes × record size × retention", rawStorageGb, "GB",
                        "Decimal GB of raw records before replication and overhead."),
                step("replicated-storage", "Replicated raw data", "raw retained data × copies", replicatedStorageGb, "GB",
                        "Raw record copies only; indexes, logs, backups, and headroom are excluded."),
                step("peak-bandwidth", "Peak response bandwidth", "peak rate × response size × 8", peakResponseMbps, "Mb/s",
                        "Response payload only; protocol overhead, requests, media, and CDN effects are excluded."),
                step("concurrency", "Mean in-flight requests", "peak rate × mean latency in seconds", concurrency, "requests",
                        "A steady-workload average, not a worker-pool or burst-capacity guarantee."),
                step("headroom", "Peak rate with headroom", "peak rate × (1 + headroom %)", peakWithHeadroom, "requests/s",
                        "A planning target derived from the selected margin, not measured capacity."));

        List<SensitivityPoint> sensitivity = List.of(
                sensitivity("low", "Low", 0.8, peakRps, peakResponseMbps, concurrency),
                sensitivity("base", "Base", 1.0, peakRps, peakResponseMbps, concurrency),
                sensitivity("high", "High", 1.2, peakRps, peakResponseMbps, concurrency));

        return new CapacityEstimateResult(
                CapacityEstimateInput.SCHEMA_VERSION,
                "capacity-estimation",
                "estimated",
                metrics,
                steps,
                sensitivity,
                List.of(
                        "Decimal units are used: 1 kB = 1,000 bytes and 1 GB = 1,000,000,000 bytes.",
                        "The read/write split applies to total requests and one write creates one record.",
                        "Peak concurrency uses a stable-workload average relationship."),
                List.of(
                        "This estimate does not select instance counts or promise production capacity.",
                        "Storage excludes indexes, metadata, logs, compaction, backups, and operational headroom.",
                        "Bandwidth excludes request bytes, protocol overhead, media, compression, and CDN effects."));
    }

    private CalculationStep step(String id, String label, String formula, double value, String unit, String meaning) {
        return new CalculationStep(id, label, formula, value, unit, meaning);
    }

    private SensitivityPoint sensitivity(
            String id, String label, double multiplier, double peakRps, double bandwidth, double concurrency) {
        return new SensitivityPoint(id, label, multiplier, peakRps * multiplier, bandwidth * multiplier,
                concurrency * multiplier);
    }
}
