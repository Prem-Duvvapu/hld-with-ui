package com.hld.api;

import com.hld.atomicity.AtomicityAnalyzer;
import com.hld.atomicity.AtomicityDescriptor;
import com.hld.atomicity.AtomicityInput;
import com.hld.atomicity.AtomicityInput.Action;
import com.hld.atomicity.AtomicityInput.Mode;
import com.hld.atomicity.AtomicityInput.Step;
import com.hld.atomicity.AtomicityInput.Transaction;
import com.hld.atomicity.AtomicityLimits;
import com.hld.atomicity.AtomicityPresets;
import com.hld.atomicity.AtomicityValidator;
import java.util.ArrayList;
import java.util.List;
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

/** Strict transport parsing and shared resource bounds, without model behavior in the controller. */
@RestController
@RequestMapping("/api/v1/simulations/transaction-atomicity")
public class AtomicityController {
    private static final Set<String> INPUT_FIELDS = Set.of(
            "schemaVersion", "modelVersion", "mode", "initialUnits", "transactions", "schedule");
    private static final Set<String> TRANSACTION_FIELDS = Set.of("id", "quantity");
    private static final Set<String> STEP_FIELDS = Set.of("id", "transactionId", "action");
    private final AtomicityAnalyzer analyzer;
    private final SimulationResponses responses;
    private final ObjectReader reader;

    public AtomicityController(AtomicityAnalyzer analyzer, SimulationResponses responses, ObjectMapper mapper) {
        this.analyzer = analyzer;
        this.responses = responses;
        this.reader = mapper.readerFor(JsonNode.class)
                .with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }

    @GetMapping
    public AtomicityDescriptor descriptor() {
        return new AtomicityDescriptor(AtomicityAnalyzer.SIMULATION_ID, "Atomicity & Abort", "simulation",
                AtomicityInput.MODEL_VERSION,
                "Compare separately published stock and allocation writes with private preparation, revision-checked publication and abort. This bounded local model promises no database isolation level or durability.",
                AtomicityLimits.CURRENT, AtomicityPresets.all(), AtomicityAnalyzer.ASSUMPTIONS);
    }

    @PostMapping("/runs")
    public ResponseEntity<byte[]> run(@RequestBody byte[] body) {
        return responses.json(analyzer.run(readInput(body)));
    }

    private AtomicityInput readInput(byte[] body) {
        try {
            JsonNode json = reader.readValue(body);
            exactFields(json, INPUT_FIELDS, "input");
            List<Transaction> transactions = new ArrayList<>();
            for (JsonNode transaction : array(json, "transactions", AtomicityInput.MIN_TRANSACTIONS, AtomicityInput.MAX_TRANSACTIONS)) {
                exactFields(transaction, TRANSACTION_FIELDS, "transaction");
                transactions.add(new Transaction(text(transaction, "id"), integer(transaction, "quantity")));
            }
            List<Step> schedule = new ArrayList<>();
            for (JsonNode step : array(json, "schedule", AtomicityInput.MIN_STEPS, AtomicityInput.MAX_STEPS)) {
                exactFields(step, STEP_FIELDS, "schedule step");
                schedule.add(new Step(text(step, "id"), text(step, "transactionId"), action(text(step, "action"))));
            }
            AtomicityInput input = new AtomicityInput(text(json, "schemaVersion"), text(json, "modelVersion"),
                    mode(text(json, "mode")), integer(json, "initialUnits"), transactions, schedule);
            AtomicityValidator.validate(input);
            return input;
        } catch (JacksonException exception) {
            throw new IllegalArgumentException("The request must contain one valid atomicity-input JSON object.", exception);
        }
    }

    private static Mode mode(String value) {
        try { return Mode.valueOf(value); }
        catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("mode must be SPLIT_WRITES or STAGED_VERSION_CHECK.", exception);
        }
    }
    private static Action action(String value) {
        try { return Action.valueOf(value); }
        catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("action must be BEGIN, DECREMENT_STOCK, RECORD_ALLOCATION, COMMIT or ABORT.", exception);
        }
    }
    private static void exactFields(JsonNode value, Set<String> fields, String label) {
        if (value == null || !value.isObject() || !Set.copyOf(value.propertyNames()).equals(fields)) {
            throw new IllegalArgumentException(label + " contains missing or unknown fields.");
        }
    }
    private static String text(JsonNode value, String field) {
        JsonNode item = value.get(field);
        if (item == null || !item.isString()) throw new IllegalArgumentException(field + " must be a JSON string.");
        return item.asString();
    }
    private static int integer(JsonNode value, String field) {
        JsonNode item = value.get(field);
        if (item == null || !item.isIntegralNumber() || !item.canConvertToInt()) {
            throw new IllegalArgumentException(field + " must be an integer JSON number in range.");
        }
        return item.asInt();
    }
    private static JsonNode array(JsonNode value, String field, int minimum, int maximum) {
        JsonNode item = value.get(field);
        if (item == null || !item.isArray() || item.size() < minimum || item.size() > maximum) {
            throw new IllegalArgumentException(field + " must contain " + minimum + "–" + maximum + " array entries.");
        }
        return item;
    }
}
