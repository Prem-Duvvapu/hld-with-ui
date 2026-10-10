package com.hld.performance;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.api.HttpExecutionLimits;
import com.hld.cache.CacheAsideInput;
import com.hld.cache.CacheAsideLimits;
import com.hld.cache.CacheAsideSimulator;
import com.hld.cache.CacheOperation;
import com.hld.estimation.CapacityEstimateInput;
import com.hld.estimation.CapacityEstimator;
import com.hld.ratelimit.BackendFailurePolicy;
import com.hld.ratelimit.CounterScope;
import com.hld.ratelimit.RateLimitAlgorithm;
import com.hld.ratelimit.RateLimiterInput;
import com.hld.ratelimit.RateLimiterSimulator;
import com.hld.simulation.RequestFlowInput;
import com.hld.simulation.RequestFlowSimulator;
import com.hld.simulation.RoutingPolicy;
import com.hld.simulation.SimulationLimits;
import com.hld.simulation.engine.SimulationBudget;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Opt-in, sequential cost evidence. Durations are observations, never modeled time or throughput. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@EnabledIfSystemProperty(named = "hld.performance", matches = "true")
class SimulationPerformanceEvidenceTest {
    private static final int WARMUPS = 3;
    private static final int SAMPLES = 10;

    @Autowired ObjectMapper mapper;
    @Autowired RequestFlowSimulator flow;
    @Autowired CacheAsideSimulator cache;
    @Autowired RateLimiterSimulator limiter;
    @Autowired CapacityEstimator capacity;
    @Autowired HttpExecutionLimits http;

    @Test void recordsGenerationAndSerializationWithSemanticAndResourceChecks() throws Exception {
        List<Measurement> measurements = new ArrayList<>();
        for (Fixture fixture : fixtures()) {
            byte[] request = mapper.writeValueAsBytes(fixture.input());
            assertThat(request.length).as(fixture.id() + " input bytes").isLessThanOrEqualTo(http.maxRequestBytes());
            Object reference = fixture.run().get();
            JsonNode expected = mapper.valueToTree(reference);
            verify(fixture, expected);
            byte[] expectedBytes = mapper.writeValueAsBytes(reference);
            int eventBytes = expected.has("events") ? mapper.writeValueAsBytes(expected.get("events")).length : 0;
            // Existing budgets apply to simulations; estimator envelopes do not use these guards.
            if (!fixture.estimator()) {
                assertThat(expectedBytes.length).isLessThanOrEqualTo(http.maxSimulationResponseBytes());
                assertThat(eventBytes).isLessThanOrEqualTo((int) SimulationBudget.DEFAULT_MAX_TRACE_BYTES);
            }
            for (int i = 0; i < WARMUPS; i++) mapper.writeValueAsBytes(fixture.run().get());
            List<Sample> samples = new ArrayList<>();
            for (int i = 0; i < SAMPLES; i++) {
                long start = System.nanoTime();
                Object result = fixture.run().get();
                long generated = System.nanoTime();
                byte[] serialized = mapper.writeValueAsBytes(result);
                long finished = System.nanoTime();
                // Assertions/JSON inspection are outside the measured generation/serialization intervals.
                assertThat(result).as(fixture.id() + " exact replay").isEqualTo(reference);
                assertThat(serialized).as(fixture.id() + " serialized replay").isEqualTo(expectedBytes);
                samples.add(new Sample(i + 1, generated - start, finished - generated));
            }
            Measurement measurement = new Measurement(fixture.id(), fixture.input(), expected.get("status").asString(),
                    expected.hasNonNull("truncationReason") ? expected.get("truncationReason").asString() : null,
                    expected.has("modelVersion") ? expected.get("modelVersion").asString() : null,
                    request.length, eventBytes, expectedBytes.length, fixture.events(), fixture.outcomes(), samples,
                    summary(samples.stream().map(Sample::generationNs).toList()),
                    summary(samples.stream().map(Sample::serializationNs).toList()));
            measurements.add(measurement);
            System.out.printf("PERFORMANCE_EVIDENCE id=%s status=%s inputBytes=%d responseBytes=%d generationMedianMs=%.4f serializationMedianMs=%.4f%n",
                    fixture.id(), measurement.status(), request.length, expectedBytes.length,
                    measurement.generation().medianMs(), measurement.serialization().medianMs());
        }
        var environment = new Environment(Instant.now().toString(),
                System.getProperty("hld.performance.revision", "working-tree"),
                System.getProperty("java.runtime.version"), System.getProperty("java.vm.name"),
                System.getProperty("os.name"), System.getProperty("os.version"), System.getProperty("os.arch"),
                Runtime.getRuntime().availableProcessors(), Runtime.getRuntime().maxMemory(),
                sha256(Path.of("src/test/java/com/hld/performance/SimulationPerformanceEvidenceTest.java")),
                sourceHash());
        var report = new Report("1.0", environment, 1, WARMUPS, SAMPLES,
                "Sequential in-process simulator/calculator call then configured Jackson serialization; no HTTP, startup, parsing, validation annotations, bounded-controller buffering or browser cost. Assertions outside timing. Not a JMH benchmark, sustained-load test, heap measurement or production sizing.",
                measurements);
        Path output = Path.of(System.getProperty("hld.performance.output", "target/performance-evidence.json"));
        Files.createDirectories(output.toAbsolutePath().getParent());
        Files.write(output, mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(report));
        System.out.println("PERFORMANCE_EVIDENCE output=" + output.toAbsolutePath());
    }

