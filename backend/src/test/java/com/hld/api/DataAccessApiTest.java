package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.dataaccess.DataAccessAnalyzer;
import com.hld.dataaccess.DataAccessDescriptor;
import com.hld.dataaccess.DataAccessInput;
import com.hld.dataaccess.DataAccessInput.IndexOrder;
import com.hld.dataaccess.DataAccessInput.Operation;
import com.hld.dataaccess.DataAccessInput.Row;
import com.hld.dataaccess.DataAccessLimits;
import com.hld.dataaccess.DataAccessPresets;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Actual HTTP parsing, draft visibility and authoritative results. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class DataAccessApiTest {
    private static final String MODEL = "/api/v1/simulations/data-access-models";
    private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired DataAccessController controller;
    @Autowired DataAccessAnalyzer analyzer;
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
            if (response.statusCode() != 503) return response;
            Thread.sleep(10); // Sequential test recovery only, not model timing or application retry.
        } while (System.nanoTime() < deadline);
        return response;
    }
    private JsonNode success(HttpResponse<byte[]> response) {
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type").orElseThrow()).startsWith("application/json");
        return mapper.readTree(response.body());
    }
    private void invalid(byte[] body) throws Exception {
        var response = post(body);
        assertThat(response.statusCode()).as(new String(body, StandardCharsets.UTF_8)).isEqualTo(400);
        var error = mapper.readTree(response.body());
        assertThat(error.propertyNames()).containsExactlyInAnyOrder("code", "message", "fieldErrors", "timestamp");
        assertThat(error.path("code").asString()).isEqualTo("invalid_input");
        assertThat(error.has("outcomes")).isFalse();
    }
    private ObjectNode tree() { return (ObjectNode) mapper.valueToTree(DataAccessPresets.baseline()); }
    private static ObjectNode operation(ObjectNode root) { return (ObjectNode) root.get("operations").get(0); }
    private static ObjectNode row(ObjectNode root) { return (ObjectNode) root.get("rows").get(0); }

    @Test void descriptorExposesSevenRealPresetsAndDeclaredLimits() throws Exception {
        var response = get(MODEL);
        success(response);
        var descriptor = mapper.readValue(response.body(), DataAccessDescriptor.class);
        assertThat(descriptor).isEqualTo(controller.descriptor());
        assertThat(descriptor.kind()).isEqualTo("simulation");
        assertThat(descriptor.limits()).isEqualTo(DataAccessLimits.CURRENT);
        assertThat(descriptor.presets()).extracting(DataAccessDescriptor.Preset::id)
                .containsExactly("baseline", "table-scan", "time-first", "global-range", "duplicate-key", "no-unique", "insert-order");
        assertThat(descriptor.assumptions()).isEqualTo(DataAccessAnalyzer.ASSUMPTIONS);
    }
    @Test void everyPresetReturnsTheExactPureJavaEvidenceAndCapturedClosedInput() throws Exception {
        for (var preset : controller.descriptor().presets()) {
            byte[] input = mapper.writeValueAsBytes(preset.input());
            var actual = success(post(input));
            assertThat(actual).as(preset.id()).isEqualTo(mapper.valueToTree(analyzer.run(preset.input())));
            assertThat(actual.path("input")).isEqualTo(mapper.readTree(input));
            assertThat(actual.path("kind").asString()).isEqualTo("analysis");
            assertThat(actual.has("events")).isFalse();
            assertThat(actual.has("seed")).isFalse();
            assertThat(actual.has("lastVirtualTimeMs")).isFalse();
        }
    }
    @Test void allFourOperationVariantsRoundTripWithoutNullableVariantFields() throws Exception {
        var input = new DataAccessInput("1.0", "1.0.0", IndexOrder.CREATED_TENANT, true, DataAccessPresets.rows(),
                List.of(Operation.lookup("lookup", "b2"), Operation.tenantRange("tenant", "beta", 20, 30, 1),
                        Operation.allRange("global", 20, 30, 20), Operation.insert("insert", new Row("d1", "delta", "k1", 25))));
        var result = success(post(mapper.writeValueAsBytes(input)));
        assertThat(result.path("input").path("operations").get(0).propertyNames()).containsExactlyInAnyOrder("id", "kind", "rowId");
        assertThat(result.path("input").path("operations").get(2).has("tenant")).isFalse();
        assertThat(result.path("outcomes").get(0).has("accepted")).isFalse();
        assertThat(result.path("outcomes").get(0).has("conflict")).isFalse();
        assertThat(result.path("outcomes").get(3).path("accepted").asBoolean()).isTrue();
        assertThat(result.path("outcomes").get(3).has("conflict")).isFalse();
    }
    @Test void unknownMissingNullMixedAndCoercedValuesAreRejectedAtRealHttpBoundary() throws Exception {
        List<ObjectNode> invalid = new ArrayList<>();
        var json = tree(); json.put("unknown", true); invalid.add(json);
        for (String field : List.of("schemaVersion", "modelVersion", "indexOrder", "enforceBusinessKey", "rows", "operations")) {
            json = tree(); json.remove(field); invalid.add(json);
            json = tree(); json.putNull(field); invalid.add(json);
        }
        json = tree(); json.put("schemaVersion", "2.0"); invalid.add(json);
        json = tree(); json.put("modelVersion", "2.0.0"); invalid.add(json);
        json = tree(); json.put("indexOrder", "INVENTED"); invalid.add(json);
        json = tree(); json.put("enforceBusinessKey", "true"); invalid.add(json);
        json = tree(); json.put("enforceBusinessKey", 1); invalid.add(json);
        json = tree(); row(json).put("createdOrder", "10"); invalid.add(json);
        json = tree(); row(json).put("createdOrder", 10.0); invalid.add(json);
        json = tree(); row(json).put("createdOrder", 2_147_483_648L); invalid.add(json);
        json = tree(); row(json).put("createdOrder", -1); invalid.add(json);
        json = tree(); row(json).put("createdOrder", 1_000_001); invalid.add(json);
        json = tree(); row(json).put("createdOrder", true); invalid.add(json);
        json = tree(); row(json).put("id", "a1\n"); invalid.add(json);
        json = tree(); row(json).put("id", "A1"); invalid.add(json);
        json = tree(); row(json).put("extra", 1); invalid.add(json);
        json = tree(); operation(json).put("rowId", "b2"); invalid.add(json);
        json = tree(); operation(json).put("kind", "UNKNOWN"); invalid.add(json);
        json = tree(); operation(json).putNull("kind"); invalid.add(json);
        json = tree(); operation(json).remove("kind"); invalid.add(json);
        json = tree(); operation(json).put("limit", 0); invalid.add(json);
        json = tree(); operation(json).put("limit", 21); invalid.add(json);
        json = tree(); operation(json).put("fromCreatedOrder", 31); invalid.add(json);
        json = tree(); operation(json).put("limit", "20"); invalid.add(json);
        json = tree(); operation(json).put("limit", 20.0); invalid.add(json);
        json = tree(); ((ArrayNode) json.get("operations")).add(operation(json).deepCopy()); invalid.add(json);
        json = tree(); ((ArrayNode) json.get("rows")).add(row(json).deepCopy()); invalid.add(json);
        json = tree(); ((ArrayNode) json.get("rows")).addNull(); invalid.add(json);
        json = tree(); ((ArrayNode) json.get("operations")).addNull(); invalid.add(json);
        json = tree(); json.set("operations", mapper.createArrayNode()); invalid.add(json);
        for (ObjectNode bad : invalid) invalid(mapper.writeValueAsBytes(bad));
        assertThat(success(post(mapper.writeValueAsBytes(DataAccessPresets.baseline()))).path("finalRows").size()).isEqualTo(12);
    }
    @Test void strictParserRejectsDuplicateFieldsTrailingRootsAndNonObjectBodies() throws Exception {
        String baseline = mapper.writeValueAsString(DataAccessPresets.baseline());
        List<String> invalid = List.of(baseline + "{}", baseline.substring(0, baseline.length() - 1) + ",\"indexOrder\":\"NONE\"}",
                baseline.replace("\"createdOrder\":10", "\"createdOrder\":10,\"createdOrder\":20"),
                "null", "[]", "{", "42", "\"input\"");
        for (String bad : invalid) {
            assertThat(bad).isNotEqualTo(baseline);
            invalid(bad.getBytes(StandardCharsets.UTF_8));
        }
    }
    @Test void exactVariantShapesRejectNullExtrasAndMalformedInsertRows() throws Exception {
        for (var operation : List.of(Operation.lookup("q", "b2"), Operation.allRange("q", 20, 30, 20), Operation.insert("q", new Row("b5", "beta", "k5", 25)))) {
            var input = new DataAccessInput("1.0", "1.0.0", IndexOrder.NONE, true, DataAccessPresets.rows(), List.of(operation));
            ObjectNode root = (ObjectNode) mapper.valueToTree(input);
            operation(root).putNull("invented"); invalid(mapper.writeValueAsBytes(root));
            root = (ObjectNode) mapper.valueToTree(input);
            operation(root).remove(operation.kind() == DataAccessInput.Kind.LOOKUP_ID ? "rowId" : operation.kind() == DataAccessInput.Kind.INSERT ? "row" : "limit");
            invalid(mapper.writeValueAsBytes(root));
        }
        var input = new DataAccessInput("1.0", "1.0.0", IndexOrder.NONE, true, DataAccessPresets.rows(), List.of(Operation.insert("q", new Row("b5", "beta", "k5", 25))));
        ObjectNode root = (ObjectNode) mapper.valueToTree(input);
        ((ObjectNode) operation(root).get("row")).put("createdOrder", "25");
        invalid(mapper.writeValueAsBytes(root));
    }
    @Test void emptyInitialRowsAreSupportedButOversizedCollectionsAreRejected() throws Exception {
        var empty = new DataAccessInput("1.0", "1.0.0", IndexOrder.NONE, true, List.of(), List.of(Operation.lookup("q", "missing")));
        assertThat(success(post(mapper.writeValueAsBytes(empty))).path("finalRows").size()).isZero();
        ObjectNode root = tree();
        var rows = (ArrayNode) root.get("rows");
        while (rows.size() <= 20) rows.add(row(root).deepCopy());
        invalid(mapper.writeValueAsBytes(root));
        root = tree(); var operations = (ArrayNode) root.get("operations");
        while (operations.size() <= 10) operations.add(operation(root).deepCopy());
        invalid(mapper.writeValueAsBytes(root));
    }
    @Test void draftTopicIsReadableWithoutJoiningPublishedDiscovery() throws Exception {
        var topic = success(get("/api/v1/draft/topics/data-access-models"));
        assertThat(topic.at("/topic/id").asString()).isEqualTo("data-access-models");
        assertThat(topic.at("/topic/status").asString()).isEqualTo("draft");
        assertThat(get("/api/v1/topics/data-access-models").statusCode()).isEqualTo(404);
        assertThat(mapper.writeValueAsString(success(get("/api/v1/topics")))).doesNotContain("data-access-models");
    }
}
