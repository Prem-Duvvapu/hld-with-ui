package com.hld.atomicity;

import com.hld.atomicity.AtomicityInput.Action;
import com.hld.atomicity.AtomicityInput.Mode;
import com.hld.atomicity.AtomicityInput.Step;
import com.hld.atomicity.AtomicityInput.Transaction;
import java.util.List;

/** Canonical scenarios shared by future descriptors and authored lessons. */
public final class AtomicityPresets {
    private AtomicityPresets() {}
    public record Preset(String id, String title, String description, AtomicityInput input) {}

    public static AtomicityInput baseline() { return one(Mode.SPLIT_WRITES, 1, false, Action.ABORT); }
    public static AtomicityInput protectedBaseline() { return one(Mode.STAGED_VERSION_CHECK, 1, false, Action.ABORT); }

    public static List<Preset> all() {
        return List.of(
                new Preset("baseline", "Abort between separate writes", "What remains if stock was published but its allocation was never recorded?", baseline()),
                new Preset("protected-baseline", "Discard unpublished stock work", "Does private preparation change visible inventory before publication?", protectedBaseline()),
                new Preset("protected-commit", "Publish both pieces together", "Which single boundary makes prepared stock and allocation visible?", one(Mode.STAGED_VERSION_CHECK, 1, true, Action.COMMIT)),
                new Preset("split-commit", "A repaired final state has a history", "Can final conservation pass after an observable partial write?", one(Mode.SPLIT_WRITES, 1, true, Action.COMMIT)),
                new Preset("split-abort-after-record", "An aborted actor still has effects", "Can conservation pass while an aborted transaction's writes remain?", one(Mode.SPLIT_WRITES, 1, true, Action.ABORT)),
                new Preset("empty-stock", "Blocked work completes with an abort", "How does a valid program report insufficient stock and its skipped allocation?", one(Mode.STAGED_VERSION_CHECK, 0, true, Action.COMMIT)),
                new Preset("protected-conflict", "Two private proposals share one base", "Can both proposals publish after the first changes the visible revision?", conflict(1)),
                new Preset("conservative-conflict", "A revision conflict despite enough stock", "Why can coarse validation discard work whose quantity still fits?", conflict(3)));
    }

    private static AtomicityInput one(Mode mode, int initial, boolean record, Action terminal) {
        List<Step> schedule = record
                ? List.of(step("a", Action.BEGIN), step("a", Action.DECREMENT_STOCK), step("a", Action.RECORD_ALLOCATION), step("a", terminal))
                : List.of(step("a", Action.BEGIN), step("a", Action.DECREMENT_STOCK), step("a", terminal));
        return input(mode, initial, List.of(new Transaction("a", 1)), schedule);
    }

    private static AtomicityInput conflict(int initial) {
        return input(Mode.STAGED_VERSION_CHECK, initial, List.of(new Transaction("a", 1), new Transaction("b", 1)),
                List.of(step("a", Action.BEGIN), step("b", Action.BEGIN),
                        step("a", Action.DECREMENT_STOCK), step("b", Action.DECREMENT_STOCK),
                        step("a", Action.RECORD_ALLOCATION), step("b", Action.RECORD_ALLOCATION),
                        step("a", Action.COMMIT), step("b", Action.COMMIT)));
    }

    private static AtomicityInput input(Mode mode, int initial, List<Transaction> transactions, List<Step> schedule) {
        return new AtomicityInput(AtomicityInput.SCHEMA_VERSION, AtomicityInput.MODEL_VERSION, mode, initial, transactions, schedule);
    }
    private static Step step(String actor, Action action) {
        String prefix = switch (action) {
            case BEGIN -> "begin";
            case DECREMENT_STOCK -> "decrement";
            case RECORD_ALLOCATION -> "record";
            case COMMIT -> "commit";
            case ABORT -> "abort";
        };
        return new Step(prefix + "-" + actor, actor, action);
    }
}
