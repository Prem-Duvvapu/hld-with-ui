package com.hld.transactions;

import com.hld.transactions.ReservationInput.Action;
import com.hld.transactions.ReservationInput.Strategy;
import com.hld.transactions.ReservationResult.Allocation;
import com.hld.transactions.ReservationResult.CheckSource;
import com.hld.transactions.ReservationResult.InvariantStatus;
import com.hld.transactions.ReservationResult.Invariants;
import com.hld.transactions.ReservationResult.Kind;
import com.hld.transactions.ReservationResult.Metrics;
import com.hld.transactions.ReservationResult.Outcome;
import com.hld.transactions.ReservationResult.RejectionReason;
import com.hld.transactions.ReservationResult.ReservationState;
import com.hld.transactions.ReservationResult.State;
import com.hld.transactions.ReservationResult.Status;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Pure finite interleaving: the supplied schedule is the only source of execution order. */
public class ReservationAnalyzer {
    public static final String SIMULATION_ID = "transactions-isolation";
    public static final List<String> ASSUMPTIONS = List.of(
            "This is an illustrative reservation interleaving, not a database engine or an isolation-level emulator.",
            "Schedule order is explicit. No elapsed time, random choice or actual thread scheduling is modeled.",
            "Each distinct reservation reads once and attempts once; this model does not deduplicate retried business requests.",
            "The stale strategy checks its saved observation and assigns remaining stock from that observation.",
            "The conditional strategy checks current stock and changes stock plus its allocation in one indivisible modeled action.",
            "Accepted allocations are local model state, not a durable database commit, payment or external effect.",
            "A rejection changes the reservation status but leaves stock and allocations unchanged.",
            "Capacity, nonnegative remaining stock and conservation are separate Java-reported checks at every observed prefix.",
            "Completed means the schedule was evaluated; it can include rejected reservations or an intentional invariant violation.",
            "Lock waiting, versions, rollback, crashes, retries, replicas and multiple-resource transactions are excluded.");

    public ReservationResult run(ReservationInput input) {
        ReservationValidator.validate(input);
        Map<String, Actor> actors = new LinkedHashMap<>();
        for (var reservation : input.reservations()) {
            actors.put(reservation.id(), new Actor(reservation.id(), reservation.quantity()));
        }
        List<Allocation> allocations = new ArrayList<>();
        List<Outcome> outcomes = new ArrayList<>();
        int remaining = input.initialUnits();
        State initial = snapshot(remaining, input.initialUnits(), actors, allocations);
        String firstViolation = null;

        for (var step : input.schedule()) {
            Actor actor = actors.get(step.reservationId());
            int sequence = outcomes.size() + 1;
            Outcome outcome;
            if (step.action() == Action.READ) {
                actor.observedRemaining = remaining;
                actor.status = Status.READ_OBSERVED;
                State postState = snapshot(remaining, input.initialUnits(), actors, allocations);
                String explanation = actor.id + " observes " + remaining + " remaining units. "
                        + (input.strategy() == Strategy.STALE_READ_WRITE
                                ? "Its later attempt will check this saved value."
                                : "This is a preview; its later attempt will check current shared stock.")
                        + " The read changes only its observation and status, not stock or allocations.";
                outcome = new Outcome(sequence, step.id(), actor.id, step.action(), Kind.READ_OBSERVED,
                        postState, explanation, remaining, null, null, null, null);
            } else {
                CheckSource source = input.strategy() == Strategy.STALE_READ_WRITE ? CheckSource.SNAPSHOT : CheckSource.CURRENT;
                int checked = source == CheckSource.SNAPSHOT ? actor.observedRemaining : remaining;
                int previousRemaining = remaining;
                boolean accepted = checked >= actor.quantity;
                actor.status = accepted ? Status.ACCEPTED : Status.REJECTED;
                if (accepted) {
                    // This complete action is the modeled boundary: no other scheduled step can
                    // observe a partial stock/allocation update. The check source still matters.
                    remaining = checked - actor.quantity;
                    allocations.add(new Allocation(actor.id, actor.quantity, step.id()));
                }
                State postState = snapshot(remaining, input.initialUnits(), actors, allocations);
                String explanation = attemptExplanation(actor, source, checked, previousRemaining,
                        remaining, postState.allocatedUnits(), accepted);
                outcome = new Outcome(sequence, step.id(), actor.id, step.action(),
                        accepted ? Kind.RESERVATION_ACCEPTED : Kind.RESERVATION_REJECTED,
                        postState, explanation, null, checked, source, actor.quantity,
                        accepted ? null : RejectionReason.INSUFFICIENT_STOCK);
            }
            outcomes.add(outcome);
            if (firstViolation == null && violates(outcome.postState().invariants())) firstViolation = step.id();
        }

        State finalState = outcomes.get(outcomes.size() - 1).postState();
        int rejected = (int) actors.values().stream().filter(actor -> actor.status == Status.REJECTED).count();
        Metrics metrics = new Metrics(allocations.size(), rejected, finalState.remainingUnits(),
                finalState.allocatedUnits(), firstViolation == null ? InvariantStatus.PRESERVED : InvariantStatus.VIOLATED,
                firstViolation);
        return new ReservationResult(SIMULATION_ID, ReservationInput.SCHEMA_VERSION,
                ReservationInput.MODEL_VERSION, "analysis", "completed", input,
                initial, outcomes, finalState, metrics, ASSUMPTIONS);
    }

    private static State snapshot(int remaining, int initialUnits, Map<String, Actor> actors, List<Allocation> allocations) {
        int allocated = allocations.stream().mapToInt(Allocation::quantity).sum();
        int accounted = remaining + allocated;
        Invariants invariants = new Invariants(remaining >= 0, allocated <= initialUnits,
                accounted == initialUnits, accounted);
        List<ReservationState> reservations = actors.values().stream()
                .map(actor -> new ReservationState(actor.id, actor.quantity, actor.status, actor.observedRemaining)).toList();
        return new State(remaining, allocated, reservations, allocations, invariants);
    }

    private static boolean violates(Invariants invariants) {
        return !invariants.remainingNonnegative() || !invariants.allocatedWithinCapacity() || !invariants.unitsConserved();
    }

    private static String attemptExplanation(Actor actor, CheckSource source, int checked,
            int before, int after, int allocated, boolean accepted) {
        String explanation = actor.id + " checks " + (source == CheckSource.SNAPSHOT ? "its saved observation " : "current shared stock ")
                + checked + " against quantity " + actor.quantity + ". ";
        if (!accepted) return explanation + "The checked value is insufficient. Its status becomes REJECTED; remaining stock stays "
                + before + " and allocations are unchanged.";
        if (source == CheckSource.SNAPSHOT) {
            return explanation + "Accepted: assign " + checked + " - " + actor.quantity + " = " + after
                    + " remaining units, replacing the previous shared value " + before
                    + ", and append its allocation. Allocated units now total " + allocated
                    + ". A saved read can miss other accepted work.";
        }
        return explanation + "Accepted: the current check, decrement " + before + " - " + actor.quantity
                + " = " + after + " and allocation append form one indivisible modeled action. Allocated units now total "
                + allocated + ". This local acceptance promises no database durability.";
    }

    private static final class Actor {
        private final String id;
        private final int quantity;
        private Status status = Status.NOT_READ;
        private Integer observedRemaining;

        private Actor(String id, int quantity) {
            this.id = id;
            this.quantity = quantity;
        }
    }
}
