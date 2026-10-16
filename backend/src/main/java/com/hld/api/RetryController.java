package com.hld.api;

import com.hld.retries.RetryDescriptor;
import com.hld.retries.RetryInput;
import com.hld.retries.RetryInput.Backoff;
import com.hld.retries.RetryInput.Jitter;
import com.hld.retries.RetryInput.Request;
import com.hld.retries.RetryLimits;
import com.hld.retries.RetryPresets;
import com.hld.retries.RetrySimulator;
import com.hld.retries.RetryValidator;
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

/** Strict transport parsing and shared HTTP guards around unchanged Java behavior. */
@RestController
@RequestMapping("/api/v1/simulations/timeouts-retries")
public class RetryController {
    private static final Set<String> INPUT_FIELDS = Set.of("schemaVersion", "modelVersion", "seed",
            "workers", "queueCapacity", "attemptTimeoutMs", "overallTimeoutMs", "maxAttempts",
            "backoff", "baseDelayMs", "maxDelayMs", "jitter", "retryBudget", "unavailableUntilMs", "requests");
    private static final Set<String> REQUEST_FIELDS = Set.of("id", "arrivalTimeMs", "serviceTimeMs");
    private final RetrySimulator simulator;
    private final SimulationResponses responses;
    private final ObjectReader reader;

    public RetryController(RetrySimulator simulator, SimulationResponses responses, ObjectMapper mapper) {
        this.simulator = simulator;
        this.responses = responses;
        reader = mapper.readerFor(JsonNode.class).with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }

    @GetMapping
    public RetryDescriptor descriptor() {
        return new RetryDescriptor(RetrySimulator.SIMULATION_ID, "Timeouts & Retries", "simulation",
                RetryInput.MODEL_VERSION,
                "Separate caller waiting from accepted server work. Compare timeout, queue admission, backoff, seeded jitter and a shared retry budget in a bounded virtual-time model without cancellation or business effects.",
                RetryLimits.CURRENT, RetryPresets.all(), RetrySimulator.ASSUMPTIONS);
    }

    @PostMapping("/runs")
    public ResponseEntity<byte[]> run(@RequestBody byte[] body) {
        return responses.json(simulator.run(readInput(body)));
    }

    private RetryInput readInput(byte[] body) {
        try {
            JsonNode json = reader.readValue(body);
            exactFields(json, INPUT_FIELDS, "input");
            JsonNode entries = json.get("requests");
            if (entries == null || !entries.isArray() || entries.isEmpty() || entries.size() > RetryInput.MAX_REQUESTS)
                throw new IllegalArgumentException("requests must contain 1.." + RetryInput.MAX_REQUESTS + " entries.");
            var requests = new ArrayList<Request>();
            for (JsonNode entry : entries) {
                exactFields(entry, REQUEST_FIELDS, "request");
                requests.add(new Request(text(entry, "id"), integer(entry, "arrivalTimeMs"), integer(entry, "serviceTimeMs")));
            }
            var input = new RetryInput(text(json, "schemaVersion"), text(json, "modelVersion"), longInteger(json, "seed"),
                    integer(json, "workers"), integer(json, "queueCapacity"), integer(json, "attemptTimeoutMs"),
                    integer(json, "overallTimeoutMs"), integer(json, "maxAttempts"), backoff(text(json, "backoff")),
                    integer(json, "baseDelayMs"), integer(json, "maxDelayMs"), jitter(text(json, "jitter")),
                    integer(json, "retryBudget"), integer(json, "unavailableUntilMs"), requests);
            RetryValidator.validate(input);
            return input;
        } catch (JacksonException exception) {
            throw new IllegalArgumentException("The request must contain one valid retry-input JSON object.", exception);
        }
    }

    private static void exactFields(JsonNode value, Set<String> fields, String label) {
        if (value == null || !value.isObject() || !Set.copyOf(value.propertyNames()).equals(fields))
            throw new IllegalArgumentException(label + " contains missing or unknown fields.");
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
    private static long longInteger(JsonNode value, String field) {
        JsonNode item = value.get(field);
        if (item == null || !item.isIntegralNumber() || !item.canConvertToLong())
            throw new IllegalArgumentException(field + " must be an integer JSON number in range.");
        return item.asLong();
    }
    private static Backoff backoff(String value) {
        try { return Backoff.valueOf(value); }
        catch (IllegalArgumentException exception) { throw new IllegalArgumentException("backoff must be IMMEDIATE or EXPONENTIAL.", exception); }
    }
    private static Jitter jitter(String value) {
        try { return Jitter.valueOf(value); }
        catch (IllegalArgumentException exception) { throw new IllegalArgumentException("jitter must be NONE or FULL.", exception); }
    }
}
