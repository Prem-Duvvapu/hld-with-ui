package com.hld.transactions;

import java.util.List;

/** Complete Java evidence; accepting a reservation is local model state, not durable commit. */
public record ReservationResult(
        String simulationId,
        String schemaVersion,
        String modelVersion,
        String kind,
        String status,
        ReservationInput input,
        State initialState,
        List<Outcome> outcomes,
        State finalState,
        Metrics metrics,
        List<String> assumptions) {
    public ReservationResult {
        outcomes = List.copyOf(outcomes);
        assumptions = List.copyOf(assumptions);
    }

    public record State(
            int remainingUnits,
            int allocatedUnits,
            List<ReservationState> reservations,
            List<Allocation> allocations,
            Invariants invariants) {
        public State {
            reservations = List.copyOf(reservations);
            allocations = List.copyOf(allocations);
        }
    }

    public record ReservationState(String id, int quantity, Status status, Integer observedRemaining) {}

    public record Allocation(String reservationId, int quantity, String stepId) {}

    public record Invariants(
            boolean remainingNonnegative,
            boolean allocatedWithinCapacity,
            boolean unitsConserved,
            int accountedUnits) {}

    public record Outcome(
            int sequence,
            String stepId,
            String reservationId,
            ReservationInput.Action action,
            Kind kind,
            State postState,
            String explanation,
            Integer observedRemaining,
            Integer checkedRemaining,
            CheckSource checkSource,
            Integer quantity,
            RejectionReason rejectionReason) {}

    public record Metrics(
            int acceptedReservations,
            int rejectedReservations,
            int finalRemainingUnits,
            int finalAllocatedUnits,
            InvariantStatus invariantStatus,
            String firstViolationStepId) {}

    public enum Status { NOT_READ, READ_OBSERVED, ACCEPTED, REJECTED }
    public enum Kind { READ_OBSERVED, RESERVATION_ACCEPTED, RESERVATION_REJECTED }
    public enum CheckSource { SNAPSHOT, CURRENT }
    public enum RejectionReason { INSUFFICIENT_STOCK }
    public enum InvariantStatus { PRESERVED, VIOLATED }
}
