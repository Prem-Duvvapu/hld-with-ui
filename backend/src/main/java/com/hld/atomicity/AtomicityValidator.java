package com.hld.atomicity;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** Validate all complete local programs before any modeled effect is applied. */
public final class AtomicityValidator {
    private static final Pattern ID = Pattern.compile(AtomicityInput.ID_PATTERN);
    private AtomicityValidator() {}

    public static void validate(AtomicityInput input) {
        require(input != null, "input is required");
        require(AtomicityInput.SCHEMA_VERSION.equals(input.schemaVersion()), "schemaVersion must be 1.0");
        require(AtomicityInput.MODEL_VERSION.equals(input.modelVersion()), "modelVersion must be 1.0.0");
        require(input.mode() != null, "mode is required");
        range(input.initialUnits(), 0, AtomicityInput.MAX_INITIAL_UNITS, "initialUnits");
        size(input.transactions(), AtomicityInput.MIN_TRANSACTIONS, AtomicityInput.MAX_TRANSACTIONS, "transactions");
        size(input.schedule(), AtomicityInput.MIN_STEPS, AtomicityInput.MAX_STEPS, "schedule");
        Map<String, ProgramPhase> phases = new HashMap<>();
        for (var transaction : input.transactions()) {
            require(transaction != null, "transactions must not contain null");
            identity(transaction.id(), "transaction ID");
            range(transaction.quantity(), 1, AtomicityInput.MAX_QUANTITY, "transaction quantity");
            require(phases.putIfAbsent(transaction.id(), ProgramPhase.NOT_STARTED) == null,
                    "transaction IDs must be unique");
        }
        Set<String> stepIds = new HashSet<>();
        for (var step : input.schedule()) {
            require(step != null, "schedule must not contain null");
            identity(step.id(), "step ID");
            identity(step.transactionId(), "step transactionId");
            require(stepIds.add(step.id()), "step IDs must be unique");
            require(step.action() != null, "step action is required");
            ProgramPhase phase = phases.get(step.transactionId());
            require(phase != null, "step transactionId must name a configured transaction");
            ProgramPhase next = switch (step.action()) {
                case BEGIN -> {
                    require(phase == ProgramPhase.NOT_STARTED, "each transaction must BEGIN exactly once");
                    yield ProgramPhase.BEGUN;
                }
                case DECREMENT_STOCK -> {
                    require(phase == ProgramPhase.BEGUN, "DECREMENT_STOCK must follow BEGIN exactly once");
                    yield ProgramPhase.STOCK;
                }
                case RECORD_ALLOCATION -> {
                    require(phase == ProgramPhase.STOCK, "RECORD_ALLOCATION must follow DECREMENT_STOCK exactly once");
                    yield ProgramPhase.ALLOCATION;
                }
                case COMMIT -> {
                    require(phase == ProgramPhase.ALLOCATION, "COMMIT must follow both write commands");
                    yield ProgramPhase.TERMINAL;
                }
                case ABORT -> {
                    require(phase == ProgramPhase.BEGUN || phase == ProgramPhase.STOCK || phase == ProgramPhase.ALLOCATION,
                            "ABORT must follow BEGIN and precede any terminal command");
                    yield ProgramPhase.TERMINAL;
                }
            };
            phases.put(step.transactionId(), next);
        }
        require(phases.values().stream().allMatch(phase -> phase == ProgramPhase.TERMINAL),
                "every transaction must finish a complete program with COMMIT or ABORT");
    }

    private static void identity(String value, String label) {
        require(value != null && value.length() <= AtomicityInput.MAX_ID_LENGTH && ID.matcher(value).matches(),
                label + " must contain 1–" + AtomicityInput.MAX_ID_LENGTH
                        + " lowercase ASCII letters, digits or hyphens and start with a letter");
    }
    private static void range(Integer value, int minimum, int maximum, String label) {
        require(value != null && value >= minimum && value <= maximum,
                label + " must be an integer from " + minimum + " to " + maximum);
    }
    private static void size(List<?> values, int minimum, int maximum, String label) {
        require(values != null && values.size() >= minimum && values.size() <= maximum,
                label + " must contain " + minimum + "–" + maximum + " entries");
    }
    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalArgumentException(message);
    }
    private enum ProgramPhase { NOT_STARTED, BEGUN, STOCK, ALLOCATION, TERMINAL }
}
