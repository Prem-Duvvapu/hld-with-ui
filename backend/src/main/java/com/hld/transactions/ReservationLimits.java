package com.hld.transactions;

/** Public input bounds, derived from the unchanged pure model. */
public record ReservationLimits(
        int maxInitialUnits,
        int minReservations,
        int maxReservations,
        int maxQuantity,
        int maxSteps,
        int maxIdLength) {
    public static final ReservationLimits CURRENT = new ReservationLimits(
            ReservationInput.MAX_INITIAL_UNITS,
            ReservationInput.MIN_RESERVATIONS,
            ReservationInput.MAX_RESERVATIONS,
            ReservationInput.MAX_QUANTITY,
            ReservationInput.MAX_STEPS,
            32);
}
