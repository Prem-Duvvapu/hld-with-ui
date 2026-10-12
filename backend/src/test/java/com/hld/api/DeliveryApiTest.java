package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.delivery.DeliveryDescriptor;
import com.hld.delivery.DeliveryInput;
import com.hld.delivery.DeliveryInput.Consumer;
import com.hld.delivery.DeliveryInput.Message;
import com.hld.delivery.DeliveryLimits;
import com.hld.delivery.DeliveryResult;
import com.hld.delivery.DeliverySimulator;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

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

/** Real HTTP delivery behavior reconciles with the existing pure model and authored resources. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class DeliveryApiTest {
    private static final String MODEL = "/api/v1/simulations/queues-delivery";
    private static final HttpClient CLIENT =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired DeliveryController controller;
    @Autowired DeliverySimulator simulator;
    @Autowired HttpExecutionLimits httpLimits;

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }

    private HttpRequest request(byte[] body) {
        return HttpRequest.newBuilder(uri(MODEL + "/runs"))
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                .build();
    }

    private HttpResponse<byte[]> get(String path) throws Exception {
        return CLIENT.send(
                HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(15)).GET().build(),
                HttpResponse.BodyHandlers.ofByteArray());
    }

    private HttpResponse<byte[]> post(byte[] body) throws Exception {
        // Sequential setup/recovery only; response receipt can precede the filter releasing its
        // permit.
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        HttpResponse<byte[]> response;
        do {
            response = CLIENT.send(request(body), HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() != 503) return response;
            Thread.sleep(10);
        } while (System.nanoTime() < deadline);
        return response;
    }

    private JsonNode successful(HttpResponse<byte[]> response) {
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type").orElseThrow())
                .startsWith("application/json");
        return mapper.readTree(response.body());
    }

    private void invalid(byte[] body) throws Exception {
        var response = post(body);
        assertThat(response.statusCode())
                .as(new String(body, StandardCharsets.UTF_8))
                .isEqualTo(400);
        var error = mapper.readTree(response.body());
        assertThat(error.propertyNames())
                .containsExactlyInAnyOrder("code", "message", "fieldErrors", "timestamp");
        assertThat(error.path("code").asString()).isEqualTo("invalid_input");
        assertThat(error.has("events")).isFalse();
    }

    private DeliveryInput baseline() {
        return controller.descriptor().presets().get(0).input();
    }

    private DeliveryResult run(String id) {
        return simulator.run(
                controller.descriptor().presets().stream()
                        .filter(p -> p.id().equals(id))
                        .findFirst()
                        .orElseThrow()
                        .input());
    }

    private ObjectNode tree(DeliveryInput input) {
        return (ObjectNode) mapper.valueToTree(input);
    }

    private ObjectNode nestedTemplate() {
        ObjectNode json = tree(baseline());
        json.set(
                "failures",
                mapper.valueToTree(
                        List.of(
                                new DeliveryInput.Failure(
                                        "c1", DeliveryInput.FailureAction.CRASH, 25),
                                new DeliveryInput.Failure(
                                        "c1", DeliveryInput.FailureAction.RECOVER, 75))));
        json.set(
                "lostAcknowledgments",
                mapper.valueToTree(List.of(new DeliveryInput.LostAcknowledgment("m1", 1))));
        return json;
    }

    @Test
    void descriptorPublishesActualBoundsAssumptionsAndNineExecutablePresets() throws Exception {
        var response = get(MODEL);
        successful(response);
        var descriptor = mapper.readValue(response.body(), DeliveryDescriptor.class);
        assertThat(descriptor.id()).isEqualTo(DeliverySimulator.SIMULATION_ID);
        assertThat(descriptor.title()).isEqualTo("Delivery, ACKs & Duplicate Work");
        assertThat(descriptor.kind()).isEqualTo("simulation");
        assertThat(descriptor.modelVersion()).isEqualTo("1.0.0");
        assertThat(descriptor.limits()).isEqualTo(DeliveryLimits.CURRENT);
        assertThat(descriptor.assumptions()).isEqualTo(DeliverySimulator.ASSUMPTIONS);
        assertThat(descriptor.presets())
                .extracting(DeliveryDescriptor.Preset::id)
                .containsExactly(
                        "baseline",
                        "lost-ack",
                        "crash-before",
                        "crash-after",
                        "early-ack-crash",
                        "lease-boundary",
                        "overlapping-attempts",
                        "virtual-limit",
                        "no-recovery");
        for (var preset : descriptor.presets()) {
            var actual = successful(post(mapper.writeValueAsBytes(preset.input())));
            assertThat(actual)
                    .as(preset.id())
                    .isEqualTo(
                            mapper.readTree(
                                    mapper.writeValueAsBytes(simulator.run(preset.input()))));
            assertThat(actual.path("seed").asLong()).isEqualTo(42);
        }
        assertThat(mapper.readTree(mapper.writeValueAsBytes(baseline())))
                .isEqualTo(
                        mapper.readTree(
                                Files.readAllBytes(
                                        Path.of(
                                                "../contracts/examples/queue-delivery-baseline-input.json"))));
        assertThat(successful(post(mapper.writeValueAsBytes(baseline()))))
                .isEqualTo(
                        mapper.readTree(
                                Files.readAllBytes(
                                        Path.of(
                                                "../contracts/examples/queue-delivery-baseline-result.json"))));
    }

    @Test
    void everyPresetTeachesItsActualAttemptEffectAcknowledgmentAndSettlementBoundaries() {
        var base = run("baseline");
        assertThat(base.lastVirtualTimeMs()).isEqualTo(55);
        assertThat(base.ledger())
                .extracting(com.hld.delivery.LedgerEntry::committedAtMs)
                .containsExactly(50L);
        assertThat(base.metrics().deliveryAttempts()).isEqualTo(1);
        assertThat(base.metrics().acknowledgedWithoutEffect()).isZero();
        var lost = run("lost-ack");
        assertThat(lost.metrics().deliveryAttempts()).isEqualTo(2);
        assertThat(lost.metrics().extraEffects()).isEqualTo(1);
        assertThat(lost.ledger())
                .extracting(com.hld.delivery.LedgerEntry::committedAtMs)
                .containsExactly(50L, 150L);
        assertThat(lost.messageOutcomes().get(0).acknowledgedAtMs()).isEqualTo(155);
        assertThat(lost.lostAcknowledgmentOutcomes().get(0).status())
                .isEqualTo(DeliveryResult.LossOutcomeStatus.REACHED);
        var before = run("crash-before");
        assertThat(before.metrics().deliveryAttempts()).isEqualTo(2);
        assertThat(before.ledger())
                .extracting(com.hld.delivery.LedgerEntry::committedAtMs)
                .containsExactly(150L);
        assertThat(before.metrics().extraEffects()).isZero();
        assertThat(before.messageOutcomes().get(0).acknowledgedAtMs()).isEqualTo(155);
        var after = run("crash-after");
        assertThat(after.ledger())
                .extracting(com.hld.delivery.LedgerEntry::committedAtMs)
                .containsExactly(50L, 152L);
        assertThat(after.attemptOutcomes().get(1).startedAtMs()).isEqualTo(102);
        assertThat(after.messageOutcomes().get(0).acknowledgedAtMs()).isEqualTo(157);
        var early = run("early-ack-crash");
        assertThat(early.status()).isEqualTo("completed");
        assertThat(early.lastVirtualTimeMs()).isEqualTo(75);
        assertThat(early.ledger()).isEmpty();
        assertThat(early.metrics().deliveryAttempts()).isEqualTo(1);
        assertThat(early.metrics().acknowledgedWithoutEffect()).isEqualTo(1);
        assertThat(early.messageOutcomes().get(0).acknowledgedAtMs()).isEqualTo(5);
        var boundary = run("lease-boundary");
        assertThat(boundary.ledger())
                .extracting(com.hld.delivery.LedgerEntry::committedAtMs)
                .containsExactly(95L, 195L);
        assertThat(
                        boundary.events().stream()
                                .filter(
                                        e ->
                                                e.kind()
                                                        == com.hld.delivery.DeliveryEvent.Kind
                                                                .ACK_STALE))
                .extracting(com.hld.delivery.DeliveryEvent::timeMs)
                .containsExactly(100L, 200L);
        assertThat(boundary.metrics().deadLetteredMessages()).isEqualTo(1);
        assertThat(boundary.metrics().acknowledgedMessages()).isZero();
        var overlap = run("overlapping-attempts");
        assertThat(overlap.attemptOutcomes())
                .extracting(com.hld.delivery.DeliveryState.Attempt::consumerId)
                .containsExactly("c1", "c2");
        assertThat(overlap.ledger())
                .extracting(com.hld.delivery.LedgerEntry::committedAtMs)
                .containsExactly(150L, 250L);
        assertThat(overlap.lastVirtualTimeMs()).isEqualTo(255);
        assertThat(overlap.metrics().deadLetteredMessages()).isEqualTo(1);
        assertThat(overlap.metrics().extraEffects()).isEqualTo(1);
        var limited = run("virtual-limit");
        assertThat(limited.status()).isEqualTo("limited");
        assertThat(limited.truncationReason()).isEqualTo("virtual_time_limit");
        assertThat(limited.lastVirtualTimeMs()).isEqualTo(60_000);
        assertThat(limited.metrics().runningEffects()).isEqualTo(1);
        assertThat(limited.metrics().pendingAcknowledgments()).isEqualTo(1);
        assertThat(limited.metrics().effectLatencySamples()).isZero();
        assertThat(limited.metrics().meanFirstEffectLatencyMs()).isNull();
        assertThat(limited.metrics().acknowledgedWithoutEffect()).isNull();
        var down = run("no-recovery");
        assertThat(down.status()).isEqualTo("limited");
        assertThat(down.truncationReason()).isEqualTo("no_future_progress");
        assertThat(down.lastVirtualTimeMs()).isZero();
        assertThat(down.metrics().ready()).isEqualTo(1);
        assertThat(down.metrics().deliveryAttempts()).isZero();
    }

    @Test
    void strictRootShapeRejectsMissingNullUnknownAndCoercedFields() throws Exception {
        ObjectNode valid = tree(baseline());
        for (String field : valid.propertyNames()) {
            ObjectNode absent = valid.deepCopy();
            absent.remove(field);
            invalid(mapper.writeValueAsBytes(absent));
            ObjectNode nulled = valid.deepCopy();
            nulled.putNull(field);
            invalid(mapper.writeValueAsBytes(nulled));
        }
        ObjectNode extra = valid.deepCopy();
        extra.put("unknown", 1);
        invalid(mapper.writeValueAsBytes(extra));
        for (String field :
                List.of(
                        "processingTimeMs",
                        "acknowledgmentDelayMs",
                        "visibilityTimeoutMs",
                        "maxDeliveryAttempts",
                        "seed")) {
            ObjectNode string = valid.deepCopy();
            string.put(field, "1");
            invalid(mapper.writeValueAsBytes(string));
            ObjectNode decimal = valid.deepCopy();
            decimal.put(field, 1.5);
            invalid(mapper.writeValueAsBytes(decimal));
            ObjectNode bool = valid.deepCopy();
            bool.put(field, true);
            invalid(mapper.writeValueAsBytes(bool));
        }
        for (String field : List.of("messages", "consumers", "failures", "lostAcknowledgments")) {
            ObjectNode wrong = valid.deepCopy();
            wrong.put(field, "not-an-array");
            invalid(mapper.writeValueAsBytes(wrong));
        }
        for (String field : List.of("schemaVersion", "modelVersion", "acknowledgmentPolicy")) {
            ObjectNode wrong = valid.deepCopy();
            wrong.put(field, 1);
            invalid(mapper.writeValueAsBytes(wrong));
        }
        assertThat(successful(post(mapper.writeValueAsBytes(baseline()))).path("status").asString())
                .isEqualTo("completed");
    }

    @Test
    void strictNestedObjectsRejectUnknownMissingNullWrongTypesAndCoercions() throws Exception {
        ObjectNode valid = nestedTemplate();
        for (String collection :
                List.of("messages", "consumers", "failures", "lostAcknowledgments")) {
            JsonNode member = valid.at("/" + collection + "/0");
            for (String field : member.propertyNames()) {
                ObjectNode absent = valid.deepCopy();
                ((ObjectNode) absent.at("/" + collection + "/0")).remove(field);
                invalid(mapper.writeValueAsBytes(absent));
                ObjectNode nulled = valid.deepCopy();
                ((ObjectNode) nulled.at("/" + collection + "/0")).putNull(field);
                invalid(mapper.writeValueAsBytes(nulled));
                ObjectNode wrong = valid.deepCopy();
                ((ObjectNode) wrong.at("/" + collection + "/0"))
                        .set(
                                field,
                                member.get(field).isString()
                                        ? mapper.valueToTree(1)
                                        : mapper.valueToTree("1"));
                invalid(mapper.writeValueAsBytes(wrong));
                if (member.get(field).isIntegralNumber()) {
                    ObjectNode decimal = valid.deepCopy();
                    ((ObjectNode) decimal.at("/" + collection + "/0")).put(field, 1.5);
                    invalid(mapper.writeValueAsBytes(decimal));
                    ObjectNode bool = valid.deepCopy();
                    ((ObjectNode) bool.at("/" + collection + "/0")).put(field, true);
                    invalid(mapper.writeValueAsBytes(bool));
                }
            }
            ObjectNode extra = valid.deepCopy();
            ((ObjectNode) extra.at("/" + collection + "/0")).put("unknown", 1);
            invalid(mapper.writeValueAsBytes(extra));
            ObjectNode nullMember = valid.deepCopy();
            ((ArrayNode) nullMember.get(collection)).set(0, mapper.nullNode());
            invalid(mapper.writeValueAsBytes(nullMember));
            ObjectNode wrongMember = valid.deepCopy();
            ((ArrayNode) wrongMember.get(collection)).set(0, mapper.valueToTree("wrong"));
            invalid(mapper.writeValueAsBytes(wrongMember));
        }
    }

    @Test
    void rejectsMalformedDuplicateTrailingAndFloatingExponentTokens() throws Exception {
        String json = mapper.writeValueAsString(nestedTemplate());
        List<String> malformed =
                new ArrayList<>(
                        List.of(
                                "",
                                "null",
                                "[]",
                                "{",
                                json + "{}",
                                json + " true",
                                json.replace(
                                        "\"processingTimeMs\":50",
                                        "\"processingTimeMs\":50,\"processingTimeMs\":5"),
                                json.replace("\"processingTimeMs\":50", "\"processingTimeMs\":5e1"),
                                json.replace(
                                        "\"processingTimeMs\":50", "\"processingTimeMs\":50.0"),
                                json.replace(
                                        "\"processingTimeMs\":50",
                                        "\"processingTimeMs\":9223372036854775808"),
                                json.replace("\"enqueueTimeMs\":0", "\"enqueueTimeMs\":0e0"),
                                json.replace("\"timeMs\":25", "\"timeMs\":25e0"),
                                json.replace("\"attempt\":1", "\"attempt\":1e0")));
        for (String token :
                List.of("\"id\":\"m1\"", "\"id\":\"c1\"", "\"timeMs\":25", "\"attempt\":1")) {
            malformed.add(json.replace(token, token + "," + token));
        }
        for (String body : malformed) invalid(body.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void enforcesDomainReferencesFailuresVersionsCountsAndSafeSeeds() throws Exception {
        ObjectNode valid = nestedTemplate();
        for (var pair :
                List.of(
                        new Object[] {"processingTimeMs", 0L},
                        new Object[] {"processingTimeMs", 1_001L},
                        new Object[] {"acknowledgmentDelayMs", 0L},
                        new Object[] {"acknowledgmentDelayMs", 1_001L},
                        new Object[] {"visibilityTimeoutMs", 0L},
                        new Object[] {"visibilityTimeoutMs", 60_001L},
                        new Object[] {"maxDeliveryAttempts", 0L},
                        new Object[] {"maxDeliveryAttempts", 6L},
                        new Object[] {"seed", DeliveryInput.MAX_ABSOLUTE_SEED + 1},
                        new Object[] {"seed", -DeliveryInput.MAX_ABSOLUTE_SEED - 1})) {
            ObjectNode bad = valid.deepCopy();
            bad.put((String) pair[0], (long) pair[1]);
            invalid(mapper.writeValueAsBytes(bad));
        }
        for (String field : List.of("schemaVersion", "modelVersion", "acknowledgmentPolicy")) {
            ObjectNode bad = valid.deepCopy();
            bad.put(field, "unsupported");
            invalid(mapper.writeValueAsBytes(bad));
        }
        for (String collection : List.of("messages", "consumers")) {
            ObjectNode empty = valid.deepCopy();
            empty.set(collection, mapper.createArrayNode());
            invalid(mapper.writeValueAsBytes(empty));
            ObjectNode duplicate = valid.deepCopy();
            ((ArrayNode) duplicate.get(collection))
                    .add(duplicate.at("/" + collection + "/0").deepCopy());
            invalid(mapper.writeValueAsBytes(duplicate));
        }
        for (String id : List.of("UPPER", "!m1", "x".repeat(33), "m1\n")) {
            ObjectNode bad = valid.deepCopy();
            ((ObjectNode) bad.at("/messages/0")).put("id", id);
            invalid(mapper.writeValueAsBytes(bad));
        }
        for (String path : List.of("/messages/0/enqueueTimeMs", "/failures/0/timeMs")) {
            for (long time : new long[] {-1, 60_001}) {
                ObjectNode bad = valid.deepCopy();
                ((ObjectNode) bad.at(path.substring(0, path.lastIndexOf('/'))))
                        .put(path.substring(path.lastIndexOf('/') + 1), time);
                invalid(mapper.writeValueAsBytes(bad));
            }
        }
        for (String field : List.of("consumerId", "action")) {
            ObjectNode bad = valid.deepCopy();
            ((ObjectNode) bad.at("/failures/0")).put(field, "unknown");
            invalid(mapper.writeValueAsBytes(bad));
        }
        for (String action : List.of("RECOVER", "CRASH")) {
            ObjectNode bad = valid.deepCopy();
            ((ObjectNode) bad.at("/failures/" + (action.equals("RECOVER") ? "0" : "1")))
                    .put("action", action);
            invalid(mapper.writeValueAsBytes(bad));
        }
        ObjectNode sameTime = valid.deepCopy();
        ((ObjectNode) sameTime.at("/failures/1")).put("timeMs", 25);
        invalid(mapper.writeValueAsBytes(sameTime));
        ObjectNode unknownMessage = valid.deepCopy();
        ((ObjectNode) unknownMessage.at("/lostAcknowledgments/0")).put("messageId", "unknown");
        invalid(mapper.writeValueAsBytes(unknownMessage));
        for (int attempt : new int[] {0, 4}) {
            ObjectNode bad = valid.deepCopy();
            ((ObjectNode) bad.at("/lostAcknowledgments/0")).put("attempt", attempt);
            invalid(mapper.writeValueAsBytes(bad));
        }
        ObjectNode duplicateLoss = valid.deepCopy();
        ((ArrayNode) duplicateLoss.get("lostAcknowledgments"))
                .add(duplicateLoss.at("/lostAcknowledgments/0").deepCopy());
        invalid(mapper.writeValueAsBytes(duplicateLoss));
        ObjectNode before = valid.deepCopy();
        before.put("acknowledgmentPolicy", "ACK_BEFORE_EFFECT");
        before.put("acknowledgmentDelayMs", 50);
        invalid(mapper.writeValueAsBytes(before));
        for (String collection :
                List.of("messages", "consumers", "failures", "lostAcknowledgments")) {
            int max =
                    switch (collection) {
                        case "messages" -> 20;
                        case "consumers" -> 3;
                        case "failures" -> 8;
                        default -> 20;
                    };
            ObjectNode tooMany = valid.deepCopy();
            ArrayNode items = mapper.createArrayNode();
            for (int i = 0; i <= max; i++) items.add(valid.at("/" + collection + "/0").deepCopy());
            tooMany.set(collection, items);
            invalid(mapper.writeValueAsBytes(tooMany));
        }
        // Arbitrary input order is valid; chronology is checked without rewriting the input arrays.
        ObjectNode unsorted = valid.deepCopy();
        ArrayNode reversed = mapper.createArrayNode();
        reversed.add(valid.at("/failures/1")).add(valid.at("/failures/0"));
        unsorted.set("failures", reversed);
        var accepted = successful(post(mapper.writeValueAsBytes(unsorted)));
        assertThat(accepted.at("/failureOutcomes/0/timeMs").asLong()).isEqualTo(75);
        for (long seed :
                new long[] {-DeliveryInput.MAX_ABSOLUTE_SEED, DeliveryInput.MAX_ABSOLUTE_SEED}) {
            ObjectNode boundary = tree(baseline());
            boundary.put("seed", seed);
            assertThat(successful(post(mapper.writeValueAsBytes(boundary))).path("seed").asLong())
                    .isEqualTo(seed);
        }
    }

    @Test
    void maximumValidPayloadAndDefaultVirtualLimitRemainBoundedAndRecover() throws Exception {
        var jobs =
                IntStream.range(0, 20)
                        .mapToObj(
                                i ->
                                        new Message(
                                                "m" + "x".repeat(29) + String.format("%02d", i), 0))
                        .toList();
        var b = baseline();
        var input =
                new DeliveryInput(
                        b.schemaVersion(),
                        b.modelVersion(),
                        jobs,
                        List.of(new Consumer("c1"), new Consumer("c2"), new Consumer("c3")),
                        1_000,
                        1_000,
                        1,
                        5,
                        b.acknowledgmentPolicy(),
                        List.of(),
                        List.of(),
                        42);
        byte[] body = mapper.writeValueAsBytes(input);
        assertThat(body.length).isLessThanOrEqualTo(httpLimits.maxRequestBytes());
        var response = post(body);
        var actual = successful(response);
        assertThat(response.body().length)
                .isLessThanOrEqualTo(httpLimits.maxSimulationResponseBytes());
        assertThat((long) mapper.writeValueAsBytes(actual.path("events")).length)
                .isLessThanOrEqualTo(DeliveryLimits.CURRENT.maxTraceBytes());
        assertThat(actual.path("messageOutcomes").size()).isEqualTo(20);
        assertThat(actual.path("status").asString()).isIn("completed", "limited");
        var limitedInput =
                controller.descriptor().presets().stream()
                        .filter(p -> p.id().equals("virtual-limit"))
                        .findFirst()
                        .orElseThrow()
                        .input();
        var limited = successful(post(mapper.writeValueAsBytes(limitedInput)));
        assertThat(limited.path("truncationReason").asString()).isEqualTo("virtual_time_limit");
        assertThat(limited.at("/metrics/runningEffects").asInt()).isEqualTo(1);
        assertThat(limited.at("/metrics").has("acknowledgedWithoutEffect")).isFalse();
        assertThat(limited.at("/metrics").has("meanFirstEffectLatencyMs")).isFalse();
        assertThat(limited.at("/attemptOutcomes/0/scheduledEffectAtMs").asLong()).isEqualTo(60_050);
        assertThat(limited.at("/attemptOutcomes/0").has("effectCommittedAtMs")).isFalse();
        assertThat(successful(post(mapper.writeValueAsBytes(baseline()))).path("status").asString())
                .isEqualTo("completed");
    }

    @Test
    void concurrentDifferentInputsReturnTheirOwnAuthoritativeResultsWithoutSharedState()
            throws Exception {
        var first = controller.descriptor().presets().get(1).input();
        var source = baseline();
        var second =
                new DeliveryInput(
                        source.schemaVersion(),
                        source.modelVersion(),
                        source.messages(),
                        source.consumers(),
                        80,
                        source.acknowledgmentDelayMs(),
                        source.visibilityTimeoutMs(),
                        source.maxDeliveryAttempts(),
                        source.acknowledgmentPolicy(),
                        source.failures(),
                        source.lostAcknowledgments(),
                        99);
        var a =
                CLIENT.sendAsync(
                        request(mapper.writeValueAsBytes(first)),
                        HttpResponse.BodyHandlers.ofByteArray());
        var b =
                CLIENT.sendAsync(
                        request(mapper.writeValueAsBytes(second)),
                        HttpResponse.BodyHandlers.ofByteArray());
        assertThat(successful(a.get(15, TimeUnit.SECONDS)))
                .isEqualTo(mapper.readTree(mapper.writeValueAsBytes(simulator.run(first))));
        assertThat(successful(b.get(15, TimeUnit.SECONDS)))
                .isEqualTo(mapper.readTree(mapper.writeValueAsBytes(simulator.run(second))));
        assertThat(run("baseline").ledger()).hasSize(1);
    }

    @Test
    void deliversCanonicalDraftContentWhileBothQueueDraftsStayOutsidePublishedCollections()
            throws Exception {
        var draft = successful(get("/api/v1/draft/topics/queues-delivery"));
        Path content = Path.of("../content/topics/queues-delivery");
        assertThat(draft.at("/topic/status").asString()).isEqualTo("draft");
        assertThat(draft.at("/topic/contentVersion").asString()).isEqualTo("1.0.0");
        assertThat(draft.at("/topic/prerequisites/0").asString()).isEqualTo("queues-tail-latency");
        assertThat(draft.path("lessonMarkdown").asString())
                .isEqualTo(Files.readString(content.resolve("lesson.md")));
        assertThat(draft.path("questions"))
                .isEqualTo(mapper.readTree(Files.readAllBytes(content.resolve("questions.json"))));
        assertThat(draft.path("questions").size()).isEqualTo(8);
        assertThat(draft.path("checkpoints")).isEmpty();
        Set<String> draftIds = Set.of("queues-delivery", "queues-tail-latency");
        for (String id : draftIds)
            assertThat(get("/api/v1/topics/" + id).statusCode()).isEqualTo(404);
        for (JsonNode topic : successful(get("/api/v1/topics"))) {
            assertThat(topic.path("status").asString()).isEqualTo("published");
            assertThat(topic.path("id").asString()).isNotIn(draftIds);
        }
        for (String query : List.of("queue", "delivery", "ack")) {
            for (JsonNode hit : successful(get("/api/v1/search?q=" + query)).path("results")) {
                assertThat(hit.at("/entry/status").asString()).isEqualTo("published");
                assertThat(hit.at("/entry/id").asString()).isNotIn(draftIds);
            }
        }
        var path = successful(get("/api/v1/learning-paths/first-system-design"));
        for (JsonNode step : path.path("steps"))
            assertThat(step.path("moduleId").asString()).isNotIn(draftIds);
        for (JsonNode module : path.path("optionalModules"))
            assertThat(module.path("id").asString()).isNotIn(draftIds);
        for (String id : List.of("request-flow", "url-shortener", "unknown")) {
            assertThat(get("/api/v1/draft/topics/" + id).statusCode()).isEqualTo(404);
        }
    }
}
