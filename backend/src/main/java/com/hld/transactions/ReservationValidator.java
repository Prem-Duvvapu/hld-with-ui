package com.hld.transactions;

import com.hld.transactions.ReservationInput.Action;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** Validate the entire schedule before the analyzer creates any modeled transitions. */
public final class ReservationValidator {
    private static final Pattern ID = Pattern.compile(ReservationInput.ID_PATTERN);

    private ReservationValidator() {}

    public static void validate(ReservationInput input) {
        require(input != null, "input is required");
        require(ReservationInput.SCHEMA_VERSION.equals(input.schemaVersion()), "schemaVersion must be 1.0");
        require(ReservationInput.MODEL_VERSION.equals(input.modelVersion()), "modelVersion must be 1.0.0");
        require(input.strategy() != null, "strategy is required");
        range(input.initialUnits(), 0, ReservationInput.MAX_INITIAL_UNITS, "initialUnits");
        size(input.reservations(), ReservationInput.MIN_RESERVATIONS, ReservationInput.MAX_RESERVATIONS, "reservations");
        size(input.schedule(), ReservationInput.MIN_RESERVATIONS * 2, ReservationInput.MAX_STEPS, "schedule");
        require(input.schedule().size() == input.reservations().size() * 2,
                "schedule must contain exactly one READ and one ATTEMPT_RESERVE per reservation");

        Map<String, Phase> phases = new HashMap<>();
        for (var reservation : input.reservations()) {
            require(reservation != null, "reservations must not contain null");
            identity(reservation.id(), "reservation ID");
            range(reservation.quantity(), 1, ReservationInput.MAX_QUANTITY, "reservation quantity");
            require(phases.putIfAbsent(reservation.id(), Phase.NOT_READ) == null, "reservation IDs must be unique");
        }

        Set<String> stepIds = new HashSet<>();
        for (var step : input.schedule()) {
            require(step != null, "schedule must not contain null");
            identity(step.id(), "step ID");
            identity(step.reservationId(), "step reservationId");
            require(stepIds.add(step.id()), "step IDs must be unique");
            require(step.action() != null, "step action is required");
            Phase phase = phases.get(step.reservationId());
            require(phase != null, "step reservationId must name a configured reservation");
            if (step.action() == Action.READ) {
                require(phase == Phase.NOT_READ, "each reservation must READ exactly once before its attempt");
                phases.put(step.reservationId(), Phase.READ);
            } else {
                require(phase == Phase.READ, "each reservation must ATTEMPT_RESERVE exactly once after its READ");
                phases.put(step.reservationId(), Phase.ATTEMPTED);
            }
        }
        require(phases.values().stream().allMatch(phase -> phase == Phase.ATTEMPTED),
                "every reservation must have one READ and one ATTEMPT_RESERVE");
    }

    private static void identity(String value, String label) {
        require(value != null && ID.matcher(value).matches(),
                label + " must contain 1–32 lowercase ASCII letters, digits or hyphens and start with a letter");
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

    private enum Phase { NOT_READ, READ, ATTEMPTED }
}
