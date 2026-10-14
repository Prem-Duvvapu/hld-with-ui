package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.transactions.ReservationAnalyzer;
import com.hld.transactions.ReservationDescriptor;
import com.hld.transactions.ReservationInput;
import com.hld.transactions.ReservationLimits;
import com.hld.transactions.ReservationPresets;
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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Actual HTTP evidence and strict raw parsing over the unchanged pure reservation model. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ReservationApiTest {
    private static final String MODEL = "/api/v1/simulations/transactions-isolation";
    private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired ReservationController controller;
    @Autowired ReservationAnalyzer analyzer;

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
            Thread.sleep(10); // Sequential test setup/recovery, never application or model timing.
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
        assertThat(error.path("message").asString()).isNotBlank();
        assertThat(error.path("fieldErrors").isObject()).isTrue();
        assertThat(error.path("fieldErrors").size()).isZero();
        assertThat(error.has("outcomes")).isFalse();
        assertThat(error.has("finalState")).isFalse();
    }

    private ObjectNode tree() { return (ObjectNode) mapper.valueToTree(ReservationPresets.baseline()); }
    private static ObjectNode actor(ObjectNode root) { return (ObjectNode) root.get("reservations").get(0); }
    private static ObjectNode step(ObjectNode root) { return (ObjectNode) root.get("schedule").get(0); }

    @Test void descriptorHasTheExactRegisteredContractAndEightCanonicalScenarioInputs() throws Exception {
        var response = get(MODEL);
        var json = success(response);
        assertThat(json.propertyNames()).containsExactlyInAnyOrder("id", "title", "kind", "modelVersion", "description", "limits", "presets", "assumptions");
        var descriptor = mapper.readValue(response.body(), ReservationDescriptor.class);
        assertThat(descriptor).isEqualTo(controller.descriptor());
        assertThat(descriptor.id()).isEqualTo("transactions-isolation");
        assertThat(descriptor.title()).isEqualTo("Transactions & Isolation");
        assertThat(descriptor.kind()).isEqualTo("simulation");
        assertThat(descriptor.modelVersion()).isEqualTo("1.0.0");
        assertThat(descriptor.limits()).isEqualTo(new ReservationLimits(20, 2, 4, 20, 8, 32));
        assertThat(descriptor.presets()).isEqualTo(ReservationPresets.all());
        assertThat(descriptor.presets()).extracting(ReservationPresets.Preset::id).containsExactly(
                "unsafe-baseline", "protected-baseline", "serial-control", "reverse-winner",
                "conservation-gap", "empty-stock", "unequal-quantities", "stale-restoration");
        for (JsonNode preset : json.path("presets")) assertThat(preset.propertyNames()).containsExactlyInAnyOrder("id", "title", "description", "input");
        assertThat(descriptor.presets().stream().filter(p -> p.id().equals("unsafe-baseline")).findFirst().orElseThrow().input()).isEqualTo(ReservationPresets.baseline());
        assertThat(descriptor.assumptions()).isEqualTo(ReservationAnalyzer.ASSUMPTIONS);
    }

    @Test void everyPresetReturnsEveryActualJavaOutcomeSnapshotFlagAndCapturedInput() throws Exception {
        for (var preset : controller.descriptor().presets()) {
            byte[] input = mapper.writeValueAsBytes(preset.input());
            var actual = success(post(input));
            assertThat(actual).as(preset.id()).isEqualTo(mapper.valueToTree(analyzer.run(preset.input())));
            assertThat(actual.path("input")).isEqualTo(mapper.readTree(input));
            assertThat(actual.path("schemaVersion").asString()).isEqualTo("1.0");
            assertThat(actual.path("modelVersion").asString()).isEqualTo("1.0.0");
            assertThat(actual.path("kind").asString()).isEqualTo("analysis");
            assertThat(actual.path("status").asString()).isEqualTo("completed");
            assertThat(actual.has("events")).isFalse(); assertThat(actual.has("seed")).isFalse();
            assertThat(actual.has("lastVirtualTimeMs")).isFalse();
            assertThat(actual.path("outcomes").size()).isEqualTo(preset.input().schedule().size());
        }
    }

    @Test void unsafeAndProtectedHttpBaselinesMatchBothTrackedJavaGoldenPairs() throws Exception {
        for (String name : List.of("baseline", "protected")) {
            var prefix = Path.of("../contracts/examples/transactions-isolation-" + name);
            byte[] input = Files.readAllBytes(Path.of(prefix + "-input.json"));
            var expected = mapper.readTree(Files.readAllBytes(Path.of(prefix + "-result.json")));
            assertThat(success(post(input))).as(name).isEqualTo(expected);
        }
    }

    @Test void businessRejectionAndUnsafeInvariantViolationsAreSuccessfulAnalysesWithDistinctEvidence() throws Exception {
        var unsafe = success(post(mapper.writeValueAsBytes(ReservationPresets.baseline())));
        assertThat(unsafe.at("/metrics/invariantStatus").asString()).isEqualTo("VIOLATED");
        assertThat(unsafe.at("/metrics/firstViolationStepId").asString()).isEqualTo("attempt-b");
        assertThat(unsafe.at("/finalState/invariants/remainingNonnegative").asBoolean()).isTrue();
        assertThat(unsafe.at("/finalState/invariants/allocatedWithinCapacity").asBoolean()).isFalse();
        assertThat(unsafe.at("/finalState/invariants/unitsConserved").asBoolean()).isFalse();
        var protectedResult = success(post(mapper.writeValueAsBytes(ReservationPresets.protectedBaseline())));
        var decision = protectedResult.path("outcomes").get(3);
        assertThat(decision.path("kind").asString()).isEqualTo("RESERVATION_REJECTED");
        assertThat(decision.path("checkedRemaining").asInt()).isZero();
        assertThat(decision.path("checkSource").asString()).isEqualTo("CURRENT");
        assertThat(decision.path("rejectionReason").asString()).isEqualTo("INSUFFICIENT_STOCK");
        assertThat(decision.path("postState").path("remainingUnits")).isEqualTo(protectedResult.path("outcomes").get(2).path("postState").path("remainingUnits"));
        assertThat(decision.path("postState").path("allocations")).isEqualTo(protectedResult.path("outcomes").get(2).path("postState").path("allocations"));
        assertThat(decision.at("/postState/reservations/1/observedRemaining").asInt()).isEqualTo(1);
        assertThat(decision.at("/postState/reservations/1/status").asString()).isEqualTo("REJECTED");
        var empty = controller.descriptor().presets().stream().filter(p -> p.id().equals("empty-stock")).findFirst().orElseThrow();
        var emptyResult = success(post(mapper.writeValueAsBytes(empty.input())));
        assertThat(emptyResult.at("/metrics/rejectedReservations").asInt()).isEqualTo(2);
        assertThat(emptyResult.at("/finalState/allocations").size()).isZero();
        assertThat(emptyResult.at("/metrics/invariantStatus").asString()).isEqualTo("PRESERVED");
    }

    @Test void serializedReadAndAttemptOutcomesOmitInapplicableFieldsAndPreserveZeroObservations() throws Exception {
        var result = success(post(mapper.writeValueAsBytes(ReservationPresets.protectedBaseline())));
        for (JsonNode outcome : result.path("outcomes")) {
            if (outcome.path("action").asString().equals("READ")) {
                assertThat(outcome.has("observedRemaining")).isTrue();
                for (String field : List.of("checkedRemaining", "checkSource", "quantity", "rejectionReason")) assertThat(outcome.has(field)).isFalse();
            } else {
                assertThat(outcome.has("observedRemaining")).isFalse();
                for (String field : List.of("checkedRemaining", "checkSource", "quantity")) assertThat(outcome.has(field)).isTrue();
                assertThat(outcome.has("rejectionReason")).isEqualTo(outcome.path("kind").asString().equals("RESERVATION_REJECTED"));
            }
            assertThat(outcome.has("timeMs")).isFalse();
        }
        assertThat(result.path("initialState").path("reservations").get(0).has("observedRemaining")).isFalse();
        var serial = controller.descriptor().presets().stream().filter(p -> p.id().equals("serial-control")).findFirst().orElseThrow();
        var serialResult = success(post(mapper.writeValueAsBytes(serial.input())));
        assertThat(serialResult.path("outcomes").get(2).path("observedRemaining").asInt()).isZero();
        assertThat(serialResult.at("/finalState/reservations/1/observedRemaining").asInt()).isZero();
        assertThat(serialResult.path("metrics").has("firstViolationStepId")).isFalse();
    }

    @Test void missingUnknownNullMixedAndWrongTypedFieldsAreStrictlyRejected() throws Exception {
        List<ObjectNode> invalid = new ArrayList<>();
        var json = tree(); json.put("unknown", true); invalid.add(json);
        for (String field : List.of("schemaVersion", "modelVersion", "strategy", "initialUnits", "reservations", "schedule")) {
            json = tree(); json.remove(field); invalid.add(json);
            json = tree(); json.putNull(field); invalid.add(json);
        }
        for (String field : List.of("id", "quantity")) {
            json = tree(); actor(json).remove(field); invalid.add(json);
            json = tree(); actor(json).putNull(field); invalid.add(json);
        }
        for (String field : List.of("id", "reservationId", "action")) {
            json = tree(); step(json).remove(field); invalid.add(json);
            json = tree(); step(json).putNull(field); invalid.add(json);
        }
        json = tree(); json.put("schemaVersion", true); invalid.add(json);
        json = tree(); json.put("modelVersion", 1); invalid.add(json);
        json = tree(); json.put("strategy", "UNKNOWN"); invalid.add(json);
        json = tree(); json.put("strategy", false); invalid.add(json);
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
        json = tree(); step(json).put("action", "COMMIT"); invalid.add(json);
        json = tree(); step(json).put("action", 1); invalid.add(json);
        json = tree(); step(json).put("reservationId", true); invalid.add(json);
        json = tree(); step(json).put("quantity", 1); invalid.add(json);
        json = tree(); step(json).put("observedRemaining", 1); invalid.add(json);
        json = tree(); json.set("reservations", mapper.createObjectNode()); invalid.add(json);
        json = tree(); json.put("schedule", "steps"); invalid.add(json);
        json = tree(); ((ArrayNode) json.get("reservations")).addNull(); invalid.add(json);
        json = tree(); ((ArrayNode) json.get("schedule")).addNull(); invalid.add(json);
        for (ObjectNode bad : invalid) invalid(mapper.writeValueAsBytes(bad));
    }

    @Test void duplicateKeysTrailingTokensFloatingTokensAndScalarRootsCannotSilentlyChangeInputs() throws Exception {
        String baseline = mapper.writeValueAsString(ReservationPresets.baseline());
        List<String> invalid = List.of(
                baseline + "{}", baseline + "null",
                baseline.substring(0, baseline.length() - 1) + ",\"initialUnits\":2}",
                baseline.replace("\"quantity\":1", "\"quantity\":1,\"quantity\":2"),
                baseline.replace("\"reservationId\":\"a\"", "\"reservationId\":\"a\",\"reservationId\":\"b\""),
                baseline.replace("\"initialUnits\":1", "\"initialUnits\":1e0"),
                baseline.replace("\"quantity\":1", "\"quantity\":1.0"),
                "null", "[]", "42", "\"reservation\"", "{", "");
        for (String bad : invalid) {
            assertThat(bad).isNotEqualTo(baseline);
            invalid(bad.getBytes(StandardCharsets.UTF_8));
        }
    }

    @Test void wellShapedDomainErrorsRejectSchedulesBeforeExecutionAndPreserveRecovery() throws Exception {
        List<ObjectNode> invalid = new ArrayList<>();
        var json = tree(); json.put("schemaVersion", "2.0"); invalid.add(json);
        json = tree(); json.put("modelVersion", "2.0.0"); invalid.add(json);
        for (int units : new int[] {-1, 21}) { json = tree(); json.put("initialUnits", units); invalid.add(json); }
        for (int quantity : new int[] {0, 21}) { json = tree(); actor(json).put("quantity", quantity); invalid.add(json); }
        for (String id : List.of("A", "a\n", "a".repeat(33))) { json = tree(); actor(json).put("id", id); invalid.add(json); }
        json = tree(); ((ObjectNode) json.get("reservations").get(1)).put("id", "a"); invalid.add(json);
        json = tree(); ((ObjectNode) json.get("schedule").get(3)).put("id", "attempt-a"); invalid.add(json);
        json = tree(); step(json).put("reservationId", "unknown"); invalid.add(json);
        json = tree(); ((ObjectNode) json.get("schedule").get(2)).put("action", "READ"); invalid.add(json);
        json = tree(); ((ObjectNode) json.get("schedule").get(3)).put("reservationId", "a"); invalid.add(json);
        json = tree(); var schedule = (ArrayNode) json.get("schedule");
        var first = schedule.get(0).deepCopy(); var third = schedule.get(2).deepCopy();
        schedule.set(0, third); schedule.set(2, first); invalid.add(json);
        json = tree(); ((ArrayNode) json.get("reservations")).add(mapper.valueToTree(new ReservationInput.Reservation("c", 1))); invalid.add(json);
        json = tree(); ((ArrayNode) json.get("schedule")).remove(3); invalid.add(json);
        json = tree(); ((ArrayNode) json.get("schedule")).add(mapper.valueToTree(new ReservationInput.Step("extra", "a", ReservationInput.Action.READ))); invalid.add(json);
        for (ObjectNode bad : invalid) invalid(mapper.writeValueAsBytes(bad));
        assertThat(success(post(mapper.writeValueAsBytes(ReservationPresets.protectedBaseline()))).at("/metrics/acceptedReservations").asInt()).isEqualTo(1);
    }

    @Test void editedFourReservationInputsUseTheSameStrictModelWithoutPresetOnlyRestrictions() throws Exception {
        var reservations = new ArrayList<ReservationInput.Reservation>();
        var schedule = new ArrayList<ReservationInput.Step>();
        for (String id : List.of("a", "b", "c", "d")) {
            reservations.add(new ReservationInput.Reservation(id, 1));
            schedule.add(new ReservationInput.Step("read-" + id, id, ReservationInput.Action.READ));
        }
        for (String id : List.of("a", "b", "c", "d")) schedule.add(new ReservationInput.Step("attempt-" + id, id, ReservationInput.Action.ATTEMPT_RESERVE));
        var input = new ReservationInput("1.0", "1.0.0", ReservationInput.Strategy.ATOMIC_CONDITIONAL_RESERVATION, 2, reservations, schedule);
        var result = success(post(mapper.writeValueAsBytes(input)));
        assertThat(result).isEqualTo(mapper.valueToTree(analyzer.run(input)));
        assertThat(result.path("outcomes").size()).isEqualTo(8);
        assertThat(result.at("/metrics/acceptedReservations").asInt()).isEqualTo(2);
        assertThat(result.at("/metrics/rejectedReservations").asInt()).isEqualTo(2);
        assertThat(result.at("/metrics/invariantStatus").asString()).isEqualTo("PRESERVED");
    }

    @Test void draftTopicAdvertisesImplementedTeachingAndStaysOutsidePublishedDiscovery() throws Exception {
        var detail = success(get("/api/v1/draft/topics/transactions-isolation"));
        assertThat(detail.at("/topic/id").asString()).isEqualTo("transactions-isolation");
        assertThat(detail.at("/topic/status").asString()).isEqualTo("draft");
        assertThat(detail.at("/topic/contentVersion").asString()).isEqualTo("1.1.0");
        var capabilities = new ArrayList<String>();
        for (JsonNode value : detail.at("/topic/capabilities")) capabilities.add(value.asString());
        assertThat(capabilities).containsExactlyInAnyOrder("study", "simulation", "guided", "practice");
        assertThat(detail.path("checkpoints").size()).isEqualTo(8);
        assertThat(detail.at("/topic/checkpointsPath").asString()).isEqualTo("topics/transactions-isolation/checkpoints.json");
        for (JsonNode checkpoint : detail.path("checkpoints")) {
            assertThat(checkpoint.path("target").propertyNames()).containsExactlyInAnyOrder("stepId", "kind", "occurrence");
            assertThat(checkpoint.at("/target/occurrence").asInt()).isEqualTo(1);
            assertThat(checkpoint.at("/target/kind").asString()).isIn("READ_OBSERVED", "RESERVATION_ACCEPTED", "RESERVATION_REJECTED");
        }
        assertThat(detail.path("lessonMarkdown").asString()).isNotBlank();
        assertThat(detail.path("questions").size()).isGreaterThan(0);
        assertThat(get("/api/v1/topics/transactions-isolation").statusCode()).isEqualTo(404);
        for (JsonNode entry : success(get("/api/v1/topics"))) assertThat(entry.path("id").asString()).isNotEqualTo("transactions-isolation");
        for (String query : List.of("reservation", "transactions", "isolation")) {
            for (JsonNode hit : success(get("/api/v1/search?q=" + query)).path("results")) assertThat(hit.at("/entry/id").asString()).isNotEqualTo("transactions-isolation");
        }
        var path = success(get("/api/v1/learning-paths/first-system-design"));
        for (JsonNode step : path.path("steps")) assertThat(step.path("moduleId").asString()).isNotEqualTo("transactions-isolation");
        for (JsonNode optional : path.path("optionalModules")) assertThat(optional.path("id").asString()).isNotEqualTo("transactions-isolation");
    }
}
