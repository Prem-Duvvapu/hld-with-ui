package com.hld.api;

import com.hld.delivery.DeliveryDescriptor;
import com.hld.delivery.DeliveryDescriptor.Preset;
import com.hld.delivery.DeliveryInput;
import com.hld.delivery.DeliveryInput.AcknowledgmentPolicy;
import com.hld.delivery.DeliveryInput.Consumer;
import com.hld.delivery.DeliveryInput.Failure;
import com.hld.delivery.DeliveryInput.FailureAction;
import com.hld.delivery.DeliveryInput.LostAcknowledgment;
import com.hld.delivery.DeliveryInput.Message;
import com.hld.delivery.DeliveryLimits;
import com.hld.delivery.DeliverySimulator;
import com.hld.delivery.DeliveryValidator;

import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validator;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import tools.jackson.core.JacksonException;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.ObjectReader;

import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/simulations/queues-delivery")
public class DeliveryController {
    private static final Set<String> INPUT_FIELDS =
            Set.of(
                    "schemaVersion",
                    "modelVersion",
                    "messages",
                    "consumers",
                    "processingTimeMs",
                    "acknowledgmentDelayMs",
                    "visibilityTimeoutMs",
                    "maxDeliveryAttempts",
                    "acknowledgmentPolicy",
                    "failures",
                    "lostAcknowledgments",
                    "seed");
    private static final Set<String> MESSAGE_FIELDS = Set.of("id", "enqueueTimeMs");
    private static final Set<String> CONSUMER_FIELDS = Set.of("id");
    private static final Set<String> FAILURE_FIELDS = Set.of("consumerId", "action", "timeMs");
    private static final Set<String> LOSS_FIELDS = Set.of("messageId", "attempt");
    private final DeliverySimulator simulator;
    private final SimulationResponses responses;
    private final ObjectMapper mapper;
    private final ObjectReader reader;
    private final Validator validator;

    public DeliveryController(
            DeliverySimulator simulator,
            SimulationResponses responses,
            ObjectMapper mapper,
            Validator validator) {
        this.simulator = simulator;
        this.responses = responses;
        this.mapper = mapper;
        this.validator = validator;
        this.reader =
                mapper.readerFor(JsonNode.class)
                        .with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                        .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }

    @GetMapping
    public DeliveryDescriptor descriptor() {
        return new DeliveryDescriptor(
                DeliverySimulator.SIMULATION_ID,
                "Delivery, ACKs & Duplicate Work",
                "simulation",
                DeliverySimulator.MODEL_VERSION,
                "An illustrative durable broker, consumer and ledger with separate delivery,"
                    + " acknowledgment and effect boundaries.",
                DeliveryLimits.CURRENT,
                List.of(
                        new Preset(
                                "baseline",
                                "ACK after effect",
                                "Does an accepted ACK prove that repeating the effect is"
                                    + " impossible?",
                                input(
                                        0,
                                        50,
                                        100,
                                        3,
                                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                                        oneConsumer(),
                                        List.of(),
                                        List.of())),
                        new Preset(
                                "lost-ack",
                                "Lose ACK for attempt 1",
                                "What changes when the effect commits but its ACK is lost?",
                                input(
                                        0,
                                        50,
                                        100,
                                        3,
                                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                                        oneConsumer(),
                                        List.of(),
                                        List.of(new LostAcknowledgment("m1", 1)))),
                        new Preset(
                                "crash-before",
                                "Crash at 25 ms; recover at 75 ms",
                                "Which uncommitted local work is cancelled by this crash?",
                                input(
                                        0,
                                        50,
                                        100,
                                        3,
                                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                                        oneConsumer(),
                                        crash(25, 75),
                                        List.of())),
                        new Preset(
                                "crash-after",
                                "Crash at 52 ms; recover at 102 ms",
                                "Can the crash erase the effect that already committed?",
                                input(
                                        0,
                                        50,
                                        100,
                                        3,
                                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                                        oneConsumer(),
                                        crash(52, 102),
                                        List.of())),
                        new Preset(
                                "early-ack-crash",
                                "ACK before effect; crash at 25 ms",
                                "Can the broker acknowledge a message whose effect is later"
                                    + " cancelled?",
                                input(
                                        0,
                                        50,
                                        100,
                                        3,
                                        AcknowledgmentPolicy.ACK_BEFORE_EFFECT,
                                        oneConsumer(),
                                        crash(25, 75),
                                        List.of())),
                        new Preset(
                                "lease-boundary",
                                "ACK at the lease deadline",
                                "What does the strict token rule do when ACK and expiry share a"
                                    + " timestamp?",
                                input(
                                        0,
                                        95,
                                        100,
                                        2,
                                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                                        oneConsumer(),
                                        List.of(),
                                        List.of())),
                        new Preset(
                                "overlapping-attempts",
                                "Lease expires during processing",
                                "Can an expired attempt commit while a second consumer processes a"
                                    + " retry?",
                                input(
                                        0,
                                        150,
                                        100,
                                        2,
                                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                                        List.of(new Consumer("c1"), new Consumer("c2")),
                                        List.of(),
                                        List.of())),
                        new Preset(
                                "virtual-limit",
                                "Virtual-time limit",
                                "Is a scheduled effect an observed committed effect?",
                                input(
                                        60_000,
                                        50,
                                        100,
                                        3,
                                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                                        oneConsumer(),
                                        List.of(),
                                        List.of())),
                        new Preset(
                                "no-recovery",
                                "Crash at 0 ms; no recovery",
                                "What remains when the only consumer is down before delivery?",
                                input(
                                        0,
                                        50,
                                        100,
                                        3,
                                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                                        oneConsumer(),
                                        List.of(new Failure("c1", FailureAction.CRASH, 0)),
                                        List.of()))),
                DeliverySimulator.ASSUMPTIONS);
    }

