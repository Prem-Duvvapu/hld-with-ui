package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.hld.retries.RetryDescriptor;
import com.hld.retries.RetryInput;
import com.hld.retries.RetryInput.Backoff;
import com.hld.retries.RetryInput.Jitter;
import com.hld.retries.RetryInput.Request;
import com.hld.retries.RetryLimits;
import com.hld.retries.RetryPresets;
import com.hld.retries.RetrySimulator;
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
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Actual HTTP token validation and full evidence comparison with the unchanged pure model. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RetryApiTest {
    private static final String MODEL = "/api/v1/simulations/timeouts-retries";
    private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private static final List<String> FIELDS = List.of("schemaVersion", "modelVersion", "seed", "workers", "queueCapacity",
            "attemptTimeoutMs", "overallTimeoutMs", "maxAttempts", "backoff", "baseDelayMs", "maxDelayMs", "jitter",
            "retryBudget", "unavailableUntilMs", "requests");
    private static final List<String> INTEGERS = List.of("workers", "queueCapacity", "attemptTimeoutMs", "overallTimeoutMs",
            "maxAttempts", "baseDelayMs", "maxDelayMs", "retryBudget", "unavailableUntilMs");
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired RetryController controller;
    @MockitoSpyBean RetrySimulator simulator;

    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
    private HttpResponse<byte[]> get(String path) throws Exception {
        return CLIENT.send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(15)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
    }
    private HttpResponse<byte[]> post(byte[] body) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        HttpResponse<byte[]> response;
        do {
            response = CLIENT.send(HttpRequest.newBuilder(uri(MODEL + "/runs")).timeout(Duration.ofSeconds(15))
                    .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofByteArray(body)).build(), HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() != 503 || !mapper.readTree(response.body()).path("code").asString().equals("simulation_busy")) return response;
            Thread.sleep(10); // Test-only resource recovery; no model timing.
        } while (System.nanoTime() < deadline);
        return response;
    }
    private JsonNode success(HttpResponse<byte[]> response) {
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type").orElseThrow()).startsWith("application/json");
        return mapper.readTree(response.body());
    }
    private void invalid(byte[] body) throws Exception {
        clearInvocations(simulator);
        var response = post(body);
        assertThat(response.statusCode()).as(new String(body, StandardCharsets.UTF_8)).isEqualTo(400);
        var json = mapper.readTree(response.body());
        assertThat(json.propertyNames()).containsExactlyInAnyOrder("code", "message", "fieldErrors", "timestamp");
        assertThat(json.path("code").asString()).isEqualTo("invalid_input");
        assertThat(json.path("message").asString()).isNotBlank().doesNotContain("com.hld");
        assertThat(json.path("fieldErrors").isObject()).isTrue();
        assertThat(json.path("fieldErrors").size()).isZero();
        for (String absent : List.of("events", "metrics", "finalState", "initialState")) assertThat(json.has(absent)).isFalse();
        verify(simulator, never()).run(any());
    }
    private ObjectNode tree() { return (ObjectNode) mapper.valueToTree(RetryPresets.baseline()); }
    private static ObjectNode request(ObjectNode root) { return (ObjectNode) root.path("requests").get(0); }

    @Test void descriptorUsesThirteenModelDerivedLimitsAndExactlyEightCanonicalPresets() throws Exception {
        var response = get(MODEL);
        var json = success(response);
        assertThat(json.propertyNames()).containsExactlyInAnyOrder("id", "title", "kind", "modelVersion", "description", "limits", "presets", "assumptions");
        assertThat(json.path("limits").propertyNames()).containsExactlyInAnyOrder("maxSafeSeed", "maxWorkers", "maxQueueCapacity",
                "maxRequests", "maxArrivalTimeMs", "maxServiceTimeMs", "maxAttemptTimeoutMs", "maxOverallTimeoutMs",
                "maxAttempts", "maxDelayMs", "maxRetryBudget", "maxUnavailableUntilMs", "maxIdLength");
        var descriptor = mapper.readValue(response.body(), RetryDescriptor.class);
        assertThat(descriptor).isEqualTo(controller.descriptor());
        assertThat(descriptor.id()).isEqualTo("timeouts-retries");
        assertThat(descriptor.title()).isEqualTo("Timeouts & Retries");
        assertThat(descriptor.kind()).isEqualTo("simulation");
        assertThat(descriptor.modelVersion()).isEqualTo("1.0.0");
        assertThat(descriptor.limits()).isEqualTo(new RetryLimits(9007199254740991L, 3, 12, 12, 10000, 1000, 1000, 10000, 5, 1000, 48, 10000, 32));
        assertThat(descriptor.presets()).isEqualTo(RetryPresets.all());
        assertThat(descriptor.presets()).extracting(RetryPresets.Preset::id).containsExactly("late-work", "healthy-timeout", "queue-full",
                "immediate-outage", "backoff-recovery", "deadline-before-retry", "retry-budget", "jittered-recovery");
        assertThat(descriptor.presets().get(0).input()).isEqualTo(RetryPresets.baseline());
        assertThat(descriptor.assumptions()).isEqualTo(RetrySimulator.ASSUMPTIONS);
    }

    @Test void descriptorSnapshotMatchesActualGetAndOnlyExplicitAuthoringCanWriteIt() throws Exception {
        byte[] actual = get(MODEL).body();
        assertThat(success(get(MODEL))).isEqualTo(mapper.readTree(actual));
        Path fixture = Path.of("../contracts/examples/timeouts-retries-descriptor.json");
        if (Boolean.getBoolean("hld.writeRetryDescriptor")) Files.write(fixture, actual);
        assertThat(fixture).exists();
        assertThat(mapper.readTree(Files.readAllBytes(fixture))).isEqualTo(mapper.readTree(actual));
    }

    @Test void everyPresetUsesActualJavaEvidenceCapturedInputAndExactReplay() throws Exception {
        for (var preset : controller.descriptor().presets()) {
            byte[] body = mapper.writeValueAsBytes(preset.input());
            var actual = success(post(body));
            assertThat(actual).as(preset.id()).isEqualTo(mapper.readTree(mapper.writeValueAsBytes(new RetrySimulator().run(preset.input()))));
            assertThat(success(post(body))).isEqualTo(actual);
            assertThat(actual.path("input")).isEqualTo(mapper.readTree(body));
            assertThat(actual.path("kind").asString()).isEqualTo("simulation");
            assertThat(actual.path("status").asString()).isEqualTo("completed");
            assertThat(actual.path("schemaVersion").asString()).isEqualTo("1.0");
            assertThat(actual.path("modelVersion").asString()).isEqualTo("1.0.0");
            assertThat(actual.path("finalState")).isEqualTo(actual.path("events").get(actual.path("events").size() - 1).path("postState"));
            assertThat(actual.has("truncationReason")).isFalse();
            assertThat(actual.has("lastVirtualTimeMs")).isFalse();
        }
    }

    @Test void allFourOriginalGoldenPairsRemainExactThroughHttp() throws Exception {
        for (String name : List.of("baseline", "backoff", "deadline", "jitter")) {
            var prefix = "../contracts/examples/timeouts-retries-" + name;
            byte[] input = Files.readAllBytes(Path.of(prefix + "-input.json"));
            assertThat(success(post(input))).as(name).isEqualTo(mapper.readTree(Files.readAllBytes(Path.of(prefix + "-result.json"))));
        }
    }

    @Test void logicalFailuresAndLateAcceptedWorkAreSuccessfulTransportResults() throws Exception {
        var result = success(post(mapper.writeValueAsBytes(RetryPresets.baseline())));
        assertThat(result.at("/metrics/failedRequests").asInt()).isEqualTo(1);
        assertThat(result.at("/metrics/completedServerWork").asInt()).isEqualTo(2);
        assertThat(result.at("/metrics/lateCompletions").asInt()).isEqualTo(2);
        assertThat(result.at("/finalState/requests/0/failureReason").asString()).isEqualTo("ATTEMPTS_EXHAUSTED");
        assertThat(result.at("/events/0/postState/requests/0/phase").asString()).isEqualTo("READY");
        assertThat(result.at("/events/1/postState/attempts/0/workState").asString()).isEqualTo("PENDING_ADMISSION");
        var timedOut = result.path("events").get(3);
        assertThat(timedOut.at("/postState/requests/0/phase").asString()).isEqualTo("DECIDING_RETRY");
        assertThat(timedOut.at("/postState/requests/0").has("activeAttemptId")).isFalse();
        assertThat(result.at("/finalState/attempts/0/timeoutAtMs").asInt()).isEqualTo(50);
        assertThat(result.at("/finalState/attempts/0/callerFinishedAtMs").asInt()).isEqualTo(50);
        assertThat(result.at("/finalState/attempts/0/completedAtMs").asInt()).isEqualTo(80);
    }

    @Test void missingUnknownNullAndWrongTypedFieldsRejectBeforeTheSimulator() throws Exception {
        var invalid = new ArrayList<ObjectNode>();
        var json = tree(); json.put("unknown", true); invalid.add(json);
        for (String field : FIELDS) {
            json = tree(); json.remove(field); invalid.add(json);
            json = tree(); json.putNull(field); invalid.add(json);
        }
        for (String field : List.of("id", "arrivalTimeMs", "serviceTimeMs")) {
            json = tree(); request(json).remove(field); invalid.add(json);
            json = tree(); request(json).putNull(field); invalid.add(json);
        }
        json = tree(); request(json).put("extra", 1); invalid.add(json);
        for (String field : INTEGERS) {
            json = tree(); json.put(field, "1"); invalid.add(json);
            json = tree(); json.put(field, true); invalid.add(json);
            json = tree(); json.put(field, 1.0); invalid.add(json);
            json = tree(); json.put(field, 2147483648L); invalid.add(json);
        }
        for (String field : List.of("schemaVersion", "modelVersion", "backoff", "jitter")) {
            json = tree(); json.put(field, true); invalid.add(json);
        }
        for (String field : List.of("arrivalTimeMs", "serviceTimeMs")) {
            json = tree(); request(json).put(field, "1"); invalid.add(json);
            json = tree(); request(json).put(field, false); invalid.add(json);
            json = tree(); request(json).put(field, 1.0); invalid.add(json);
        }
        json = tree(); json.put("seed", "42"); invalid.add(json);
        json = tree(); json.put("seed", false); invalid.add(json);
        json = tree(); json.put("seed", 42.0); invalid.add(json);
        json = tree(); request(json).put("id", false); invalid.add(json);
        json = tree(); json.set("requests", mapper.createObjectNode()); invalid.add(json);
        json = tree(); ((ArrayNode) json.path("requests")).addNull(); invalid.add(json);
        json = tree(); ((ArrayNode) json.path("requests")).removeAll(); invalid.add(json);
        json = tree(); var entries = (ArrayNode) json.path("requests");
        for (int i = 1; i <= 12; i++) entries.add(mapper.valueToTree(new Request("r" + i, 0, 1))); invalid.add(json);
        for (var bad : invalid) invalid(mapper.writeValueAsBytes(bad));
        assertThat(success(post(mapper.writeValueAsBytes(RetryPresets.baseline()))).path("status").asString()).isEqualTo("completed");
    }

    @Test void duplicateKeysTrailingRootsFractionalAndOverflowingTokensReject() throws Exception {
        String baseline = mapper.writeValueAsString(RetryPresets.baseline());
        for (String bad : List.of(baseline + "{}", baseline + "null", baseline + "42",
                baseline.substring(0, baseline.length() - 1) + ",\"seed\":1}",
                baseline.replace("\"serviceTimeMs\":80", "\"serviceTimeMs\":80,\"serviceTimeMs\":1"),
                baseline.replace("\"seed\":42", "\"seed\":42e0"),
                baseline.replace("\"seed\":42", "\"seed\":9223372036854775808"),
                baseline.replace("\"seed\":42", "\"seed\":-9223372036854775809"),
                baseline.replace("\"workers\":1", "\"workers\":1e0"),
                baseline.replace("\"serviceTimeMs\":80", "\"serviceTimeMs\":80e0"),
                "null", "[]", "42", "\"retry\"", "{", "")) {
            assertThat(bad).isNotEqualTo(baseline);
            invalid(bad.getBytes(StandardCharsets.UTF_8));
        }
    }

    @Test void wellShapedDomainBoundariesAndCrossFieldErrorsNeverExecute() throws Exception {
        var invalid = new ArrayList<ObjectNode>();
        for (String field : List.of("schemaVersion", "modelVersion", "backoff", "jitter")) {
            var json = tree(); json.put(field, "UNKNOWN"); invalid.add(json);
        }
        for (var entry : Map.of("workers", new int[]{0, 4}, "queueCapacity", new int[]{-1, 13},
                "attemptTimeoutMs", new int[]{0, 1001}, "overallTimeoutMs", new int[]{0, 10001},
                "maxAttempts", new int[]{0, 6}, "retryBudget", new int[]{-1, 49},
                "unavailableUntilMs", new int[]{-1, 10001}).entrySet()) {
            for (int value : entry.getValue()) { var json = tree(); json.put(entry.getKey(), value); invalid.add(json); }
        }
        for (long seed : new long[]{-9007199254740992L, 9007199254740992L}) { var json = tree(); json.put("seed", seed); invalid.add(json); }
        for (String id : List.of("A", "a\n", " a", "a ", "é", "a".repeat(33))) { var json = tree(); request(json).put("id", id); invalid.add(json); }
        for (int value : new int[]{-1, 10001}) { var json = tree(); request(json).put("arrivalTimeMs", value); invalid.add(json); }
        for (int value : new int[]{0, 1001}) { var json = tree(); request(json).put("serviceTimeMs", value); invalid.add(json); }
        var json = tree(); ((ArrayNode) json.path("requests")).add(mapper.valueToTree(new Request("a", 0, 1))); invalid.add(json);
        json = tree(); request(json).put("arrivalTimeMs", 1); ((ArrayNode) json.path("requests")).add(mapper.valueToTree(new Request("b", 0, 1))); invalid.add(json);
        json = tree(); json.put("baseDelayMs", 1); invalid.add(json);
        json = tree(); json.put("maxDelayMs", 1); invalid.add(json);
        json = tree(); json.put("jitter", "FULL"); invalid.add(json);
        json = tree(); json.put("backoff", "EXPONENTIAL"); json.put("baseDelayMs", 0); json.put("maxDelayMs", 1); invalid.add(json);
        json = tree(); json.put("backoff", "EXPONENTIAL"); json.put("baseDelayMs", 2); json.put("maxDelayMs", 1); invalid.add(json);
        json = tree(); json.put("backoff", "EXPONENTIAL"); json.put("baseDelayMs", 1001); json.put("maxDelayMs", 1001); invalid.add(json);
        for (var bad : invalid) invalid(mapper.writeValueAsBytes(bad));
        assertThat(success(post(mapper.writeValueAsBytes(RetryPresets.baseline()))).path("status").asString()).isEqualTo("completed");
    }

    @Test void editedNonPresetWorkloadAndBothSafeSeedBoundariesUseTheSameModel() throws Exception {
        for (long seed : new long[]{-9007199254740991L, 9007199254740991L}) {
            var input = new RetryInput("1.0", "1.0.0", seed, 3, 0, 100, 500, 1, Backoff.IMMEDIATE, 0, 0, Jitter.NONE, 0, 0,
                    List.of(new Request("x".repeat(32), 10, 20), new Request("y", 10, 30), new Request("z", 11, 40)));
            var result = success(post(mapper.writeValueAsBytes(input)));
            assertThat(result).isEqualTo(mapper.readTree(mapper.writeValueAsBytes(new RetrySimulator().run(input))));
            assertThat(result.at("/metrics/succeededRequests").asInt()).isEqualTo(3);
            assertThat(result.at("/metrics/retryBudgetUsed").asInt()).isZero();
        }
    }
}
