package com.hld.idempotency;

import static com.hld.idempotency.IdempotencyTestInputs.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.idempotency.IdempotencyInput.Action;
import com.hld.idempotency.IdempotencyInput.Call;
import com.hld.idempotency.IdempotencyInput.Mode;
import com.hld.idempotency.IdempotencyInput.Step;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;

class IdempotencyValidationTest {
    static Stream<Arguments> malformed() {
        var cases = new ArrayList<Arguments>();
        cases.add(Arguments.of("null input", null));
        for (String version : Arrays.asList(null, "", "1.1", "2.0", "1.0\n")) {
            cases.add(Arguments.of("schema version " + version, configured(c -> c.schema = version)));
            cases.add(Arguments.of("model version " + version, configured(c -> c.model = version)));
        }
        List<Consumer<Config>> scalarAndCollectionEdits = List.of(
                c -> c.mode = null,
                c -> c.retention = null, c -> c.retention = 0, c -> c.retention = -1, c -> c.retention = 10001,
                c -> c.calls = null, c -> c.calls = List.of(), c -> c.calls = Arrays.asList((Call) null),
                c -> c.calls = List.of(call("a", "op", "t", "k", 1), call("a", "different", "other", "other", 1)),
                c -> c.schedule = null, c -> c.schedule = List.of(), c -> c.schedule = Arrays.asList((Step) null),
                c -> c.schedule = List.of(step("lookup-a", "a", 0, Action.LOOKUP)),
                c -> c.calls = List.of(call("a", "op", "t", "k", null)),
                c -> c.calls = List.of(call("a", "op", "t", "k", 0)),
                c -> c.calls = List.of(call("a", "op", "t", "k", -1)),
                c -> c.calls = List.of(call("a", "op", "t", "k", 1001)),
                c -> c.schedule = List.of(step("lookup-a", "a", null, Action.LOOKUP), step("crash-a", "a", 0, Action.CRASH_HANDLER)),
                c -> c.schedule = List.of(step("lookup-a", "a", -1, Action.LOOKUP), step("crash-a", "a", 0, Action.CRASH_HANDLER)),
                c -> c.schedule = List.of(step("lookup-a", "a", 10001, Action.LOOKUP), step("crash-a", "a", 10001, Action.CRASH_HANDLER)),
                c -> c.schedule = List.of(step("lookup-a", "a", 0, null), step("crash-a", "a", 0, Action.CRASH_HANDLER)),
                c -> c.schedule = List.of(step("same", "a", 0, Action.LOOKUP), step("same", "a", 0, Action.CRASH_HANDLER)),
                c -> c.schedule = List.of(step("lookup-a", "missing", 0, Action.LOOKUP), step("crash-a", "a", 0, Action.CRASH_HANDLER)),
                c -> c.schedule = List.of(step("lookup-a", "a", 1, Action.LOOKUP), step("crash-a", "a", 0, Action.CRASH_HANDLER)),
                c -> { c.calls = List.of(call("a", "op", "t", "k", 1), call("b", "op", "t", "fresh", 2));
                       c.schedule = joined(full("a", 0, Action.RESPOND), full("b", 1, Action.RESPOND)); },
                c -> { c.calls = List.of(call("a", "op", "t", "k", 1), call("b", "op", "t", "fresh", 1)); }
        );
        for (int i = 0; i < scalarAndCollectionEdits.size(); i++)
            cases.add(Arguments.of("scalar/collection/reference " + i, configured(scalarAndCollectionEdits.get(i))));
        var tooManyCalls = new ArrayList<Call>();
        var manyCompleteCrashes = new ArrayList<Step>();
        for (int i = 0; i < 13; i++) {
            String id = "c" + i;
            tooManyCalls.add(call(id, "op", "t", "k", 1));
            manyCompleteCrashes.add(step("lookup-" + i, id, 0, Action.LOOKUP));
            manyCompleteCrashes.add(step("crash-" + i, id, 0, Action.CRASH_HANDLER));
        }
        cases.add(Arguments.of("13 otherwise complete calls exceed count bound", configured(c -> {
            c.calls = tooManyCalls; c.schedule = manyCompleteCrashes;
        })));
        var tooManySteps = new ArrayList<>(maximum(Mode.NO_DEDUP).schedule());
        tooManySteps.add(step("extra", tooManySteps.get(0).callId(), 10000, Action.RESPOND));
        cases.add(Arguments.of("49 steps exceed count bound", configured(c -> {
            c.calls = maximum(Mode.NO_DEDUP).calls(); c.schedule = tooManySteps;
        })));
        for (String id : Arrays.asList(null, "", "A", "1a", "a b", " a", "a ", "a\n", "é", "a".repeat(33))) {
            cases.add(Arguments.of("call identity " + id, configured(c -> c.calls = List.of(call(id, "op", "t", "k", 1)))));
            cases.add(Arguments.of("operation identity " + id, configured(c -> c.calls = List.of(call("a", id, "t", "k", 1)))));
            cases.add(Arguments.of("tenant identity " + id, configured(c -> c.calls = List.of(call("a", "op", id, "k", 1)))));
            cases.add(Arguments.of("key identity " + id, configured(c -> c.calls = List.of(call("a", "op", "t", id, 1)))));
            cases.add(Arguments.of("step identity " + id, configured(c -> c.schedule = List.of(
                    step(id, "a", 0, Action.LOOKUP), step("crash-a", "a", 0, Action.CRASH_HANDLER)))));
            cases.add(Arguments.of("step call identity " + id, configured(c -> c.schedule = List.of(
                    step("lookup-a", id, 0, Action.LOOKUP), step("crash-a", "a", 0, Action.CRASH_HANDLER)))));
        }
        return cases.stream();
    }