    @PostMapping("/runs")
    public ResponseEntity<byte[]> run(@RequestBody byte[] body) {
        return responses.json(simulator.run(readInput(body)));
    }

    private DeliveryInput readInput(byte[] body) {
        try {
            JsonNode json = reader.readValue(body);
            exactFields(json, INPUT_FIELDS, "input");
            for (String field : List.of("schemaVersion", "modelVersion", "acknowledgmentPolicy"))
                text(json, field);
            for (String field :
                    List.of(
                            "processingTimeMs",
                            "acknowledgmentDelayMs",
                            "visibilityTimeoutMs",
                            "seed")) integer(json, field, false);
            integer(json, "maxDeliveryAttempts", true);
            JsonNode messages = array(json, "messages", 1, DeliveryInput.MAX_MESSAGES);
            for (JsonNode message : messages) {
                exactFields(message, MESSAGE_FIELDS, "message");
                text(message, "id");
                integer(message, "enqueueTimeMs", false);
            }
            JsonNode consumers = array(json, "consumers", 1, DeliveryInput.MAX_CONSUMERS);
            for (JsonNode consumer : consumers) {
                exactFields(consumer, CONSUMER_FIELDS, "consumer");
                text(consumer, "id");
            }
            JsonNode failures = array(json, "failures", 0, DeliveryInput.MAX_FAILURES);
            for (JsonNode failure : failures) {
                exactFields(failure, FAILURE_FIELDS, "failure");
                text(failure, "consumerId");
                text(failure, "action");
                integer(failure, "timeMs", false);
            }
            JsonNode losses =
                    array(json, "lostAcknowledgments", 0, DeliveryInput.MAX_LOST_ACKNOWLEDGMENTS);
            for (JsonNode loss : losses) {
                exactFields(loss, LOSS_FIELDS, "lost acknowledgment");
                text(loss, "messageId");
                integer(loss, "attempt", true);
            }
            DeliveryInput input = mapper.treeToValue(json, DeliveryInput.class);
            var violations = validator.validate(input);
            if (!violations.isEmpty()) throw new ConstraintViolationException(violations);
            DeliveryValidator.validate(input);
            return input;
        } catch (JacksonException exception) {
            throw new IllegalArgumentException(
                    "The request must contain one valid delivery-input JSON object.", exception);
        }
    }

    private static void exactFields(JsonNode value, Set<String> fields, String label) {
        if (value == null
                || !value.isObject()
                || !Set.copyOf(value.propertyNames()).equals(fields)) {
            throw new IllegalArgumentException(label + " contains missing or unknown fields.");
        }
    }

    private static void text(JsonNode value, String field) {
        if (!value.get(field).isString())
            throw new IllegalArgumentException(field + " must be a string.");
    }

    private static void integer(JsonNode value, String field, boolean small) {
        JsonNode number = value.get(field);
        if (!number.isIntegralNumber()
                || !number.canConvertToLong()
                || (small && !number.canConvertToInt())) {
            throw new IllegalArgumentException(field + " must be an integer JSON number in range.");
        }
    }

    private static JsonNode array(JsonNode value, String field, int min, int max) {
        JsonNode list = value.get(field);
        if (!list.isArray() || list.size() < min || list.size() > max) {
            throw new IllegalArgumentException(
                    field + " must be an array of " + min + "–" + max + " entries.");
        }
        return list;
    }

    private static DeliveryInput input(
            long enqueue,
            long processing,
            long lease,
            int attempts,
            AcknowledgmentPolicy policy,
            List<Consumer> consumers,
            List<Failure> failures,
            List<LostAcknowledgment> losses) {
        return new DeliveryInput(
                DeliveryInput.SCHEMA_VERSION,
                DeliveryInput.MODEL_VERSION,
                List.of(new Message("m1", enqueue)),
                consumers,
                processing,
                5,
                lease,
                attempts,
                policy,
                failures,
                losses,
                42);
    }

    private static List<Consumer> oneConsumer() {
        return List.of(new Consumer("c1"));
    }

    private static List<Failure> crash(long at, long recovery) {
        return List.of(
                new Failure("c1", FailureAction.CRASH, at),
                new Failure("c1", FailureAction.RECOVER, recovery));
    }
}
