package com.hld.idempotency;

import com.hld.idempotency.IdempotencyInput.Action;
import com.hld.idempotency.IdempotencyInput.Call;
import com.hld.idempotency.IdempotencyInput.Mode;
import com.hld.idempotency.IdempotencyInput.Step;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/** Tiny authored programs, independent of production preset construction. */
final class IdempotencyTestInputs {
    private IdempotencyTestInputs() {}

    static final class Config {
        String schema = "1.0", model = "1.0.0";
        Mode mode = Mode.ATOMIC_EFFECT_RECORD;
        Integer retention = 100;
        List<Call> calls = List.of(call("a", "op", "t", "k", 1));
        List<Step> schedule = full("a", 0, Action.RESPOND);
        IdempotencyInput build() { return new IdempotencyInput(schema, model, mode, retention, calls, schedule); }
    }

    static IdempotencyInput configured(Consumer<Config> edit) {
        var config = new Config();
        edit.accept(config);
        return config.build();
    }

    static Call call(String id, String operation, String tenant, String key, Integer units) {
        return new Call(id, operation, tenant, key, units);
    }

    static Step step(String id, String call, Integer time, Action action) {
        return new Step(id, call, time, action);
    }

    static List<Step> full(String call, int time, Action terminal) {
        return List.of(step("lookup-" + call, call, time, Action.LOOKUP),
                step("write-" + call, call, time, Action.WRITE_EFFECT),
                step("save-" + call, call, time, Action.SAVE_RESULT),
                step("finish-" + call, call, time, terminal));
    }

    @SafeVarargs static List<Step> joined(List<Step>... programs) {
        var steps = new ArrayList<Step>();
        for (var program : programs) steps.addAll(program);
        return steps;
    }

    static IdempotencyInput preset(String id) {
        return IdempotencyPresets.all().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow().input();
    }

    static IdempotencyInput inMode(IdempotencyInput input, Mode mode) {
        return new IdempotencyInput(input.schemaVersion(), input.modelVersion(), mode,
                input.retentionMs(), input.calls(), input.schedule());
    }

    static IdempotencyInput maximum(Mode mode) {
        var calls = new ArrayList<Call>();
        var steps = new ArrayList<Step>();
        for (int i = 0; i < 12; i++) {
            String suffix = String.format("%02d", i);
            String id = "c" + "x".repeat(29) + suffix;
            calls.add(call(id, "o" + "x".repeat(29) + suffix, "t".repeat(32),
                    "k" + "x".repeat(29) + suffix, 1000));
            var actions = List.of(Action.LOOKUP, Action.WRITE_EFFECT, Action.SAVE_RESULT, Action.RESPOND);
            for (int j = 0; j < actions.size(); j++)
                steps.add(step("s" + "x".repeat(28) + suffix + j, id, 10000, actions.get(j)));
        }
        return configured(c -> { c.mode = mode; c.retention = 10000; c.calls = calls; c.schedule = steps; });
    }
}
