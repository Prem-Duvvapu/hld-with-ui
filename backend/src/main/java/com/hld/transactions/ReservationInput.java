package com.hld.transactions;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** A complete finite interleaving; order comes from the schedule, not elapsed time. */
public record ReservationInput(
        String schemaVersion,
        String modelVersion,
        Strategy strategy,
        Integer initialUnits,
        List<Reservation> reservations,
        List<Step> schedule) {
    public static final String SCHEMA_VERSION = "1.0";
    public static final String MODEL_VERSION = "1.0.0";
    public static final String ID_PATTERN = "[a-z][a-z0-9-]{0,31}";
    public static final int MAX_INITIAL_UNITS = 20;
    public static final int MIN_RESERVATIONS = 2;
    public static final int MAX_RESERVATIONS = 4;
    public static final int MAX_QUANTITY = 20;
    public static final int MAX_STEPS = MAX_RESERVATIONS * 2;

    public ReservationInput {
        reservations = own(reservations);
        schedule = own(schedule);
    }

    private static <T> List<T> own(List<T> values) {
        // Keep malformed null values available to direct domain validation.
        return values == null ? null : Collections.unmodifiableList(new ArrayList<>(values));
    }

    public enum Strategy {
        STALE_READ_WRITE,
        ATOMIC_CONDITIONAL_RESERVATION
    }

    public enum Action {
        READ,
        ATTEMPT_RESERVE
    }

    public record Reservation(String id, Integer quantity) {}

    public record Step(String id, String reservationId, Action action) {}
}