    @ParameterizedTest(name = "{0}") @MethodSource("malformed")
    void rejectsMalformedInputsBeforeExecutingAnyLedgerOrKeyChanges(String label, IdempotencyInput input) {
        assertThatThrownBy(() -> IdempotencyValidator.validate(input)).as(label).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new IdempotencySimulator().run(input)).as(label).isInstanceOf(IllegalArgumentException.class);
    }

    static Stream<Arguments> brokenPrograms() {
        return Stream.of(
                Arguments.of("write before lookup", List.of(Action.WRITE_EFFECT, Action.LOOKUP, Action.SAVE_RESULT, Action.RESPOND)),
                Arguments.of("save before write", List.of(Action.LOOKUP, Action.SAVE_RESULT, Action.WRITE_EFFECT, Action.RESPOND)),
                Arguments.of("response before save", List.of(Action.LOOKUP, Action.WRITE_EFFECT, Action.RESPOND)),
                Arguments.of("loss before save", List.of(Action.LOOKUP, Action.WRITE_EFFECT, Action.LOSE_RESPONSE)),
                Arguments.of("crash before lookup", List.of(Action.CRASH_HANDLER, Action.LOOKUP)),
                Arguments.of("repeated lookup", List.of(Action.LOOKUP, Action.LOOKUP, Action.WRITE_EFFECT, Action.SAVE_RESULT, Action.RESPOND)),
                Arguments.of("repeated write", List.of(Action.LOOKUP, Action.WRITE_EFFECT, Action.WRITE_EFFECT, Action.SAVE_RESULT, Action.RESPOND)),
                Arguments.of("repeated save", List.of(Action.LOOKUP, Action.WRITE_EFFECT, Action.SAVE_RESULT, Action.SAVE_RESULT, Action.RESPOND)),
                Arguments.of("action after crash", List.of(Action.LOOKUP, Action.CRASH_HANDLER, Action.WRITE_EFFECT)),
                Arguments.of("action after response", List.of(Action.LOOKUP, Action.WRITE_EFFECT, Action.SAVE_RESULT, Action.RESPOND, Action.LOSE_RESPONSE)),
                Arguments.of("action after response loss", List.of(Action.LOOKUP, Action.WRITE_EFFECT, Action.SAVE_RESULT, Action.LOSE_RESPONSE, Action.RESPOND)),
                Arguments.of("unfinished write", List.of(Action.LOOKUP, Action.WRITE_EFFECT)),
                Arguments.of("unfinished ready result", List.of(Action.LOOKUP, Action.WRITE_EFFECT, Action.SAVE_RESULT)));
    }

    @ParameterizedTest(name = "{0}") @MethodSource("brokenPrograms")
    void allModesRequireTheSameCompleteProgramInsteadOfSilentlyRepairingIt(String label, List<Action> actions) {
        var schedule = new ArrayList<Step>();
        for (int i = 0; i < actions.size(); i++) schedule.add(step("step-" + i, "a", 0, actions.get(i)));
        for (Mode mode : Mode.values()) {
            var input = configured(c -> { c.mode = mode; c.schedule = schedule; });
            assertThatThrownBy(() -> IdempotencyValidator.validate(input)).as(label + " in " + mode)
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> new IdempotencySimulator().run(input)).isInstanceOf(IllegalArgumentException.class);
        }
    }

    @ParameterizedTest @EnumSource(Mode.class)
    void minimumAndMaximumBoundsAreInclusiveAndTwoStepCrashProgramsAreComplete(Mode mode) {
        var minimum = configured(c -> {
            c.mode = mode; c.retention = 1;
            c.schedule = List.of(step("lookup", "a", 0, Action.LOOKUP), step("crash", "a", 0, Action.CRASH_HANDLER));
        });
        IdempotencyValidator.validate(minimum);
        var run = new IdempotencySimulator().run(minimum);
        assertThat(run.metrics().crashedCalls()).isEqualTo(1);
        assertThat(run.metrics().publishedEffects()).isZero();
        assertThat(run.metrics().finalTimeMs()).isZero();
        IdempotencyValidator.validate(maximum(mode));
    }

    @Test void completePresetIdsAreDistinctAndAllNineDeclaredFixturesAreValid() {
        assertThat(IdempotencyPresets.all()).extracting(IdempotencyPresets.Preset::id).containsExactly(
                "unprotected-response-loss", "split-crash-gap", "split-race", "atomic-response-loss", "atomic-race",
                "payload-conflict", "atomic-payload-race", "retention-boundary", "key-and-tenant-scope");
        assertThat(IdempotencyPresets.baseline()).isEqualTo(preset("unprotected-response-loss"));
        for (var preset : IdempotencyPresets.all()) {
            IdempotencyValidator.validate(preset.input());
            assertThat(new IdempotencySimulator().run(preset.input()).status()).isEqualTo("completed");
        }
    }
}
