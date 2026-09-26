package com.hld.simulation.engine;

/**
 * Signals that a simulation run exceeded one of its declared budgets.
 * This is a checked exception so models are forced to handle the
 * boundary explicitly rather than silently producing corrupt output.
 */
public class BudgetExceededException extends Exception {
    private final String truncationReason;

    public BudgetExceededException(String truncationReason, String message) {
        super(message);
        this.truncationReason = truncationReason;
    }

    /** Machine-readable reason suitable for the result envelope. */
    public String truncationReason() {
        return truncationReason;
    }
}
