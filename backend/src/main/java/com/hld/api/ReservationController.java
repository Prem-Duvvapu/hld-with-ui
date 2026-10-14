package com.hld.api;

import com.hld.transactions.ReservationAnalyzer;
import com.hld.transactions.ReservationDescriptor;
import com.hld.transactions.ReservationInput;
import com.hld.transactions.ReservationInput.Action;
import com.hld.transactions.ReservationInput.Reservation;
import com.hld.transactions.ReservationInput.Step;
import com.hld.transactions.ReservationInput.Strategy;
import com.hld.transactions.ReservationLimits;
import com.hld.transactions.ReservationPresets;
import com.hld.transactions.ReservationValidator;
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

/** Strict transport parsing and resource bounds, without reservation behavior in the controller. */
@RestController
@RequestMapping("/api/v1/simulations/transactions-isolation")
public class ReservationController {
    private static final Set<String> INPUT_FIELDS = Set.of(
            "schemaVersion", "modelVersion", "strategy", "initialUnits", "reservations", "schedule");
    private static final Set<String> RESERVATION_FIELDS = Set.of("id", "quantity");
    private static final Set<String> STEP_FIELDS = Set.of("id", "reservationId", "action");
    private final ReservationAnalyzer analyzer;
    private final SimulationResponses responses;
    private final ObjectReader reader;

    public ReservationController(ReservationAnalyzer analyzer, SimulationResponses responses, ObjectMapper mapper) {
        this.analyzer = analyzer;
        this.responses = responses;
        this.reader = mapper.readerFor(JsonNode.class)
                .with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }

    @GetMapping
    public ReservationDescriptor descriptor() {
        return new ReservationDescriptor(
                ReservationAnalyzer.SIMULATION_ID,
                "Transactions & Isolation",
                "simulation",
                ReservationInput.MODEL_VERSION,
                "A bounded reservation interleaving comparing saved observations with an atomic current-stock decision. No database engine or elapsed time is modeled.",
                ReservationLimits.CURRENT,
                ReservationPresets.all(),
                ReservationAnalyzer.ASSUMPTIONS);
    }

    @PostMapping("/runs")
    public ResponseEntity<byte[]> run(@RequestBody byte[] body) {
        return responses.json(analyzer.run(readInput(body)));
    }

    private ReservationInput readInput(byte[] body) {
        try {
            JsonNode json = reader.readValue(body);
            exactFields(json, INPUT_FIELDS, "input");
            List<Reservation> reservations = new ArrayList<>();
            for (JsonNode reservation : array(json, "reservations", ReservationInput.MIN_RESERVATIONS, ReservationInput.MAX_RESERVATIONS)) {
                exactFields(reservation, RESERVATION_FIELDS, "reservation");
                reservations.add(new Reservation(text(reservation, "id"), integer(reservation, "quantity")));
            }
            List<Step> schedule = new ArrayList<>();
            for (JsonNode step : array(json, "schedule", ReservationInput.MIN_RESERVATIONS * 2, ReservationInput.MAX_STEPS)) {
                exactFields(step, STEP_FIELDS, "schedule step");
                schedule.add(new Step(text(step, "id"), text(step, "reservationId"), action(text(step, "action"))));
            }
            ReservationInput input = new ReservationInput(
                    text(json, "schemaVersion"), text(json, "modelVersion"), strategy(text(json, "strategy")),
                    integer(json, "initialUnits"), reservations, schedule);
            ReservationValidator.validate(input);
            return input;
        } catch (JacksonException exception) {
            throw new IllegalArgumentException("The request must contain one valid reservation-input JSON object.", exception);
        }
    }

    private static Strategy strategy(String value) {
        try {
            return Strategy.valueOf(value);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("strategy must be STALE_READ_WRITE or ATOMIC_CONDITIONAL_RESERVATION.", exception);
        }
    }

    private static Action action(String value) {
        try {
            return Action.valueOf(value);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("action must be READ or ATTEMPT_RESERVE.", exception);
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
