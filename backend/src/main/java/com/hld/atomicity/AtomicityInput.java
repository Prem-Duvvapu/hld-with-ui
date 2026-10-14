package com.hld.atomicity;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** A finite complete program; schedule position is execution order, not elapsed time. */
public record AtomicityInput(String schemaVersion, String modelVersion, Mode mode,
        Integer initialUnits, List<Transaction> transactions, List<Step> schedule) {
    public static final String SCHEMA_VERSION = "1.0";
    public static final String MODEL_VERSION = "1.0.0";
    public static final String ID_PATTERN = "[a-z][a-z0-9-]{0,31}";
    public static final int MAX_INITIAL_UNITS = 20;
    public static final int MIN_TRANSACTIONS = 1;
    public static final int MAX_TRANSACTIONS = 3;
    public static final int MAX_QUANTITY = 20;
    public static final int MAX_STEPS = MAX_TRANSACTIONS * 4;

    public AtomicityInput {
        transactions = own(transactions);
        schedule = own(schedule);
    }

    private static <T> List<T> own(List<T> values) {
        // Preserve malformed null entries so direct domain validation can reject them clearly.
        return values == null ? null : Collections.unmodifiableList(new ArrayList<>(values));
    }

    public enum Mode { SPLIT_WRITES, STAGED_VERSION_CHECK }
    public enum Action { BEGIN, DECREMENT_STOCK, RECORD_ALLOCATION, COMMIT, ABORT }
    public record Transaction(String id, Integer quantity) {}
    public record Step(String id, String transactionId, Action action) {}
}
