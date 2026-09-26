package com.hld.simulation.engine;

import com.hld.simulation.SimulationEvent;

/**
 * Execution context for a single simulation run. Supplies budget tracking,
 * bounded event emission, seeded random number generators, and a cooperative
 * wall-time deadline.
 * <p>
 * Models receive this context and use it to emit events, obtain randomness,
 * and check budgets. The context is <em>not</em> a Spring bean; it is a plain
 * Java object created per request so models remain testable without Spring.
 * <p>
 * Two separate {@link SeededRandom} instances are provided: one for workload
 * decisions (arrival jitter, service-time variation) and one for failure
 * decisions. This separation lets a comparison retain the same workload
 * while varying failure randomness.
 */
public final class SimulationContext {
    private final SimulationBudget budget;
    private final EventEmitter emitter;
    private final SeededRandom workloadRandom;
    private final SeededRandom failureRandom;
    private final long wallStartNanos;

    /**
     * Creates a context with the given budget and seed values.
     *
     * @param budget       runtime budget limits
     * @param workloadSeed seed for workload randomness
     * @param failureSeed  seed for failure randomness
     */
    public SimulationContext(SimulationBudget budget, long workloadSeed, long failureSeed) {
        this.budget = budget;
        this.emitter = new EventEmitter(budget.maxEvents(), budget.maxTraceBytes());
        this.workloadRandom = new SeededRandom(workloadSeed);
        this.failureRandom = new SeededRandom(failureSeed);
        this.wallStartNanos = System.nanoTime();
    }

    /** Returns the runtime budget for this run. */
    public SimulationBudget budget() {
        return budget;
    }

    /** Returns the bounded event emitter for this run. */
    public EventEmitter emitter() {
        return emitter;
    }

    /** Returns the workload PRNG (arrivals, service times). */
    public SeededRandom workloadRandom() {
        return workloadRandom;
    }

    /** Returns the failure PRNG (failure schedules, error injection). */
    public SeededRandom failureRandom() {
        return failureRandom;
    }

    /**
     * Emits a simulation event through the bounded emitter. Returns
     * {@code true} if the event was accepted.
     */
    public boolean emit(SimulationEvent event) {
        return emitter.emit(event);
    }

    /**
     * Returns {@code true} if the given virtual time exceeds the budget.
     */
    public boolean virtualTimeExceeded(long virtualTimeMs) {
        return virtualTimeMs > budget.maxVirtualTimeMs();
    }

    /**
     * Returns {@code true} if any emission budget has been reached.
     */
    public boolean isExhausted() {
        return emitter.isExhausted();
    }

    /**
     * Checks the wall-time deadline cooperatively. Call this at natural
     * scheduling points (e.g. between requests or event batches).
     *
     * @throws BudgetExceededException if the wall-time deadline has passed
     */
    public void checkDeadline() throws BudgetExceededException {
        if (budget.wallDeadlineMs() <= 0) return;
        long elapsed = (System.nanoTime() - wallStartNanos) / 1_000_000;
        if (elapsed > budget.wallDeadlineMs()) {
            throw new BudgetExceededException("wall_time_limit",
                    "Simulation exceeded the wall-time deadline of " + budget.wallDeadlineMs() + " ms.");
        }
    }

    /**
     * Returns the truncation reason from the emitter, or {@code null}
     * if no budget was reached.
     */
    public String truncationReason() {
        return emitter.truncationReason();
    }
}
