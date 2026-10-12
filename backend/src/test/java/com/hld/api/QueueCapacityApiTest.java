package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.queues.QueueCapacityDescriptor;
import com.hld.queues.QueueCapacityInput;
import com.hld.queues.QueueCapacityInput.Job;
import com.hld.queues.QueueCapacityLimits;
import com.hld.queues.QueueCapacitySimulator;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Actual packaged-resource/controller HTTP behavior, without inventing Java outcomes in a client. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class QueueCapacityApiTest {
    private static final String MODEL = "/api/v1/simulations/queues-tail-latency";
    private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired QueueCapacityController controller;
    @Autowired QueueCapacitySimulator simulator;
    @Autowired HttpExecutionLimits limits;

    private HttpResponse<byte[]> get(String path) throws Exception {
        return CLIENT.send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(15)).GET().build(),
                HttpResponse.BodyHandlers.ofByteArray());
    }

    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }

    private HttpResponse<byte[]> post(byte[] body) throws Exception {
        // Only sequential test setup/recovery polls a transient permit-release race.
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        HttpResponse<byte[]> response;
        do {
            response = CLIENT.send(HttpRequest.newBuilder(uri(MODEL + "/runs")).timeout(Duration.ofSeconds(15))
                    .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofByteArray(body)).build(),
                    HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() != 503) return response;
            Thread.sleep(10);
        } while (System.nanoTime() < deadline);
        return response;
    }

    private JsonNode successful(HttpResponse<byte[]> response) {
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type").orElseThrow()).startsWith("application/json");
        return mapper.readTree(response.body());
    }

    private void invalid(byte[] body) throws Exception {
        var response = post(body);
        assertThat(response.statusCode()).as(new String(body, StandardCharsets.UTF_8)).isEqualTo(400);
        var error = mapper.readTree(response.body());
        assertThat(Set.copyOf(error.propertyNames())).containsExactlyInAnyOrder("code", "message", "fieldErrors", "timestamp");
        assertThat(error.path("code").asString()).isEqualTo("invalid_input");
        assertThat(error.has("events")).isFalse();
    }

    private QueueCapacityInput baseline() { return controller.descriptor().presets().get(0).input(); }

    @Test void exposesAuthoritativeBoundsAssumptionsAndFiveExecutablePresets() throws Exception {
        var response = get(MODEL);
        successful(response);
        QueueCapacityDescriptor descriptor = mapper.readValue(response.body(), QueueCapacityDescriptor.class);
        assertThat(descriptor.id()).isEqualTo(QueueCapacitySimulator.SIMULATION_ID);
        assertThat(descriptor.kind()).isEqualTo("simulation");
        assertThat(descriptor.modelVersion()).isEqualTo(QueueCapacitySimulator.MODEL_VERSION);
        assertThat(descriptor.limits()).isEqualTo(QueueCapacityLimits.CURRENT);
        assertThat(descriptor.limits().jobIdPattern()).isEqualTo("^[a-z][a-z0-9-]{0,31}$");
        assertThat(descriptor.assumptions()).isEqualTo(QueueCapacitySimulator.ASSUMPTIONS);
        assertThat(descriptor.presets()).extracting(QueueCapacityDescriptor.Preset::id)
                .containsExactly("baseline", "larger-buffer", "more-workers", "slow-job", "virtual-limit");
        for (var preset : descriptor.presets()) {
            var actual = successful(post(mapper.writeValueAsBytes(preset.input())));
            assertThat(actual).as(preset.id()).isEqualTo(mapper.readTree(mapper.writeValueAsBytes(simulator.run(preset.input()))));
        }
        var baseline = successful(post(mapper.writeValueAsBytes(baseline())));
        assertThat(baseline.at("/metrics/completed").asInt()).isEqualTo(2);
        assertThat(baseline.at("/metrics/rejected").asInt()).isEqualTo(2);
        assertThat(baseline.at("/metrics/meanSuccessfulWaitMs").asDouble()).isEqualTo(5);
        assertThat(baseline.at("/metrics/meanSuccessfulLatencyMs").asDouble()).isEqualTo(15);
    }

    @Test void authoredLessonAndEveryPresetReconcileWithActualJavaMath() throws Exception {
        var presets = controller.descriptor().presets();
        assertThat(presets).extracting(QueueCapacityDescriptor.Preset::title)
                .containsExactly("One waiting slot", "More waiting space", "More workers", "Slow first job", "Virtual-time limit");
        var base = simulator.run(presets.get(0).input());
        assertThat(base.metrics().completed()).isEqualTo(2);
        assertThat(base.metrics().rejected()).isEqualTo(2);
        assertThat(base.metrics().meanSuccessfulLatencyMs()).isEqualTo(15);
        var larger = simulator.run(presets.get(1).input());
        assertThat(larger.outcomes()).extracting(com.hld.queues.QueueCapacityOutcome::terminalTimeMs)
                .containsExactly(10L, 20L, 30L, 40L);
        assertThat(larger.metrics().meanSuccessfulLatencyMs()).isEqualTo(25);
        assertThat(larger.metrics().p95SuccessfulLatencyMs()).isEqualTo(40);
        var workers = simulator.run(presets.get(2).input());
        assertThat(workers.metrics().completed()).isEqualTo(3);
        assertThat(workers.metrics().rejected()).isEqualTo(1);
        assertThat(workers.metrics().meanSuccessfulLatencyMs()).isEqualTo(40.0 / 3);
        var slow = simulator.run(presets.get(3).input());
        assertThat(slow.outcomes()).extracting(com.hld.queues.QueueCapacityOutcome::terminalTimeMs)
                .containsExactly(100L, 101L, 102L, 103L);
        assertThat(slow.metrics().meanSuccessfulLatencyMs()).isEqualTo(101.5);
        assertThat(slow.metrics().p95SuccessfulLatencyMs()).isEqualTo(103);
        var limited = simulator.run(presets.get(4).input());
        assertThat(limited.lastVirtualTimeMs()).isEqualTo(60_000);
        assertThat(limited.metrics().running()).isEqualTo(1);
        assertThat(limited.metrics().completed()).isZero();
        assertThat(limited.outcomes().get(0).terminalTimeMs()).isNull();
        var draft = successful(get("/api/v1/draft/topics/queues-tail-latency"));
        Path content = Path.of("../content/topics/queues-tail-latency");
        assertThat(draft.path("lessonMarkdown").asString()).isEqualTo(Files.readString(content.resolve("lesson.md")));
        assertThat(draft.path("questions")).isEqualTo(mapper.readTree(Files.readAllBytes(content.resolve("questions.json"))));
        assertThat(draft.path("questions").size()).isEqualTo(6);
    }

    @Test void rejectsMissingNullUnknownAndCoercedRootAndNestedFields() throws Exception {
        ObjectNode valid = (ObjectNode) mapper.valueToTree(baseline());
        List<JsonNode> invalid = new ArrayList<>();
        for (String field : valid.propertyNames()) {
            ObjectNode absent = valid.deepCopy(); absent.remove(field); invalid.add(absent);
            ObjectNode nulled = valid.deepCopy(); nulled.putNull(field); invalid.add(nulled);
        }
        ObjectNode extra = valid.deepCopy(); extra.put("unknown", 1); invalid.add(extra);
        for (String field : List.of("workers", "queueCapacity", "seed")) {
            ObjectNode string = valid.deepCopy(); string.put(field, "1"); invalid.add(string);
            ObjectNode decimal = valid.deepCopy(); decimal.put(field, 1.5); invalid.add(decimal);
            ObjectNode bool = valid.deepCopy(); bool.put(field, true); invalid.add(bool);
        }
        for (String field : List.of("id", "arrivalTimeMs", "serviceTimeMs")) {
            ObjectNode absent = valid.deepCopy(); ((ObjectNode) absent.at("/jobs/0")).remove(field); invalid.add(absent);
            ObjectNode nulled = valid.deepCopy(); ((ObjectNode) nulled.at("/jobs/0")).putNull(field); invalid.add(nulled);
        }
        for (String field : List.of("arrivalTimeMs", "serviceTimeMs")) {
            ObjectNode string = valid.deepCopy(); ((ObjectNode) string.at("/jobs/0")).put(field, "1"); invalid.add(string);
            ObjectNode decimal = valid.deepCopy(); ((ObjectNode) decimal.at("/jobs/0")).put(field, 1.5); invalid.add(decimal);
            ObjectNode bool = valid.deepCopy(); ((ObjectNode) bool.at("/jobs/0")).put(field, true); invalid.add(bool);
        }
        ObjectNode nestedExtra = valid.deepCopy(); ((ObjectNode) nestedExtra.at("/jobs/0")).put("unknown", 1); invalid.add(nestedExtra);
        ObjectNode wrongId = valid.deepCopy(); ((ObjectNode) wrongId.at("/jobs/0")).put("id", 1); invalid.add(wrongId);
        ObjectNode nullJob = valid.deepCopy(); ((tools.jackson.databind.node.ArrayNode) nullJob.get("jobs")).set(0, mapper.nullNode()); invalid.add(nullJob);
        ObjectNode jobsString = valid.deepCopy(); jobsString.put("jobs", "not-an-array"); invalid.add(jobsString);
        for (JsonNode body : invalid) invalid(mapper.writeValueAsBytes(body));
        String json = mapper.writeValueAsString(valid);
        for (String malformed : List.of("", "null", "[]", "{", json + "{}",
                json.replace("\"workers\":1", "\"workers\":1,\"workers\":2"),
                json.replace("\"serviceTimeMs\":10", "\"serviceTimeMs\":10,\"serviceTimeMs\":1"))) {
            invalid(malformed.getBytes(StandardCharsets.UTF_8));
        }
        assertThat(successful(post(mapper.writeValueAsBytes(baseline()))).path("status").asString()).isEqualTo("completed");
    }

    @Test void servesCanonicalDraftCheckpointsWithoutChangingCacheTargetsOrPublishedDiscovery() throws Exception {
        var draft = successful(get("/api/v1/draft/topics/queues-tail-latency"));
        var canonicalCatalog = mapper.readTree(Files.readAllBytes(Path.of("../content/catalog.json")));
        JsonNode canonicalEntry = null;
        for (JsonNode entry : canonicalCatalog) {
            if (entry.path("id").asString().equals("queues-tail-latency")) canonicalEntry = entry;
        }
        assertThat(canonicalEntry).isNotNull();
        assertThat(draft.path("topic")).isEqualTo(canonicalEntry);
        assertThat(draft.at("/topic/contentVersion").asString()).isEqualTo("1.1.0");
        assertThat(draft.at("/topic/status").asString()).isEqualTo("draft");
        assertThat(draft.at("/topic/capabilities")).anySatisfy(capability ->
                assertThat(capability.asString()).isEqualTo("guided"));
        var expected = mapper.readTree(Files.readAllBytes(Path.of("../content/topics/queues-tail-latency/checkpoints.json")));
        assertThat(draft.path("checkpoints")).isEqualTo(expected);
        assertThat(draft.path("checkpoints").size()).isEqualTo(8);
        for (JsonNode checkpoint : draft.path("checkpoints")) {
            assertThat(checkpoint.path("target").propertyNames()).containsExactlyInAnyOrder("jobId", "kind", "occurrence");
        }
        var cache = successful(get("/api/v1/topics/cache-aside"));
        var expectedCache = mapper.readTree(Files.readAllBytes(Path.of("../content/topics/cache-aside/checkpoints.json")));
        assertThat(cache.path("checkpoints")).isEqualTo(expectedCache);
        for (JsonNode checkpoint : cache.path("checkpoints")) {
            assertThat(checkpoint.path("target").propertyNames()).containsExactlyInAnyOrder("operation", "kind", "occurrence");
        }
        assertThat(get("/api/v1/topics/queues-tail-latency").statusCode()).isEqualTo(404);
        for (JsonNode entry : successful(get("/api/v1/topics"))) {
            assertThat(entry.path("id").asString()).isNotEqualTo("queues-tail-latency");
        }
        for (JsonNode hit : successful(get("/api/v1/search?q=queue")).path("results")) {
            assertThat(hit.at("/entry/id").asString()).isNotEqualTo("queues-tail-latency");
        }
    }

    @Test void enforcesVersionsDomainRangesAndSafeSeedBoundaries() throws Exception {
        ObjectNode valid = (ObjectNode) mapper.valueToTree(baseline());
        for (String field : List.of("schemaVersion", "modelVersion")) {
            ObjectNode bad = valid.deepCopy(); bad.put(field, "9.9"); invalid(mapper.writeValueAsBytes(bad));
        }
        for (var entry : List.of(new Object[] {"workers", 0L}, new Object[] {"workers", 9L},
                new Object[] {"queueCapacity", -1L}, new Object[] {"queueCapacity", 101L},
                new Object[] {"seed", 9_007_199_254_740_992L}, new Object[] {"seed", -9_007_199_254_740_992L})) {
            ObjectNode bad = valid.deepCopy(); bad.put((String) entry[0], (long) entry[1]); invalid(mapper.writeValueAsBytes(bad));
        }
        for (var entry : List.of(new Object[] {"arrivalTimeMs", -1L}, new Object[] {"arrivalTimeMs", 60_001L},
                new Object[] {"serviceTimeMs", 0L}, new Object[] {"serviceTimeMs", 10_001L})) {
            ObjectNode bad = valid.deepCopy(); ((ObjectNode) bad.at("/jobs/0")).put((String) entry[0], (long) entry[1]);
            invalid(mapper.writeValueAsBytes(bad));
        }
        for (String id : List.of("UPPER", "prefix!suffix", "x".repeat(33), "job\n")) {
            ObjectNode bad = valid.deepCopy(); ((ObjectNode) bad.at("/jobs/0")).put("id", id); invalid(mapper.writeValueAsBytes(bad));
        }
        ObjectNode duplicate = valid.deepCopy(); ((ObjectNode) duplicate.at("/jobs/1")).put("id", "job-1"); invalid(mapper.writeValueAsBytes(duplicate));
        ObjectNode unsorted = valid.deepCopy(); ((ObjectNode) unsorted.at("/jobs/0")).put("arrivalTimeMs", 1); invalid(mapper.writeValueAsBytes(unsorted));
        ObjectNode empty = valid.deepCopy(); empty.set("jobs", mapper.createArrayNode()); invalid(mapper.writeValueAsBytes(empty));
        ObjectNode huge = valid.deepCopy(); huge.set("jobs", mapper.valueToTree(IntStream.range(0, 101).mapToObj(i -> new Job("j" + i, 0, 1)).toList()));
        invalid(mapper.writeValueAsBytes(huge));
        for (long seed : new long[] {-QueueCapacitySimulator.MAX_ABSOLUTE_SEED, QueueCapacitySimulator.MAX_ABSOLUTE_SEED}) {
            ObjectNode boundary = valid.deepCopy(); boundary.put("seed", seed);
            assertThat(successful(post(mapper.writeValueAsBytes(boundary))).path("seed").asLong()).isEqualTo(seed);
        }
    }

    @Test void supportsMaximumDefaultPayloadAndTruthfulVirtualLimitedOutcomes() throws Exception {
        var jobs = IntStream.range(0, 100).mapToObj(i -> new Job("j" + "x".repeat(28) + String.format("%03d", i), 0, 1)).toList();
        var input = new QueueCapacityInput("1.0", "1.0.0", 8, 100, jobs, 7);
        byte[] body = mapper.writeValueAsBytes(input);
        assertThat(body.length).isLessThanOrEqualTo(limits.maxRequestBytes());
        var response = post(body);
        var result = successful(response);
        assertThat(response.body().length).isLessThanOrEqualTo(limits.maxSimulationResponseBytes());
        assertThat(result.path("status").asString()).isEqualTo("completed");
        assertThat(result.at("/metrics/completed").asInt()).isEqualTo(100);
        assertThat(result.at("/metrics/rejected").asInt()).isZero();
        var limited = successful(post(mapper.writeValueAsBytes(controller.descriptor().presets().get(4).input())));
        assertThat(limited.path("status").asString()).isEqualTo("limited");
        assertThat(limited.path("truncationReason").asString()).isEqualTo("virtual_time_limit");
        assertThat(limited.at("/outcomes/0/status").asString()).isEqualTo("RUNNING");
        assertThat(limited.at("/outcomes/0").has("terminalTimeMs")).isFalse();
        assertThat(limited.at("/metrics/completed").asInt()).isZero();
        assertThat(limited.at("/metrics").has("meanSuccessfulLatencyMs")).isFalse();
        assertThat(successful(post(mapper.writeValueAsBytes(baseline()))).at("/metrics/completed").asInt()).isEqualTo(2);
    }

    @Test void explicitDraftTopicDoesNotLeakThroughPublishedLookupsCollectionsSearchOrPath() throws Exception {
        var draft = successful(get("/api/v1/draft/topics/queues-tail-latency"));
        assertThat(draft.at("/topic/status").asString()).isEqualTo("draft");
        assertThat(draft.at("/topic/kind").asString()).isEqualTo("topic");
        assertThat(draft.at("/topic/simulationIds/0").asString()).isEqualTo(QueueCapacitySimulator.SIMULATION_ID);
        assertThat(draft.path("lessonMarkdown").asString()).isNotBlank();
        assertThat(draft.path("questions").size()).isGreaterThan(0);
        for (String id : List.of("request-flow", "url-shortener", "unknown")) {
            assertThat(get("/api/v1/draft/topics/" + id).statusCode()).isEqualTo(404);
        }
        assertThat(get("/api/v1/topics/queues-tail-latency").statusCode()).isEqualTo(404);
        var topics = successful(get("/api/v1/topics"));
        assertThat(topics.size()).isEqualTo(4);
        for (JsonNode topic : topics) {
            assertThat(topic.path("status").asString()).isEqualTo("published");
            assertThat(topic.path("id").asString()).isNotEqualTo(QueueCapacitySimulator.SIMULATION_ID);
        }
        assertThat(successful(get("/api/v1/case-studies")).size()).isZero();
        var search = successful(get("/api/v1/search?q=queue"));
        for (JsonNode hit : search.path("results")) {
            assertThat(hit.at("/entry/status").asString()).isEqualTo("published");
            assertThat(hit.at("/entry/id").asString()).isNotEqualTo(QueueCapacitySimulator.SIMULATION_ID);
        }
        var path = successful(get("/api/v1/learning-paths/first-system-design"));
        for (JsonNode step : path.path("steps")) {
            assertThat(step.path("moduleId").asString()).isNotEqualTo(QueueCapacitySimulator.SIMULATION_ID);
        }
    }
}