    private void verify(Fixture fixture, JsonNode result) {
        assertThat(result.get("status").asString()).as(fixture.id()).isEqualTo(fixture.status());
        if (fixture.estimator()) {
            assertThat(result.get("steps").size()).isEqualTo(9);
            assertThat(result.get("sensitivity").size()).isEqualTo(3);
            assertThat(result.get("metrics").get("dailyRequests").asDouble()).isEqualTo(fixture.metricValue());
        } else {
            assertThat(result.get("events").size()).isEqualTo(fixture.events());
            assertThat(result.get("outcomes").size()).isEqualTo(fixture.outcomes());
            assertThat(result.get("metrics").get(fixture.metric()).asDouble()).isEqualTo(fixture.metricValue());
            if ("limited".equals(fixture.status())) {
                assertThat(result.get("truncationReason").asString()).isEqualTo("virtual_time_limit");
            }
        }
    }

    private List<Fixture> fixtures() {
        List<Fixture> fixtures = new ArrayList<>();
        RequestFlowInput tinyFlow = RequestFlowInput.current(RoutingPolicy.ROUND_ROBIN, List.of(0L), List.of(100L), 1, 100, 7);
        RequestFlowInput largeFlow = RequestFlowInput.current(RoutingPolicy.ROUND_ROBIN,
                Collections.nCopies(SimulationLimits.DEFAULT_MAX_REQUESTS, 0L), Collections.nCopies(SimulationLimits.DEFAULT_MAX_NODES, 100L), 1, 100, 7);
        RequestFlowInput limitedFlow = RequestFlowInput.current(RoutingPolicy.ROUND_ROBIN,
                Collections.nCopies(SimulationLimits.DEFAULT_MAX_REQUESTS, 60_000L), Collections.nCopies(SimulationLimits.DEFAULT_MAX_NODES, 10_000L), 1, 100, 7);
        fixtures.add(new Fixture("flow-tiny", tinyFlow, () -> flow.run(tinyFlow), "completed", 4, 1, "completed", 1, false));
        fixtures.add(new Fixture("flow-max-count", largeFlow, () -> flow.run(largeFlow), "completed", 492, 100, "completed", 100, false));
        fixtures.add(new Fixture("flow-virtual-limit", limitedFlow, () -> flow.run(limitedFlow), "limited", 300, 0, "completed", 0, false));
        CacheAsideInput tinyCache = CacheAsideInput.create(2, 20, 100, "v1", List.of(new CacheOperation("GET", "k", null, 0)), 7);
        CacheAsideInput coldCache = CacheAsideInput.create(2, 20, 100, "v1", Collections.nCopies(CacheAsideLimits.MAX_OPERATIONS, new CacheOperation("GET", "k", null, 0)), 7);
        fixtures.add(new Fixture("cache-tiny", tinyCache, () -> cache.run(tinyCache), "completed", 3, 1, "originReads", 1, false));
        fixtures.add(new Fixture("cache-max-cold-gets", coldCache, () -> cache.run(coldCache), "completed", 300, 100, "originReads", 100, false));
        for (boolean escaped : new boolean[] {false, true}) {
            String value = (escaped ? "\u0001" : "v").repeat(CacheAsideLimits.MAX_VALUE_LENGTH);
            List<CacheOperation> operations = new ArrayList<>();
            int keys = escaped ? CacheAsideLimits.MAX_OPERATIONS / 2 : CacheAsideLimits.MAX_OPERATIONS;
            for (int i = 0; i < keys; i++) {
                String prefix = i + "-";
                String key = prefix + (escaped ? "\u0001" : "k").repeat(CacheAsideLimits.MAX_KEY_LENGTH - prefix.length());
                operations.add(new CacheOperation("UPDATE", key, value, i * 4L));
                if (escaped) operations.add(new CacheOperation("GET", key, null, i * 4L + 1));
            }
            CacheAsideInput input = CacheAsideInput.create(0, 0, 60_000, value, operations, 7);
            fixtures.add(new Fixture(escaped ? "cache-max-escaped-update-read" : "cache-max-ascii-updates", input, () -> cache.run(input),
                    "completed", escaped ? 200 : 100, escaped ? 50 : 0, "originReads", escaped ? 50 : 0, false));
        }
        for (int count : new int[] {1, 500}) {
            RateLimiterInput input = new RateLimiterInput(RateLimiterInput.SCHEMA_VERSION, RateLimiterInput.MODEL_VERSION,
                    RateLimitAlgorithm.FIXED_WINDOW, CounterScope.SHARED, count == 1 ? 1 : 20, 5, 1_000, 2, true,
                    BackendFailurePolicy.FAIL_CLOSED, Collections.nCopies(count, 0L), 42);
            fixtures.add(new Fixture(count == 1 ? "limiter-tiny" : "limiter-max-count", input, () -> limiter.run(input),
                    "completed", count * 2, count, "allowed", Math.min(count, 5), false));
        }
        CapacityEstimateInput baseline = new CapacityEstimateInput("1.0", 1_000_000, 10, 5, 90, 1, 2, 365, 3, 200, 30);
        CapacityEstimateInput maximum = new CapacityEstimateInput("1.0", 1_000_000_000, 100_000, 1_000, 100, 1_000_000, 1_000_000, 36_500, 10, 600_000, 300);
        fixtures.add(new Fixture("capacity-baseline", baseline, () -> capacity.calculate(baseline), "estimated", 0, 0, "dailyRequests", 10_000_000, true));
        fixtures.add(new Fixture("capacity-max-scalars", maximum, () -> capacity.calculate(maximum), "estimated", 0, 0, "dailyRequests", 1e14, true));
        return fixtures;
    }

