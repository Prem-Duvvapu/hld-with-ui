package com.hld.api;

import com.hld.idempotency.IdempotencyDescriptor;
import com.hld.idempotency.IdempotencyInput;
import com.hld.idempotency.IdempotencyInput.Action;
import com.hld.idempotency.IdempotencyInput.Call;
import com.hld.idempotency.IdempotencyInput.Mode;
import com.hld.idempotency.IdempotencyInput.Step;
import com.hld.idempotency.IdempotencyLimits;
import com.hld.idempotency.IdempotencyPresets;
import com.hld.idempotency.IdempotencySimulator;
import com.hld.idempotency.IdempotencyValidator;
import java.util.ArrayList;
import java.util.Set;
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

/** Closed transport parsing and existing shared resource guards around the pure model. */
@RestController
@RequestMapping("/api/v1/simulations/idempotency")
public class IdempotencyController {
    private static final Set<String> INPUT_FIELDS = Set.of("schemaVersion", "modelVersion", "mode", "retentionMs", "calls", "schedule");
    private static final Set<String> CALL_FIELDS = Set.of("id", "operationId", "tenantId", "key", "units");
    private static final Set<String> STEP_FIELDS = Set.of("id", "callId", "timeMs", "action");
    private final IdempotencySimulator simulator;
    private final SimulationResponses responses;
    private final ObjectReader reader;

    public IdempotencyController(IdempotencySimulator simulator, SimulationResponses responses, ObjectMapper mapper) {
        this.simulator = simulator;
        this.responses = responses;
        reader = mapper.readerFor(JsonNode.class).with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }

    @GetMapping
    public IdempotencyDescriptor descriptor() {
        return new IdempotencyDescriptor(IdempotencySimulator.SIMULATION_ID, "Idempotency", "simulation",
                IdempotencyInput.SCHEMA_VERSION, IdempotencyInput.MODEL_VERSION,
                "Compare lost responses, split writes and atomic effect/result publication. Inspect private work, public effects, retained keys and caller observations in a bounded authored program without real storage or durability guarantees.",
                "unprotected-response-loss", IdempotencyLimits.CURRENT,
                IdempotencyPresets.all(), IdempotencySimulator.ASSUMPTIONS);
    }

    @PostMapping("/runs")
    public ResponseEntity<byte[]> run(@RequestBody byte[] body) {
        return responses.json(simulator.run(readInput(body)));
    }

    private IdempotencyInput readInput(byte[] body) {
        try {
            JsonNode json = reader.readValue(body);
            exactFields(json, INPUT_FIELDS, "input");
            JsonNode callEntries = array(json, "calls", IdempotencyInput.MIN_CALLS, IdempotencyInput.MAX_CALLS);
            var calls = new ArrayList<Call>();
            for (JsonNode entry : callEntries) {
                exactFields(entry, CALL_FIELDS, "call");
                calls.add(new Call(text(entry, "id"), text(entry, "operationId"), text(entry, "tenantId"),
                        text(entry, "key"), integer(entry, "units")));
            }
            JsonNode stepEntries = array(json, "schedule", IdempotencyInput.MIN_STEPS, IdempotencyInput.MAX_STEPS);
            var schedule = new ArrayList<Step>();
            for (JsonNode entry : stepEntries) {
                exactFields(entry, STEP_FIELDS, "step");
                schedule.add(new Step(text(entry, "id"), text(entry, "callId"), integer(entry, "timeMs"),
                        action(text(entry, "action"))));
            }
            var input = new IdempotencyInput(text(json, "schemaVersion"), text(json, "modelVersion"),
                    mode(text(json, "mode")), integer(json, "retentionMs"), calls, schedule);
            IdempotencyValidator.validate(input);
            return input;
        } catch (JacksonException exception) {
            throw new IllegalArgumentException("The request must contain one valid idempotency-input JSON object.", exception);
        }
    }

    private static void exactFields(JsonNode value, Set<String> fields, String label) {
        if (value == null || !value.isObject() || !Set.copyOf(value.propertyNames()).equals(fields))
            throw new IllegalArgumentException(label + " contains missing or unknown fields.");
    }
    private static JsonNode array(JsonNode value, String field, int minimum, int maximum) {
        JsonNode entries = value.get(field);
        if (entries == null || !entries.isArray() || entries.size() < minimum || entries.size() > maximum)
            throw new IllegalArgumentException(field + " must contain " + minimum + ".." + maximum + " entries.");
        return entries;
    }
    private static String text(JsonNode value, String field) {
        JsonNode item = value.get(field);
        if (item == null || !item.isString()) throw new IllegalArgumentException(field + " must be a JSON string.");
        return item.asString();
    }
    private static int integer(JsonNode value, String field) {
        JsonNode item = value.get(field);
        if (item == null || !item.isIntegralNumber() || !item.canConvertToInt())
            throw new IllegalArgumentException(field + " must be an integer JSON number in range.");
        return item.asInt();
    }
    private static Mode mode(String value) {
        try { return Mode.valueOf(value); }
        catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("mode must be NO_DEDUP, SPLIT_EFFECT_RECORD or ATOMIC_EFFECT_RECORD.", exception);
        }
    }
    private static Action action(String value) {
        try { return Action.valueOf(value); }
        catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("action must be LOOKUP, WRITE_EFFECT, SAVE_RESULT, RESPOND, LOSE_RESPONSE or CRASH_HANDLER.", exception);
        }
    }
}
