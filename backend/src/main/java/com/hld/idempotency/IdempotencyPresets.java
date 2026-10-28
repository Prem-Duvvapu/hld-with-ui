package com.hld.idempotency;

import com.hld.idempotency.IdempotencyInput.Action;
import com.hld.idempotency.IdempotencyInput.Call;
import com.hld.idempotency.IdempotencyInput.Mode;
import com.hld.idempotency.IdempotencyInput.Step;
import java.util.ArrayList;
import java.util.List;

/** Original tiny scenarios. Programs can be compared by changing only their protection mode. */
public final class IdempotencyPresets {
    private IdempotencyPresets() {}

    public record Preset(String id, String title, String question, IdempotencyInput input) {}

    public static IdempotencyInput baseline() { return responseLoss(Mode.NO_DEDUP); }

    public static List<Preset> all() {
        return List.of(
                new Preset("unprotected-response-loss", "A lost response leaves the write uncertain",
                        "If the first response is lost, does retrying with the same key prevent another write by itself?",
                        baseline()),
                new Preset("split-crash-gap", "The effect outlives its crashed handler",
                        "What can a retry find if the first handler stops after writing but before saving its result?",
                        splitCrash()),
                new Preset("split-race", "A unique key cannot undo two earlier writes",
                        "Can both callers publish an effect before only one retained result wins?",
                        race(Mode.SPLIT_EFFECT_RECORD, false)),
                new Preset("atomic-response-loss", "Replay the first result after response loss",
                        "Which original receipt should the retry receive when the effect and result were published together?",
                        responseLoss(Mode.ATOMIC_EFFECT_RECORD)),
                new Preset("atomic-race", "Recheck the key at the publication boundary",
                        "Both calls saw a missing key; can the second still reuse the first result without another effect?",
                        race(Mode.ATOMIC_EFFECT_RECORD, false)),
                new Preset("payload-conflict", "The same key arrives with different work",
                        "Should a retained key permit different units or preserve the original result?",
                        payloadConflict()),
                new Preset("atomic-payload-race", "A changed payload loses the atomic recheck",
                        "What happens when both calls saw a missing key but prepared different units?",
                        race(Mode.ATOMIC_EFFECT_RECORD, true)),
                new Preset("retention-boundary", "A key protects retries for a bounded interval",
                        "How do retries just before expiry and exactly at expiry change effects and receipts?",
                        retentionBoundary()),
                new Preset("key-and-tenant-scope", "Keys and tenant scope define the lookup boundary",
                        "What changes when the same intended operation gets a fresh key or another tenant uses the original key?",
                        scope()));
    }

    private static IdempotencyInput responseLoss(Mode mode) {
        List<Step> steps = new ArrayList<>();
        full(steps, "a", 0, Action.LOSE_RESPONSE);
        full(steps, "b", 10, Action.RESPOND);
        return input(mode, List.of(call("a"), call("b")), steps);
    }

    private static IdempotencyInput splitCrash() {
        List<Step> steps = new ArrayList<>();
        steps.add(step("a", 0, Action.LOOKUP));
        steps.add(step("a", 0, Action.WRITE_EFFECT));
        steps.add(step("a", 0, Action.CRASH_HANDLER));
        full(steps, "b", 10, Action.RESPOND);
        return input(Mode.SPLIT_EFFECT_RECORD, List.of(call("a"), call("b")), steps);
    }

    private static IdempotencyInput race(Mode mode, boolean differentPayload) {
        List<Call> calls = differentPayload
                ? List.of(new Call("a", "op-one", "t", "k", 1), new Call("b", "op-two", "t", "k", 2))
                : List.of(call("a"), call("b"));
        List<Step> steps = new ArrayList<>();
        for (Action action : List.of(Action.LOOKUP, Action.WRITE_EFFECT, Action.SAVE_RESULT)) {
            steps.add(step("a", 0, action));
            steps.add(step("b", 0, action));
        }
        steps.add(step("a", 1, Action.RESPOND));
        steps.add(step("b", 1, Action.RESPOND));
        return input(mode, calls, steps);
    }

    private static IdempotencyInput payloadConflict() {
        List<Step> steps = new ArrayList<>();
        full(steps, "a", 0, Action.RESPOND);
        full(steps, "b", 10, Action.RESPOND);
        return input(Mode.ATOMIC_EFFECT_RECORD,
                List.of(new Call("a", "op-one", "t", "k", 1), new Call("b", "op-two", "t", "k", 2)), steps);
    }

    private static IdempotencyInput retentionBoundary() {
        List<Step> steps = new ArrayList<>();
        full(steps, "a", 0, Action.RESPOND);
        full(steps, "b", 99, Action.RESPOND);
        full(steps, "c", 100, Action.RESPOND);
        return input(Mode.ATOMIC_EFFECT_RECORD, List.of(call("a"), call("b"), call("c")), steps);
    }

    private static IdempotencyInput scope() {
        List<Step> steps = new ArrayList<>();
        full(steps, "a", 0, Action.RESPOND);
        full(steps, "b", 10, Action.RESPOND);
        full(steps, "c", 20, Action.RESPOND);
        return input(Mode.ATOMIC_EFFECT_RECORD,
                List.of(call("a"), new Call("b", "op", "t", "new", 1),
                        new Call("c", "op", "other", "k", 1)), steps);
    }

    private static Call call(String id) { return new Call(id, "op", "t", "k", 1); }

    private static IdempotencyInput input(Mode mode, List<Call> calls, List<Step> steps) {
        return new IdempotencyInput(IdempotencyInput.SCHEMA_VERSION, IdempotencyInput.MODEL_VERSION,
                mode, 100, calls, steps);
    }

    private static void full(List<Step> steps, String call, int time, Action terminal) {
        for (Action action : List.of(Action.LOOKUP, Action.WRITE_EFFECT, Action.SAVE_RESULT, terminal))
            steps.add(step(call, time, action));
    }

    private static Step step(String call, int time, Action action) {
        String prefix = switch (action) {
            case LOOKUP -> "lookup";
            case WRITE_EFFECT -> "write";
            case SAVE_RESULT -> "save";
            case RESPOND -> "respond";
            case LOSE_RESPONSE -> "lost";
            case CRASH_HANDLER -> "crash";
        };
        return new Step(prefix + "-" + call, call, time, action);
    }
}