    private String sha256(Path file) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(file)));
    }

    private String sourceHash() throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        // Match relative paths and bytes, with separators; no environment/credential files.
        List<Path> files = new ArrayList<>(List.of(Path.of("pom.xml")));
        try (var paths = Files.walk(Path.of("src/main"))) {
            files.addAll(paths.filter(Files::isRegularFile).toList());
        }
        for (Path file : files.stream().sorted().toList()) {
            digest.update(file.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            digest.update((byte) 0);
            digest.update(Files.readAllBytes(file));
            digest.update((byte) 0);
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    private Summary summary(List<Long> values) {
        List<Long> sorted = values.stream().sorted().toList();
        double median = (sorted.get((sorted.size() - 1) / 2).doubleValue() + sorted.get(sorted.size() / 2).doubleValue()) / 2;
        return new Summary(sorted.get(0) / 1e6, median / 1e6, sorted.get(sorted.size() - 1) / 1e6);
    }

    record Fixture(String id, Object input, Supplier<Object> run, String status, int events, int outcomes,
                   String metric, double metricValue, boolean estimator) {}
    record Sample(int index, long generationNs, long serializationNs) {}
    record Summary(double minMs, double medianMs, double maxMs) {}
    record Measurement(String id, Object input, String status, String truncationReason, String modelVersion,
                       int requestBytes, int eventsBytes, int responseBytes, int eventCount, int outcomeCount,
                       List<Sample> samples, Summary generation, Summary serialization) {}
    record Environment(String capturedAtUtc, String revision, String javaRuntime, String javaVm, String os,
                       String osVersion, String architecture, int logicalProcessors, long jvmMaxHeapBytes,
                       String measurementSourceSha256, String applicationSourceSha256) {}
    record Report(String schemaVersion, Environment environment, int untimedReferenceRunsPerFixture,
                  int warmupsPerFixture, int samplesPerFixture,
                  String measurementBoundary, List<Measurement> fixtures) {}
}
