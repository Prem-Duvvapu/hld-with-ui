package com.hld.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.api.HttpExecutionLimits;
import com.hld.delivery.DeliveryInput.AcknowledgmentPolicy;
import com.hld.delivery.DeliveryInput.Consumer;
import com.hld.delivery.DeliveryInput.Failure;
import com.hld.delivery.DeliveryInput.FailureAction;
import com.hld.delivery.DeliveryInput.LostAcknowledgment;
import com.hld.delivery.DeliveryInput.Message;
import com.hld.simulation.engine.SimulationBudget;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import tools.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.EnumSet;
import java.util.List;
import java.util.stream.IntStream;

/** Application serialization evidence for a standalone model, without an HTTP endpoint. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class DeliverySerializationTest {
    @Autowired ObjectMapper mapper;
    @Autowired HttpExecutionLimits httpLimits;

    private static DeliveryInput baseline() {
        return input(50, 100, List.of(), List.of());
    }

    private static DeliveryInput input(
            long processingMs,
            long visibilityMs,
            List<Failure> failures,
            List<LostAcknowledgment> losses) {
        return new DeliveryInput(
                "1.0",
                "1.0.0",
                List.of(new Message("m1", 0)),
                List.of(new Consumer("c1")),
                processingMs,
                5,
                visibilityMs,
                3,
                AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                failures,
                losses,
                42);
    }

    @Test
    void baselineExamplesComeFromActualJavaAndOrdinaryRunsCannotRewriteThem() throws Exception {
        var inputFile = Path.of("../contracts/examples/queue-delivery-baseline-input.json");
        assertThat(inputFile).exists();
        byte[] inputJson = Files.readAllBytes(inputFile);
        assertThat(mapper.readTree(inputJson))
                .isEqualTo(mapper.readTree(mapper.writeValueAsBytes(baseline())));
        var parsed = mapper.readValue(inputJson, DeliveryInput.class);
        var result = new DeliverySimulator().run(parsed);
        byte[] actual = mapper.writeValueAsBytes(result);
        var generated = Path.of("target/queue-delivery-baseline-result.json");
        Files.createDirectories(generated.getParent());
        Files.write(generated, actual);
        var tracked = Path.of("../contracts/examples/queue-delivery-baseline-result.json");
        if (Boolean.getBoolean("hld.delivery.writeExamples")) {
            // Explicit one-time authoring only; regular verification compares the tracked artifact.
            Files.write(tracked, actual);
        }
        assertThat(tracked).exists();
        assertThat(mapper.readTree(actual)).isEqualTo(mapper.readTree(Files.readAllBytes(tracked)));
        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.lastVirtualTimeMs()).isEqualTo(55);
        assertThat(result.metrics().deliveryAttempts()).isEqualTo(1);
        assertThat(result.metrics().committedEffects()).isEqualTo(1);
        assertThat(result.metrics().acknowledgedWithoutEffect()).isZero();
        assertThat(mapper.readTree(actual).path("events").get(0).path("kind").asString())
                .isEqualTo("message.enqueued");
        assertThat(mapper.readTree(actual).has("truncationReason")).isFalse();
    }

    @Test
    void longestSupportedIdsAndMaximumAttemptsRespectActualJsonTraceBudgets() {
        var messages =
                IntStream.range(0, 20)
                        .mapToObj(
                                i ->
                                        new Message(
                                                "m" + "x".repeat(29) + String.format("%02d", i), 0))
                        .toList();
        var consumers =
                IntStream.range(0, 3)
                        .mapToObj(
                                i -> new Consumer("c" + "x".repeat(29) + String.format("%02d", i)))
                        .toList();
        assertThat(messages).allSatisfy(message -> assertThat(message.id()).hasSize(32));
        assertThat(consumers).allSatisfy(consumer -> assertThat(consumer.id()).hasSize(32));
        var input =
                new DeliveryInput(
                        "1.0",
                        "1.0.0",
                        messages,
                        consumers,
                        95,
                        5,
                        100,
                        5,
                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                        List.of(),
                        List.of(),
                        42);
        assertThat(mapper.writeValueAsBytes(input).length)
                .isLessThanOrEqualTo(httpLimits.maxRequestBytes());
        for (long limit :
                new long[] {2, 512, 4096, 32_768, SimulationBudget.DEFAULT_MAX_TRACE_BYTES}) {
            var result =
                    new DeliverySimulator(new SimulationBudget(10_000, 60_000, limit, 0))
                            .run(input);
            byte[] events = mapper.writeValueAsBytes(result.events());
            assertThat(events.length)
                    .as("actual event-array bytes at budget %d", limit)
                    .isLessThanOrEqualTo((int) limit);
            long estimated =
                    2
                            + Math.max(0, result.events().size() - 1)
                            + result.events().stream()
                                    .mapToLong(DeliverySimulator::estimatedEventBytes)
                                    .sum();
            assertThat(estimated).isLessThanOrEqualTo(limit);
            assertThat((long) events.length).isLessThanOrEqualTo(estimated);
            assertThat(mapper.readTree(events).size()).isEqualTo(result.events().size());
            // Shared response envelope only: this assertion does not register a delivery HTTP
            // route.
            assertThat(mapper.writeValueAsBytes(result).length)
                    .isLessThanOrEqualTo(httpLimits.maxSimulationResponseBytes());
            if (result.status().equals("limited")) {
                assertThat(result.truncationReason()).isEqualTo("trace_size_limit");
                assertThat(result.metrics().acknowledgedWithoutEffect()).isNull();
            } else {
                assertThat(result.metrics().deliveryAttempts()).isEqualTo(100);
                assertThat(result.metrics().committedEffects()).isEqualTo(100);
                assertThat(result.metrics().deadLetteredMessages()).isEqualTo(20);
            }
            System.out.printf(
                    "DELIVERY_SERIALIZATION budget=%d events=%d eventBytes=%d responseBytes=%d"
                        + " status=%s%n",
                    limit,
                    result.events().size(),
                    events.length,
                    mapper.writeValueAsBytes(result).length,
                    result.status());
        }
    }

    @Test
    void realWireKindsAndAllBmpEscapingRemainConservativelyEstimated() {
        var observed = EnumSet.noneOf(DeliveryEvent.Kind.class);
        for (var input :
                List.of(
                        baseline(),
                        input(50, 100, List.of(), List.of(new LostAcknowledgment("m1", 1))),
                        input(95, 100, List.of(), List.of()),
                        input(
                                50,
                                100,
                                List.of(
                                        new Failure("c1", FailureAction.CRASH, 25),
                                        new Failure("c1", FailureAction.RECOVER, 75)),
                                List.of()))) {
            var result = new DeliverySimulator().run(input);
            for (var event : result.events()) {
                observed.add(event.kind());
                assertThat(mapper.readTree(mapper.writeValueAsBytes(event)).path("kind").asString())
                        .isEqualTo(event.kind().value());
                assertThat((long) mapper.writeValueAsBytes(event).length)
                        .isLessThanOrEqualTo(DeliverySimulator.estimatedEventBytes(event));
            }
        }
        assertThat(observed)
                .containsExactlyInAnyOrderElementsOf(EnumSet.allOf(DeliveryEvent.Kind.class));
        var text = new StringBuilder();
        for (int value = Character.MIN_VALUE; value <= Character.MAX_VALUE; value++) {
            if (!Character.isSurrogate((char) value)) text.append((char) value);
        }
        text.append(
                "\uD83C\uDF31"); // Include a valid surrogate pair as well as every nonsurrogate BMP
                                 // code unit.
        var actual = new DeliverySimulator().run(baseline()).events().get(0);
        // Isolated estimator stress only; arbitrary Unicode IDs or this oversized narration are not
        // model inputs.
        var synthetic =
                new DeliveryEvent(
                        actual.sequence(),
                        actual.timeMs(),
                        actual.kind(),
                        actual.messageId(),
                        actual.attemptId(),
                        actual.consumerId(),
                        text.toString(),
                        actual.changes(),
                        actual.ledgerEntry());
        byte[] bytes = mapper.writeValueAsBytes(synthetic);
        assertThat((long) bytes.length)
                .isLessThanOrEqualTo(DeliverySimulator.estimatedEventBytes(synthetic));
        assertThat(mapper.readTree(bytes).path("message").asString()).isEqualTo(text.toString());
    }

    @Test
    void configuredMapperRejectsUnknownFieldsTrailingRootsAndWrongStructures() {
        String valid = mapper.writeValueAsString(baseline());
        for (String invalid :
                List.of(
                        valid.substring(0, valid.length() - 1) + ",\"invented\":true}",
                        valid.replace(
                                "\"enqueueTimeMs\":0", "\"enqueueTimeMs\":0,\"invented\":true"),
                        valid + "{}",
                        valid.replace("\"processingTimeMs\":50,", ""),
                        valid.replace("\"processingTimeMs\":50", "\"processingTimeMs\":{}"),
                        valid.replace("\"ACK_AFTER_EFFECT\"", "\"INVENTED_POLICY\""))) {
            assertThat(invalid).isNotEqualTo(valid);
            assertThatThrownBy(() -> mapper.readValue(invalid, DeliveryInput.class))
                    .isInstanceOf(RuntimeException.class);
        }
    }

    @Test
    void parsedNullCollectionsAreRejectedByDirectDomainValidation() {
        String valid = mapper.writeValueAsString(baseline());
        String nullFailures = valid.replace("\"failures\":[]", "\"failures\":null");
        assertThat(nullFailures).isNotEqualTo(valid);
        assertThatThrownBy(
                        () ->
                                new DeliverySimulator()
                                        .run(mapper.readValue(nullFailures, DeliveryInput.class)))
                .isInstanceOf(RuntimeException.class);
    }
}
