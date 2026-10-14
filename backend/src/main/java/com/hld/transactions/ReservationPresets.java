package com.hld.transactions;

import com.hld.transactions.ReservationInput.Action;
import com.hld.transactions.ReservationInput.Reservation;
import com.hld.transactions.ReservationInput.Step;
import com.hld.transactions.ReservationInput.Strategy;
import java.util.List;

/** Canonical finite scenarios; later descriptors must reuse these inputs rather than copy them. */
public final class ReservationPresets {
    private ReservationPresets() {}

    public record Preset(String id, String title, String description, ReservationInput input) {}

    public static ReservationInput baseline() {
        return input(Strategy.STALE_READ_WRITE, 1, 1, 1, sharedReads());
    }

    public static ReservationInput protectedBaseline() {
        return input(Strategy.ATOMIC_CONDITIONAL_RESERVATION, 1, 1, 1, sharedReads());
    }

    public static List<Preset> all() {
        return List.of(
                new Preset("unsafe-baseline", "Both read one unit", "Can two distinct reservations both accept the same observed unit?", baseline()),
                new Preset("protected-baseline", "Check current stock atomically", "Which current-state decision keeps both stock and allocation counts consistent?", protectedBaseline()),
                new Preset("serial-control", "A serial test hides the race", "Does one successful test order prove the stale algorithm safe for other interleavings?",
                        input(Strategy.STALE_READ_WRITE, 1, 1, 1, List.of(read("a"), attempt("a"), read("b"), attempt("b")))),
                new Preset("reverse-winner", "Let B attempt first", "Does the protected boundary promise which client wins?",
                        input(Strategy.ATOMIC_CONDITIONAL_RESERVATION, 1, 1, 1, List.of(read("a"), read("b"), attempt("b"), attempt("a")))),
                new Preset("conservation-gap", "Enough total stock still loses an update", "Can allocated units stay within capacity while stock and allocations fail to add up?",
                        input(Strategy.STALE_READ_WRITE, 2, 1, 1, sharedReads())),
                new Preset("empty-stock", "An empty inventory rejects work", "Is a rejected reservation different from invalid input or an unavailable model?",
                        input(Strategy.STALE_READ_WRITE, 0, 1, 1, sharedReads())),
                new Preset("unequal-quantities", "Reserve two units before one", "What does the protected check do when A consumes all available units?",
                        input(Strategy.ATOMIC_CONDITIONAL_RESERVATION, 2, 2, 1, sharedReads())),
                new Preset("stale-restoration", "A stale assignment restores stock", "Can a saved value make shared stock rise after another reservation depleted it?",
                        input(Strategy.STALE_READ_WRITE, 2, 2, 1, sharedReads())));
    }

    private static ReservationInput input(Strategy strategy, int stock, int aQuantity, int bQuantity, List<Step> schedule) {
        return new ReservationInput(ReservationInput.SCHEMA_VERSION, ReservationInput.MODEL_VERSION,
                strategy, stock, List.of(new Reservation("a", aQuantity), new Reservation("b", bQuantity)), schedule);
    }

    private static List<Step> sharedReads() { return List.of(read("a"), read("b"), attempt("a"), attempt("b")); }
    private static Step read(String id) { return new Step("read-" + id, id, Action.READ); }
    private static Step attempt(String id) { return new Step("attempt-" + id, id, Action.ATTEMPT_RESERVE); }
}
