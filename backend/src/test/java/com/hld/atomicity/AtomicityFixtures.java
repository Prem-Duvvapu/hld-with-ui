package com.hld.atomicity;

import com.hld.atomicity.AtomicityInput.Action;
import com.hld.atomicity.AtomicityInput.Mode;
import com.hld.atomicity.AtomicityInput.Step;
import com.hld.atomicity.AtomicityInput.Transaction;
import java.util.Arrays;
import java.util.List;

final class AtomicityFixtures {
    private AtomicityFixtures() {}
    static AtomicityInput input(Mode mode, int stock, List<Transaction> transactions, List<Step> schedule) {
        return new AtomicityInput("1.0", "1.0.0", mode, stock, transactions, schedule);
    }
    static AtomicityInput one(Mode mode, int stock, int quantity, Action... actions) {
        return input(mode, stock, List.of(new Transaction("a", quantity)),
                Arrays.stream(actions).map(action -> step("a", action)).toList());
    }
    static Step step(String id, Action action) {
        String prefix = switch (action) {
            case BEGIN -> "begin";
            case DECREMENT_STOCK -> "decrement";
            case RECORD_ALLOCATION -> "record";
            case COMMIT -> "commit";
            case ABORT -> "abort";
        };
        return new Step(prefix + "-" + id, id, action);
    }
    static AtomicityInput preset(String id) {
        return AtomicityPresets.all().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow().input();
    }
    static AtomicityResult.TransactionState actor(AtomicityResult.State state, String id) {
        return state.transactions().stream().filter(actor -> actor.id().equals(id)).findFirst().orElseThrow();
    }
}
