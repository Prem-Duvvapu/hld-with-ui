package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.hld.atomicity.AtomicityAnalyzer;
import com.hld.atomicity.AtomicityDescriptor;
import com.hld.atomicity.AtomicityInput;
import com.hld.atomicity.AtomicityInput.Action;
import com.hld.atomicity.AtomicityInput.Mode;
import com.hld.atomicity.AtomicityInput.Step;
import com.hld.atomicity.AtomicityInput.Transaction;
import com.hld.atomicity.AtomicityLimits;
import com.hld.atomicity.AtomicityPresets;
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

/** Actual HTTP parsing and configured serialization of the unchanged pure atomicity model. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AtomicityApiTest {
    private static final String MODEL = "/api/v1/simulations/transaction-atomicity";
    private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired AtomicityController controller;
    @MockitoSpyBean AtomicityAnalyzer analyzer;

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
            Thread.sleep(10); // Test-only permit recovery; no model timing.
        } while (System.nanoTime() < deadline);
        return response;
    }
    private JsonNode success(HttpResponse<byte[]> response) {
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type").orElseThrow()).startsWith("application/json");
        return mapper.readTree(response.body());
    }
    private void invalid(byte[] body) throws Exception {
        clearInvocations(analyzer);
        var response = post(body);
        assertThat(response.statusCode()).as(new String(body, StandardCharsets.UTF_8)).isEqualTo(400);
        var error = mapper.readTree(response.body());
        assertThat(error.propertyNames()).containsExactlyInAnyOrder("code", "message", "fieldErrors", "timestamp");
        assertThat(error.path("code").asString()).isEqualTo("invalid_input");
        assertThat(error.path("message").asString()).isNotBlank().doesNotContain("com.hld");
        assertThat(error.path("fieldErrors").isObject()).isTrue();
        assertThat(error.path("fieldErrors").size()).isZero();
        assertThat(error.has("outcomes")).isFalse();
        assertThat(error.has("finalState")).isFalse();
        verify(analyzer, never()).run(any());
    }
    private ObjectNode tree() { return (ObjectNode) mapper.valueToTree(AtomicityPresets.baseline()); }
    private static ObjectNode actor(ObjectNode root) { return (ObjectNode) root.path("transactions").get(0); }
    private static ObjectNode step(ObjectNode root) { return (ObjectNode) root.path("schedule").get(0); }
    private AtomicityInput preset(String id) {
        return AtomicityPresets.all().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow().input();
    }

    @Test void descriptorUsesSevenDerivedLimitsAndAllEightActualScenarios() throws Exception {
        var response = get(MODEL);
        var json = success(response);
        assertThat(json.propertyNames()).containsExactlyInAnyOrder("id", "title", "kind", "modelVersion", "description", "limits", "presets", "assumptions");
        assertThat(json.path("limits").propertyNames()).containsExactlyInAnyOrder(
                "maxInitialUnits", "minTransactions", "maxTransactions", "maxQuantity", "minSteps", "maxSteps", "maxIdLength");
        var descriptor = mapper.readValue(response.body(), AtomicityDescriptor.class);
        assertThat(descriptor).isEqualTo(controller.descriptor());
        assertThat(descriptor.id()).isEqualTo("transaction-atomicity");
        assertThat(descriptor.title()).isEqualTo("Atomicity & Abort");
        assertThat(descriptor.kind()).isEqualTo("simulation");
        assertThat(descriptor.modelVersion()).isEqualTo("1.0.0");
        assertThat(descriptor.limits()).isEqualTo(new AtomicityLimits(20, 1, 3, 20, 2, 12, 32));
        assertThat(descriptor.presets()).isEqualTo(AtomicityPresets.all());
        assertThat(descriptor.presets()).extracting(AtomicityPresets.Preset::id).containsExactly(
                "baseline", "protected-baseline", "protected-commit", "split-commit", "split-abort-after-record",
                "empty-stock", "protected-conflict", "conservative-conflict");
        for (JsonNode preset : json.path("presets")) assertThat(preset.propertyNames()).containsExactlyInAnyOrder("id", "title", "description", "input");
        assertThat(descriptor.assumptions()).isEqualTo(AtomicityAnalyzer.ASSUMPTIONS);
    }

    @Test void everyPresetHasExactJavaSnapshotsCapturedInputAndReplay() throws Exception {
        for (var preset : controller.descriptor().presets()) {
            byte[] body = mapper.writeValueAsBytes(preset.input());
            var actual = success(post(body));
            assertThat(actual).as(preset.id()).isEqualTo(mapper.valueToTree(new AtomicityAnalyzer().run(preset.input())));
            assertThat(success(post(body))).isEqualTo(actual);
            assertThat(actual.path("input")).isEqualTo(mapper.readTree(body));
            assertThat(actual.path("kind").asString()).isEqualTo("analysis");
            assertThat(actual.path("status").asString()).isEqualTo("completed");
            assertThat(actual.path("schemaVersion").asString()).isEqualTo("1.0");
            assertThat(actual.path("modelVersion").asString()).isEqualTo("1.0.0");
            assertThat(actual.path("outcomes").size()).isEqualTo(preset.input().schedule().size());
            for (String absent : List.of("events", "seed", "lastVirtualTimeMs")) assertThat(actual.has(absent)).isFalse();
        }
    }

    @Test void actualHttpResultsMatchAllFourUnchangedCanonicalGoldenPairs() throws Exception {
        for (String name : List.of("baseline", "protected", "conflict", "max-boundary")) {
            var prefix = "../contracts/examples/transaction-atomicity-" + name;
            byte[] body = Files.readAllBytes(Path.of(prefix + "-input.json"));
            var expected = mapper.readTree(Files.readAllBytes(Path.of(prefix + "-result.json")));
            assertThat(success(post(body))).as(name).isEqualTo(expected);
        }
    }

    @Test void abortConflictInsufficiencyAndSkippedWorkAreBusinessSuccessWithDistinctEvidence() throws Exception {
        var baseline = success(post(mapper.writeValueAsBytes(AtomicityPresets.baseline())));
        assertThat(baseline.at("/metrics/invariantStatus").asString()).isEqualTo("VIOLATED");
        assertThat(baseline.at("/metrics/firstViolationStepId").asString()).isEqualTo("decrement-a");
        assertThat(baseline.at("/finalState/invariants/abortedEffectsAbsent").asBoolean()).isFalse();
        assertThat(baseline.at("/finalState/transactions/0/appliedStockUnits").asInt()).isEqualTo(1);
        var splitRecorded = success(post(mapper.writeValueAsBytes(preset("split-abort-after-record"))));
        assertThat(splitRecorded.at("/finalState/invariants/unitsConserved").asBoolean()).isTrue();
        assertThat(splitRecorded.at("/finalState/invariants/abortedEffectsAbsent").asBoolean()).isFalse();
        assertThat(splitRecorded.at("/finalState/allocations/0/transactionId").asString()).isEqualTo("a");
        var conflict = success(post(mapper.writeValueAsBytes(preset("conservative-conflict"))));
        var decision = conflict.path("outcomes").get(7);
        assertThat(decision.path("reason").asString()).isEqualTo("REVISION_CONFLICT");
        assertThat(decision.path("expectedRevision").asInt()).isZero();
        assertThat(decision.path("actualRevision").asInt()).isEqualTo(1);
        assertThat(conflict.at("/finalState/remainingUnits").asInt()).isEqualTo(2);
        assertThat(conflict.at("/finalState/allocations").size()).isEqualTo(1);
        assertThat(conflict.at("/finalState/transactions/1/appliedStockUnits").asInt()).isZero();
        var empty = success(post(mapper.writeValueAsBytes(preset("empty-stock"))));
        assertThat(empty.path("outcomes").get(1).path("kind").asString()).isEqualTo("STOCK_REJECTED");
        assertThat(empty.path("outcomes").get(2).path("kind").asString()).isEqualTo("WORK_SKIPPED");
        assertThat(empty.path("outcomes").get(3).path("reason").asString()).isEqualTo("INSUFFICIENT_STOCK");
        assertThat(empty.at("/metrics/invariantStatus").asString()).isEqualTo("PRESERVED");
    }

    @Test void wireEvidenceOmitsInapplicableFieldsAndClearsTerminalPrivateWork() throws Exception {
        for (var preset : AtomicityPresets.all()) {
            var result = success(post(mapper.writeValueAsBytes(preset.input())));
            for (JsonNode outcome : result.path("outcomes")) {
                boolean stock = outcome.path("action").asString().equals("DECREMENT_STOCK");
                assertThat(outcome.has("checkedRemaining")).isEqualTo(stock);
                assertThat(outcome.has("checkSource")).isEqualTo(stock);
                boolean revisionCheck = preset.input().mode() == Mode.STAGED_VERSION_CHECK
                        && outcome.path("action").asString().equals("COMMIT")
                        && !outcome.path("reason").asString().equals("INSUFFICIENT_STOCK");
                assertThat(outcome.has("expectedRevision")).isEqualTo(revisionCheck);
                assertThat(outcome.has("actualRevision")).isEqualTo(revisionCheck);
                assertThat(outcome.has("reason")).isEqualTo(List.of("STOCK_REJECTED", "WORK_SKIPPED", "TRANSACTION_ABORTED").contains(outcome.path("kind").asString()));
                assertThat(outcome.has("timeMs")).isFalse();
            }
            for (JsonNode actor : result.at("/finalState/transactions")) {
                assertThat(actor.has("workingRemaining")).isFalse();
                assertThat(actor.has("pendingAllocation")).isFalse();
                assertThat(actor.path("pendingStockUnits").asInt()).isZero();
                assertThat(actor.has("baseRemaining")).isTrue();
                assertThat(actor.has("baseRevision")).isTrue();
            }
        }
        var result = success(post(mapper.writeValueAsBytes(preset("protected-commit"))));
        assertThat(result.at("/outcomes/1/postState/transactions/0/workingRemaining").asInt()).isZero();
        assertThat(result.at("/outcomes/1/postState/transactions/0").has("workingRemaining")).isTrue();
        assertThat(result.at("/outcomes/2/postState/transactions/0/pendingAllocation/stepId").asString()).isEqualTo("record-a");
        assertThat(result.at("/finalState/allocations/0/preparedAtStepId").asString()).isEqualTo("record-a");
        assertThat(result.at("/finalState/allocations/0/publishedAtStepId").asString()).isEqualTo("commit-a");
    }

    @Test void missingUnknownNullAndWrongTypedFieldsNeverInvokeTheAnalyzer() throws Exception {
        List<ObjectNode> invalid = new ArrayList<>();
        var json = tree(); json.put("unknown", true); invalid.add(json);
        for (String field : List.of("schemaVersion", "modelVersion", "mode", "initialUnits", "transactions", "schedule")) {
            json = tree(); json.remove(field); invalid.add(json);
            json = tree(); json.putNull(field); invalid.add(json);
        }
        for (String field : List.of("id", "quantity")) {
            json = tree(); actor(json).remove(field); invalid.add(json);
            json = tree(); actor(json).putNull(field); invalid.add(json);
        }
        for (String field : List.of("id", "transactionId", "action")) {
            json = tree(); step(json).remove(field); invalid.add(json);
            json = tree(); step(json).putNull(field); invalid.add(json);
        }
        json = tree(); json.put("schemaVersion", true); invalid.add(json);
        json = tree(); json.put("modelVersion", 1); invalid.add(json);
        json = tree(); json.put("mode", "UNKNOWN"); invalid.add(json);
        json = tree(); json.put("mode", false); invalid.add(json);
        json = tree(); json.put("initialUnits", "1"); invalid.add(json);
        json = tree(); json.put("initialUnits", 1.0); invalid.add(json);
        json = tree(); json.put("initialUnits", 2_147_483_648L); invalid.add(json);
        json = tree(); json.put("initialUnits", true); invalid.add(json);
        json = tree(); json.set("initialUnits", mapper.createObjectNode()); invalid.add(json);
        json = tree(); actor(json).put("quantity", "1"); invalid.add(json);
        json = tree(); actor(json).put("quantity", 1.0); invalid.add(json);
        json = tree(); actor(json).put("quantity", false); invalid.add(json);
        json = tree(); actor(json).put("id", true); invalid.add(json);
        json = tree(); actor(json).put("extra", "field"); invalid.add(json);
        json = tree(); step(json).put("action", "READ"); invalid.add(json);
        json = tree(); step(json).put("action", 1); invalid.add(json);
        json = tree(); step(json).put("transactionId", true); invalid.add(json);
        json = tree(); step(json).put("quantity", 1); invalid.add(json);
        json = tree(); step(json).put("workingRemaining", 1); invalid.add(json);
        json = tree(); json.set("transactions", mapper.createObjectNode()); invalid.add(json);
        json = tree(); json.put("schedule", "steps"); invalid.add(json);
        json = tree(); ((ArrayNode) json.get("transactions")).addNull(); invalid.add(json);
        json = tree(); ((ArrayNode) json.get("schedule")).addNull(); invalid.add(json);
        for (ObjectNode bad : invalid) invalid(mapper.writeValueAsBytes(bad));
    }

    @Test void duplicatesTrailingValuesFractionalTokensAndScalarRootsAreRejected() throws Exception {
        String baseline = mapper.writeValueAsString(AtomicityPresets.baseline());
        for (String bad : List.of(baseline + "{}", baseline + "null", baseline + "42",
                baseline.substring(0, baseline.length() - 1) + ",\"initialUnits\":2}",
                baseline.replace("\"quantity\":1", "\"quantity\":1,\"quantity\":2"),
                baseline.replace("\"transactionId\":\"a\"", "\"transactionId\":\"a\",\"transactionId\":\"b\""),
                baseline.replace("\"initialUnits\":1", "\"initialUnits\":1e0"),
                baseline.replace("\"quantity\":1", "\"quantity\":1.0"),
                baseline.replace("\"quantity\":1", "\"quantity\":1e0"),
                "null", "[]", "42", "\"atomicity\"", "{", "")) {
            assertThat(bad).isNotEqualTo(baseline);
            invalid(bad.getBytes(StandardCharsets.UTF_8));
        }
    }

    @Test void wellShapedDomainErrorsNeverExecuteAndAValidRunRecovers() throws Exception {
        List<ObjectNode> invalid = new ArrayList<>();
        var json = tree(); json.put("schemaVersion", "2.0"); invalid.add(json);
        json = tree(); json.put("modelVersion", "2.0.0"); invalid.add(json);
        for (int units : new int[] {-1, 21}) { json = tree(); json.put("initialUnits", units); invalid.add(json); }
        for (int quantity : new int[] {0, 21}) { json = tree(); actor(json).put("quantity", quantity); invalid.add(json); }
        for (String id : List.of("A", "a\n", "a".repeat(33))) { json = tree(); actor(json).put("id", id); invalid.add(json); }
        json = tree(); ((ArrayNode) json.get("transactions")).add(mapper.valueToTree(new Transaction("a", 2))); invalid.add(json);
        json = tree(); ((ObjectNode) json.get("schedule").get(2)).put("id", "begin-a"); invalid.add(json);
        json = tree(); step(json).put("transactionId", "unknown"); invalid.add(json);
        json = tree(); step(json).put("action", "DECREMENT_STOCK"); invalid.add(json);
        json = tree(); ((ObjectNode) json.get("schedule").get(1)).put("action", "RECORD_ALLOCATION"); invalid.add(json);
        json = tree(); ((ObjectNode) json.get("schedule").get(2)).put("action", "COMMIT"); invalid.add(json);
        json = tree(); ((ObjectNode) json.get("schedule").get(1)).put("action", "BEGIN"); invalid.add(json);
        json = tree(); ((ArrayNode) json.get("schedule")).remove(2); invalid.add(json);
        json = tree(); ((ArrayNode) json.get("schedule")).add(mapper.valueToTree(new Step("extra", "a", Action.BEGIN))); invalid.add(json);
        json = tree(); ((ArrayNode) json.get("transactions")).add(mapper.valueToTree(new Transaction("b", 1))); invalid.add(json);
        json = tree(); ((ArrayNode) json.get("transactions")).removeAll(); invalid.add(json);
        json = tree(); ((ArrayNode) json.get("schedule")).removeAll(); invalid.add(json);
        json = tree(); var actors = (ArrayNode) json.get("transactions");
        for (String id : List.of("b", "c", "d")) actors.add(mapper.valueToTree(new Transaction(id, 1))); invalid.add(json);
        json = tree(); var schedule = (ArrayNode) json.get("schedule");
        for (int i = 0; i < 10; i++) schedule.add(mapper.valueToTree(new Step("extra" + i, "a", Action.ABORT))); invalid.add(json);
        for (ObjectNode bad : invalid) invalid(mapper.writeValueAsBytes(bad));
        assertThat(success(post(mapper.writeValueAsBytes(AtomicityPresets.protectedBaseline()))).at("/metrics/abortedTransactionsWithEffects").asInt()).isZero();
    }

    @Test void editedThreeTransactionTwelveStepProgramIsAcceptedBeyondThePresetList() throws Exception {
        var transactions = List.of(new Transaction("x", 7), new Transaction("y", 6), new Transaction("z", 7));
        var schedule = new ArrayList<Step>();
        for (var actor : transactions) {
            schedule.add(new Step("begin-" + actor.id(), actor.id(), Action.BEGIN));
            schedule.add(new Step("stock-" + actor.id(), actor.id(), Action.DECREMENT_STOCK));
            schedule.add(new Step("record-" + actor.id(), actor.id(), Action.RECORD_ALLOCATION));
            schedule.add(new Step("commit-" + actor.id(), actor.id(), Action.COMMIT));
        }
        var input = new AtomicityInput("1.0", "1.0.0", Mode.STAGED_VERSION_CHECK, 20, transactions, schedule);
        var result = success(post(mapper.writeValueAsBytes(input)));
        assertThat(result).isEqualTo(mapper.valueToTree(new AtomicityAnalyzer().run(input)));
        assertThat(result.path("outcomes").size()).isEqualTo(12);
        assertThat(result.at("/metrics/committedTransactions").asInt()).isEqualTo(3);
        assertThat(result.at("/metrics/abortedTransactions").asInt()).isZero();
        assertThat(result.at("/finalState/allocatedUnits").asInt()).isEqualTo(20);
        assertThat(result.at("/finalState/revision").asInt()).isEqualTo(3);
    }
}
