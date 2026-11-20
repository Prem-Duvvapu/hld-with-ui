package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.hld.idempotency.IdempotencyDescriptor;
import com.hld.idempotency.IdempotencyInput;
import com.hld.idempotency.IdempotencyInput.Action;
import com.hld.idempotency.IdempotencyInput.Call;
import com.hld.idempotency.IdempotencyInput.Mode;
import com.hld.idempotency.IdempotencyInput.Step;
import com.hld.idempotency.IdempotencyLimits;
import com.hld.idempotency.IdempotencyPresets;
import com.hld.idempotency.IdempotencySimulator;
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
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Actual JSON token rejection, model delegation, captured snapshots and draft visibility. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class IdempotencyApiTest {
    private static final String MODEL = "/api/v1/simulations/idempotency";
    private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private static final List<String> INPUT_FIELDS = List.of("schemaVersion", "modelVersion", "mode", "retentionMs", "calls", "schedule");
    private static final List<String> CALL_FIELDS = List.of("id", "operationId", "tenantId", "key", "units");
    private static final List<String> STEP_FIELDS = List.of("id", "callId", "timeMs", "action");
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired IdempotencyController controller;
    @MockitoSpyBean IdempotencySimulator simulator;

    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
    private HttpResponse<byte[]> get(String path) throws Exception {
        return CLIENT.send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(15)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
    }
    private HttpResponse<byte[]> post(byte[] body) throws Exception {
        return CLIENT.send(HttpRequest.newBuilder(uri(MODEL + "/runs")).timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofByteArray(body)).build(), HttpResponse.BodyHandlers.ofByteArray());
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
        for (String absent : List.of("outcomes", "metrics", "finalState", "initialState")) assertThat(json.has(absent)).isFalse();
        verify(simulator, never()).run(any());
    }
    private ObjectNode tree() { return (ObjectNode) mapper.valueToTree(IdempotencyPresets.baseline()); }
    private static ObjectNode call(ObjectNode root) { return (ObjectNode) root.path("calls").get(0); }
    private static ObjectNode step(ObjectNode root) { return (ObjectNode) root.path("schedule").get(0); }
    private static ObjectNode secondCall(ObjectNode root) { return (ObjectNode) root.path("calls").get(1); }

    @Test void descriptorUsesElevenModelDerivedLimitsAndNineCanonicalPresets() throws Exception {
        var response = get(MODEL);
        var json = success(response);
        assertThat(json.propertyNames()).containsExactlyInAnyOrder("id", "title", "kind", "schemaVersion", "modelVersion", "description", "defaultPresetId", "limits", "presets", "assumptions");
        assertThat(json.path("limits").propertyNames()).containsExactlyInAnyOrder("minCalls", "maxCalls", "minSteps", "maxSteps", "maxUnits", "maxRetentionMs", "maxTimeMs", "maxIdLength", "maxDerivedIdLength", "maxExpiresAtMs", "maxPublishedUnits");
        var descriptor = mapper.readValue(response.body(), IdempotencyDescriptor.class);
        assertThat(descriptor).isEqualTo(controller.descriptor());
        assertThat(descriptor.id()).isEqualTo("idempotency");
        assertThat(descriptor.title()).isEqualTo("Idempotency");
        assertThat(descriptor.kind()).isEqualTo("simulation");
        assertThat(descriptor.schemaVersion()).isEqualTo("1.0");
        assertThat(descriptor.modelVersion()).isEqualTo("1.0.0");
        assertThat(descriptor.defaultPresetId()).isEqualTo("unprotected-response-loss");
        assertThat(descriptor.limits()).isEqualTo(new IdempotencyLimits(1, 12, 2, 48, 1000, 10000, 10000, 32, 39, 20000, 12000));
        assertThat(descriptor.presets()).isEqualTo(IdempotencyPresets.all());
        assertThat(descriptor.presets()).extracting(IdempotencyPresets.Preset::id).containsExactly("unprotected-response-loss", "split-crash-gap", "split-race", "atomic-response-loss", "atomic-race", "payload-conflict", "atomic-payload-race", "retention-boundary", "key-and-tenant-scope");
        assertThat(descriptor.presets().get(0).input()).isEqualTo(IdempotencyPresets.baseline());
        assertThat(descriptor.assumptions()).isEqualTo(IdempotencySimulator.ASSUMPTIONS);
    }

    @Test void descriptorSnapshotMatchesActualGetAndOnlyExplicitAuthoringCanWriteIt() throws Exception {
        var response = get(MODEL);
        var actual = success(response);
        Path fixture = Path.of("../contracts/examples/idempotency-descriptor.json");
        if (Boolean.getBoolean("hld.writeIdempotencyDescriptor")) Files.write(fixture, response.body());
        assertThat(fixture).exists();
        assertThat(mapper.readTree(Files.readAllBytes(fixture))).isEqualTo(actual);
    }

    @Test void allNinePresetsAndTheirOriginalGoldenPairsRemainExactThroughHttp() throws Exception {
        for (var preset : controller.descriptor().presets()) {
            byte[] body = mapper.writeValueAsBytes(preset.input());
            var actual = success(post(body));
            assertThat(actual).as(preset.id()).isEqualTo(mapper.readTree(mapper.writeValueAsBytes(new IdempotencySimulator().run(preset.input()))));
            assertThat(success(post(body))).isEqualTo(actual);
            assertThat(actual.path("input")).isEqualTo(mapper.readTree(body));
            assertThat(actual.path("kind").asString()).isEqualTo("simulation");
            assertThat(actual.path("status").asString()).isEqualTo("completed");
            assertThat(actual.path("schemaVersion").asString()).isEqualTo("1.0");
            assertThat(actual.path("modelVersion").asString()).isEqualTo("1.0.0");
            assertThat(actual.path("finalState")).isEqualTo(actual.path("outcomes").get(actual.path("outcomes").size() - 1).path("postState"));
            assertThat(actual.path("outcomes").size()).isEqualTo(preset.input().schedule().size());
            String prefix = "../contracts/examples/idempotency-" + preset.id();
            byte[] goldenInput = Files.readAllBytes(Path.of(prefix + "-input.json"));
            assertThat(mapper.readTree(goldenInput)).isEqualTo(mapper.readTree(body));
            assertThat(success(post(goldenInput))).isEqualTo(mapper.readTree(Files.readAllBytes(Path.of(prefix + "-result.json"))));
            assertThat(actual.has("truncationReason")).isFalse();
            assertThat(actual.has("events")).isFalse();
        }
    }

    @Test void modeOnlyComparisonKeepsTheProgramAndChangesRepeatedEffectsAndReceiptIdentity() throws Exception {
        var baseline = IdempotencyPresets.baseline();
        for (Mode mode : Mode.values()) {
            var input = new IdempotencyInput(baseline.schemaVersion(), baseline.modelVersion(), mode,
                    baseline.retentionMs(), baseline.calls(), baseline.schedule());
            var actual = success(post(mapper.writeValueAsBytes(input)));
            assertThat(actual.path("input")).isEqualTo(mapper.valueToTree(input));
            assertThat(actual.at("/metrics/responsesLost").asInt()).isEqualTo(1);
            assertThat(actual.at("/metrics/publishedEffects").asInt()).isEqualTo(mode == Mode.NO_DEDUP ? 2 : 1);
            assertThat(actual.at("/finalState/calls/1/receipt/effectId").asString()).isEqualTo(mode == Mode.NO_DEDUP ? "effect-b" : "effect-a");
        }
    }

    @Test void legitimateCrashesConflictsAndResponseLossAreCompleted200Results() throws Exception {
        for (String id : List.of("split-crash-gap", "split-race", "payload-conflict", "atomic-payload-race", "atomic-response-loss")) {
            var input = IdempotencyPresets.all().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow().input();
            var result = success(post(mapper.writeValueAsBytes(input)));
            assertThat(result.path("status").asString()).isEqualTo("completed");
            assertThat(result).isEqualTo(mapper.valueToTree(new IdempotencySimulator().run(input)));
        }
    }

    @Test void meaningfulNonPresetEditsUseTheSameModelIncludingMaximumAuthoredIds() throws Exception {
        String id = "x".repeat(32);
        var input = new IdempotencyInput("1.0", "1.0.0", Mode.ATOMIC_EFFECT_RECORD, 9,
                List.of(new Call(id, "operation", "tenant", "original", 7), new Call("retry", "operation", "tenant", "fresh", 7)),
                List.of(new Step("lookup-x", id, 5, Action.LOOKUP), new Step("write-x", id, 5, Action.WRITE_EFFECT),
                        new Step("save-x", id, 5, Action.SAVE_RESULT), new Step("crash-x", id, 5, Action.CRASH_HANDLER),
                        new Step("lookup-retry", "retry", 13, Action.LOOKUP), new Step("write-retry", "retry", 13, Action.WRITE_EFFECT),
                        new Step("save-retry", "retry", 13, Action.SAVE_RESULT), new Step("respond-retry", "retry", 13, Action.RESPOND)));
        var result = success(post(mapper.writeValueAsBytes(input)));
        assertThat(result).isEqualTo(mapper.valueToTree(new IdempotencySimulator().run(input)));
        assertThat(result.at("/metrics/publishedUnits").asInt()).isEqualTo(14);
        assertThat(result.at("/metrics/extraEffects").asInt()).isEqualTo(1);
        assertThat(result.at("/metrics/crashedCallsWithEffects").asInt()).isEqualTo(1);
        assertThat(result.at("/finalState/calls/0").has("receipt")).isFalse();
        assertThat(result.at("/finalState/calls/0/publishedEffectId").asString()).isEqualTo("effect-" + id);
    }

    @Test void missingUnknownNullAndWrongTypedFieldsRejectBeforeTheSimulator() throws Exception {
        var invalid = new ArrayList<ObjectNode>();
        var json = tree(); json.put("unknown", true); invalid.add(json);
        for (String field : INPUT_FIELDS) {
            json = tree(); json.remove(field); invalid.add(json);
            json = tree(); json.putNull(field); invalid.add(json);
        }
        for (String field : CALL_FIELDS) {
            json = tree(); call(json).remove(field); invalid.add(json);
            json = tree(); call(json).putNull(field); invalid.add(json);
        }
        for (String field : STEP_FIELDS) {
            json = tree(); step(json).remove(field); invalid.add(json);
            json = tree(); step(json).putNull(field); invalid.add(json);
        }
        json = tree(); call(json).put("extra", 1); invalid.add(json);
        json = tree(); step(json).put("extra", 1); invalid.add(json);
        for (String field : List.of("schemaVersion", "modelVersion", "mode")) {
            json = tree(); json.put(field, true); invalid.add(json);
        }
        for (String field : List.of("id", "operationId", "tenantId", "key")) {
            json = tree(); call(json).put(field, 42); invalid.add(json);
        }
        for (String field : List.of("id", "callId", "action")) {
            json = tree(); step(json).put(field, false); invalid.add(json);
        }
        for (String field : List.of("calls", "schedule")) {
            json = tree(); json.set(field, mapper.createObjectNode()); invalid.add(json);
            json = tree(); ((ArrayNode) json.path(field)).addNull(); invalid.add(json);
            json = tree(); ((ArrayNode) json.path(field)).removeAll(); invalid.add(json);
        }
        for (var bad : invalid) invalid(mapper.writeValueAsBytes(bad));
        assertThat(success(post(mapper.writeValueAsBytes(IdempotencyPresets.baseline()))).path("status").asString()).isEqualTo("completed");
    }

    @Test void integralNumericTokensAreRequiredAtAllThreeNumericLocations() throws Exception {
        for (int location = 0; location < 3; location++) {
            for (String value : List.of("\"1\"", "true", "1.0", "1e0", "2147483648", "9223372036854775808", "-9223372036854775809", "null")) {
                String field = location == 0 ? "retentionMs" : location == 1 ? "units" : "timeMs";
                String body = mapper.writeValueAsString(IdempotencyPresets.baseline());
                String invalidBody = body.replaceFirst("\"" + field + "\":\\d+", "\"" + field + "\":" + value);
                assertThat(invalidBody).isNotEqualTo(body);
                invalid(invalidBody.getBytes(StandardCharsets.UTF_8));
            }
        }
    }

    @Test void duplicateKeysAndTrailingRootsRejectAtEveryObjectLevel() throws Exception {
        String baseline = mapper.writeValueAsString(IdempotencyPresets.baseline());
        for (String bad : List.of(baseline + "{}", baseline + "null", baseline + "42",
                baseline.substring(0, baseline.length() - 1) + ",\"retentionMs\":1}",
                baseline.replace("\"units\":1", "\"units\":1,\"units\":2"),
                baseline.replace("\"timeMs\":0", "\"timeMs\":0,\"timeMs\":1"),
                "null", "[]", "42", "\"idempotency\"", "{", "")) {
            assertThat(bad).isNotEqualTo(baseline);
            invalid(bad.getBytes(StandardCharsets.UTF_8));
        }
    }

    @Test void domainBoundsAndMalformedWholeProgramsRejectBeforeAnyEffects() throws Exception {
        var invalid = new ArrayList<ObjectNode>();
        for (String field : List.of("schemaVersion", "modelVersion", "mode")) {
            var json = tree(); json.put(field, "UNKNOWN"); invalid.add(json);
        }
        for (int value : new int[]{0, 10001}) { var json = tree(); json.put("retentionMs", value); invalid.add(json); }
        for (int value : new int[]{0, 1001}) { var json = tree(); call(json).put("units", value); invalid.add(json); }
        for (int value : new int[]{-1, 10001}) { var json = tree(); step(json).put("timeMs", value); invalid.add(json); }
        for (String id : List.of("A", "a\n", " a", "a ", "é", "a".repeat(33), "")) {
            for (String field : List.of("id", "operationId", "tenantId", "key")) {
                var json = tree(); call(json).put(field, id); invalid.add(json);
            }
            for (String field : List.of("id", "callId")) { var json = tree(); step(json).put(field, id); invalid.add(json); }
        }
        var json = tree(); step(json).put("callId", "missing"); invalid.add(json);
        json = tree(); secondCall(json).put("id", "a"); invalid.add(json);
        json = tree(); secondCall(json).put("units", 2); invalid.add(json);
        json = tree(); ((ObjectNode) json.path("schedule").get(1)).put("id", "lookup-a"); invalid.add(json);
        json = tree(); step(json).put("timeMs", 1); invalid.add(json);
        for (String action : List.of("UNKNOWN", "WRITE_EFFECT", "SAVE_RESULT", "RESPOND", "LOSE_RESPONSE", "CRASH_HANDLER")) {
            json = tree(); step(json).put("action", action); invalid.add(json);
        }
        json = tree(); ((ArrayNode) json.path("schedule")).remove(7); invalid.add(json);
        json = tree(); ((ObjectNode) json.path("schedule").get(1)).put("action", "CRASH_HANDLER"); invalid.add(json);
        json = tree(); var calls = (ArrayNode) json.path("calls");
        for (int i = 2; i <= 12; i++) calls.add(mapper.valueToTree(new Call("call-" + i, "op", "t", "k", 1))); invalid.add(json);
        json = tree(); var schedule = (ArrayNode) json.path("schedule");
        for (int i = 8; i <= 48; i++) schedule.add(mapper.valueToTree(new Step("step-" + i, "a", 10, Action.RESPOND))); invalid.add(json);
        for (var bad : invalid) invalid(mapper.writeValueAsBytes(bad));
        assertThat(success(post(mapper.writeValueAsBytes(IdempotencyPresets.baseline()))).path("status").asString()).isEqualTo("completed");
    }

    @Test void directDraftHasGuidedCapabilitiesAndRemainsOutsidePublishedDiscovery() throws Exception {
        var detail = success(get("/api/v1/draft/topics/idempotency"));
        assertThat(detail.at("/topic/id").asString()).isEqualTo("idempotency");
        assertThat(detail.at("/topic/status").asString()).isEqualTo("draft");
        assertThat(detail.at("/topic/contentVersion").asString()).isEqualTo("1.1.0");
        var capabilities = new ArrayList<String>();
        for (JsonNode capability : detail.at("/topic/capabilities")) capabilities.add(capability.asString());
        assertThat(capabilities).containsExactlyInAnyOrder("study", "simulation", "guided", "practice");
        assertThat(detail.path("checkpoints").size()).isEqualTo(8);
        assertThat(detail.path("checkpoints")).isEqualTo(mapper.readTree(Files.readAllBytes(
                Path.of("../content/topics/idempotency/checkpoints.json"))));
        assertThat(detail.path("questions").size()).isEqualTo(9);
        assertThat(detail.path("questions")).isEqualTo(mapper.readTree(Files.readAllBytes(
                Path.of("../content/topics/idempotency/questions.json"))));
        assertThat(detail.path("lessonMarkdown").asString()).isEqualTo(Files.readString(
                Path.of("../content/topics/idempotency/lesson.md")));
        assertThat(detail.at("/topic/lessonPath").asString()).isEqualTo("topics/idempotency/lesson.md");
        assertThat(detail.at("/topic/questionsPath").asString()).isEqualTo("topics/idempotency/questions.json");
        assertThat(detail.at("/topic/resourcesPath").asString()).isEqualTo("topics/idempotency/resources.json");
        assertThat(detail.at("/topic/checkpointsPath").asString()).isEqualTo("topics/idempotency/checkpoints.json");
        assertThat(detail.at("/topic/simulationIds")).isEqualTo(mapper.valueToTree(List.of("idempotency")));
        assertThat(detail.at("/topic/prerequisites")).isEqualTo(mapper.valueToTree(List.of("transactions-isolation", "queues-delivery")));
        assertThat(get("/api/v1/topics/idempotency").statusCode()).isEqualTo(404);
        for (JsonNode entry : success(get("/api/v1/topics"))) assertThat(entry.path("id").asString()).isNotEqualTo("idempotency");
        for (JsonNode hit : success(get("/api/v1/search?q=idempotency")).path("results"))
            assertThat(hit.at("/entry/id").asString()).isNotEqualTo("idempotency");
    }
}
