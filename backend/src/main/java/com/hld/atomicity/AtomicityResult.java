package com.hld.atomicity;

import java.util.List;

/** Complete local evidence; COMMITTED is an illustrative publication, not durable storage. */
public record AtomicityResult(String simulationId, String schemaVersion, String modelVersion,
        String kind, String status, AtomicityInput input, State initialState,
        List<Outcome> outcomes, State finalState, Metrics metrics, List<String> assumptions) {
    public AtomicityResult {
        outcomes = List.copyOf(outcomes);
        assumptions = List.copyOf(assumptions);
    }

    public record State(int remainingUnits, int allocatedUnits, int revision,
            List<TransactionState> transactions, List<Allocation> allocations, Invariants invariants) {
        public State {
            transactions = List.copyOf(transactions);
            allocations = List.copyOf(allocations);
        }
    }

    public record TransactionState(String id, int quantity, Phase phase,
            int appliedStockUnits, int pendingStockUnits, Integer baseRemaining,
            Integer baseRevision, Integer workingRemaining, PendingAllocation pendingAllocation,
            Reason failureReason) {}

    public record PendingAllocation(String transactionId, int quantity, String stepId) {}
    public record Allocation(String transactionId, int quantity, String preparedAtStepId,
            String publishedAtStepId) {}
    public record Invariants(boolean remainingNonnegative, boolean allocatedWithinCapacity,
            boolean unitsConserved, boolean abortedEffectsAbsent, int accountedUnits) {}
    public record Outcome(int sequence, String stepId, String transactionId,
            AtomicityInput.Action action, Kind kind, State postState, String explanation,
            Integer checkedRemaining, CheckSource checkSource, Integer expectedRevision,
            Integer actualRevision, Reason reason) {}
    public record Metrics(int committedTransactions, int abortedTransactions,
            int conflictedTransactions, int abortedTransactionsWithEffects,
            int finalRemainingUnits, int finalAllocatedUnits, InvariantStatus invariantStatus,
            String firstViolationStepId) {}

    public enum Phase { NOT_STARTED, OPEN, BLOCKED, COMMITTED, ABORTED }
    public enum Reason { INSUFFICIENT_STOCK, USER_ABORT, REVISION_CONFLICT }
    public enum CheckSource { CURRENT, WORKING_COPY }
    public enum Kind {
        TRANSACTION_STARTED, STOCK_APPLIED, STOCK_STAGED, STOCK_REJECTED,
        ALLOCATION_APPLIED, ALLOCATION_STAGED, WORK_SKIPPED,
        TRANSACTION_COMMITTED, TRANSACTION_ABORTED
    }
    public enum InvariantStatus { PRESERVED, VIOLATED }
}
