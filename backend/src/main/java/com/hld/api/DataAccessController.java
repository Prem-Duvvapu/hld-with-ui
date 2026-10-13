package com.hld.api;

import com.hld.dataaccess.DataAccessAnalyzer;
import com.hld.dataaccess.DataAccessDescriptor;
import com.hld.dataaccess.DataAccessInput;
import com.hld.dataaccess.DataAccessInput.IndexOrder;
import com.hld.dataaccess.DataAccessInput.Kind;
import com.hld.dataaccess.DataAccessInput.Operation;
import com.hld.dataaccess.DataAccessInput.Row;
import com.hld.dataaccess.DataAccessLimits;
import com.hld.dataaccess.DataAccessPresets;
import com.hld.dataaccess.DataAccessValidator;
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

@RestController
@RequestMapping("/api/v1/simulations/data-access-models")
public class DataAccessController {
    private static final Set<String> INPUT_FIELDS = Set.of("schemaVersion", "modelVersion", "indexOrder", "enforceBusinessKey", "rows", "operations");
    private static final Set<String> ROW_FIELDS = Set.of("id", "tenant", "businessKey", "createdOrder");
    private final DataAccessAnalyzer analyzer;
    private final SimulationResponses responses;
    private final ObjectReader reader;

    public DataAccessController(DataAccessAnalyzer analyzer, SimulationResponses responses, ObjectMapper mapper) {
        this.analyzer = analyzer;
        this.responses = responses;
        this.reader = mapper.readerFor(JsonNode.class).with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }

    @GetMapping public DataAccessDescriptor descriptor() {
        return new DataAccessDescriptor(DataAccessAnalyzer.SIMULATION_ID, "Data Models & Access Patterns",
                "simulation", DataAccessInput.MODEL_VERSION,
                "A finite sequential access-pattern analysis of keys, ordered indexes and scoped uniqueness; counts are logical work, not database latency.",
                DataAccessLimits.CURRENT, DataAccessPresets.all(), DataAccessAnalyzer.ASSUMPTIONS);
    }

    @PostMapping("/runs") public ResponseEntity<byte[]> run(@RequestBody byte[] body) {
        return responses.json(analyzer.run(readInput(body)));
    }

    private DataAccessInput readInput(byte[] body) {
        try {
            JsonNode json = reader.readValue(body);
            exact(json, INPUT_FIELDS, "input");
            JsonNode enforced = json.get("enforceBusinessKey");
            if (!enforced.isBoolean()) throw new IllegalArgumentException("enforceBusinessKey must be a JSON boolean.");
            List<Row> rows = new ArrayList<>();
            for (JsonNode row : array(json, "rows", 0, DataAccessInput.MAX_INITIAL_ROWS)) rows.add(row(row));
            List<Operation> operations = new ArrayList<>();
            for (JsonNode operation : array(json, "operations", 1, DataAccessInput.MAX_OPERATIONS)) {
                if (!operation.isObject() || !operation.has("kind")) throw new IllegalArgumentException("operation must declare kind.");
                Kind kind = Kind.valueOf(text(operation, "kind"));
                switch (kind) {
                    case LOOKUP_ID -> {
                        exact(operation, Set.of("id", "kind", "rowId"), "LOOKUP_ID");
                        operations.add(Operation.lookup(text(operation, "id"), text(operation, "rowId")));
                    }
                    case TENANT_RANGE -> {
                        exact(operation, Set.of("id", "kind", "tenant", "fromCreatedOrder", "toCreatedOrder", "limit"), "TENANT_RANGE");
                        operations.add(Operation.tenantRange(text(operation, "id"), text(operation, "tenant"), integer(operation, "fromCreatedOrder"), integer(operation, "toCreatedOrder"), integer(operation, "limit")));
                    }
                    case ALL_RANGE -> {
                        exact(operation, Set.of("id", "kind", "fromCreatedOrder", "toCreatedOrder", "limit"), "ALL_RANGE");
                        operations.add(Operation.allRange(text(operation, "id"), integer(operation, "fromCreatedOrder"), integer(operation, "toCreatedOrder"), integer(operation, "limit")));
                    }
                    case INSERT -> {
                        exact(operation, Set.of("id", "kind", "row"), "INSERT");
                        operations.add(Operation.insert(text(operation, "id"), row(operation.get("row"))));
                    }
                }
            }
            DataAccessInput input = new DataAccessInput(text(json, "schemaVersion"), text(json, "modelVersion"),
                    IndexOrder.valueOf(text(json, "indexOrder")), enforced.asBoolean(), rows, operations);
            DataAccessValidator.validate(input);
            return input;
        } catch (JacksonException exception) {
            throw new IllegalArgumentException("The request must contain one valid data-access-input JSON object.", exception);
        }
    }
    private static Row row(JsonNode value) {
        exact(value, ROW_FIELDS, "row");
        return new Row(text(value, "id"), text(value, "tenant"), text(value, "businessKey"), integer(value, "createdOrder"));
    }
    private static void exact(JsonNode value, Set<String> fields, String label) {
        if (value == null || !value.isObject() || !Set.copyOf(value.propertyNames()).equals(fields))
            throw new IllegalArgumentException(label + " contains missing or unknown fields.");
    }
    private static String text(JsonNode value, String field) {
        JsonNode item = value.get(field);
        if (item == null || !item.isString()) throw new IllegalArgumentException(field + " must be a string.");
        return item.asString();
    }
    private static int integer(JsonNode value, String field) {
        JsonNode item = value.get(field);
        if (item == null || !item.isIntegralNumber() || !item.canConvertToInt())
            throw new IllegalArgumentException(field + " must be an integer JSON number in range.");
        return item.asInt();
    }
    private static JsonNode array(JsonNode value, String field, int minimum, int maximum) {
        JsonNode item = value.get(field);
        if (!item.isArray() || item.size() < minimum || item.size() > maximum)
            throw new IllegalArgumentException(field + " must be an array of " + minimum + "–" + maximum + " entries.");
        return item;
    }
}
