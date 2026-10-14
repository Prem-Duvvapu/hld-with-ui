package com.hld.atomicity;

/** Public bounds derived from the unchanged finite model. */
public record AtomicityLimits(int maxInitialUnits, int minTransactions, int maxTransactions,
        int maxQuantity, int minSteps, int maxSteps, int maxIdLength) {
    public static final AtomicityLimits CURRENT = new AtomicityLimits(
            AtomicityInput.MAX_INITIAL_UNITS, AtomicityInput.MIN_TRANSACTIONS,
            AtomicityInput.MAX_TRANSACTIONS, AtomicityInput.MAX_QUANTITY,
            AtomicityInput.MIN_STEPS, AtomicityInput.MAX_STEPS, AtomicityInput.MAX_ID_LENGTH);
}
