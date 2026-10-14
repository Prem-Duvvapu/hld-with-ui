package com.hld.atomicity;

import static com.hld.atomicity.AtomicityFixtures.input;
import static com.hld.atomicity.AtomicityFixtures.one;
import static com.hld.atomicity.AtomicityFixtures.step;
import static com.hld.atomicity.AtomicityInput.Action.*;
import static com.hld.atomicity.AtomicityInput.Mode.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.atomicity.AtomicityInput.Action;
import com.hld.atomicity.AtomicityInput.Step;
import com.hld.atomicity.AtomicityInput.Transaction;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class AtomicityValidationTest {
    private static AtomicityInput raw(String schema, String model, AtomicityInput.Mode mode, Integer stock,
            List<Transaction> transactions, List<Step> schedule) {
        return new AtomicityInput(schema, model, mode, stock, transactions, schedule);
    }
    private static List<Transaction> actors() { return List.of(new Transaction("a", 1)); }
    private static List<Step> program() { return List.of(step("a", BEGIN), step("a", ABORT)); }
    static Stream<Arguments> invalidInputs() {
        List<Arguments> cases = new ArrayList<>();
        cases.add(Arguments.of("null input", null));
        for (String version : Arrays.asList(null, "", "1.1")) {
            cases.add(Arguments.of("bad schema " + version, raw(version, "1.0.0", SPLIT_WRITES, 1, actors(), program())));
            cases.add(Arguments.of("bad model " + version, raw("1.0", version, SPLIT_WRITES, 1, actors(), program())));
        }
        cases.add(Arguments.of("missing mode", raw("1.0", "1.0.0", null, 1, actors(), program())));
        for (Integer stock : Arrays.asList(null, -1, 21)) {
            cases.add(Arguments.of("bad stock " + stock, raw("1.0", "1.0.0", SPLIT_WRITES, stock, actors(), program())));
        }
        cases.add(Arguments.of("null transactions", raw("1.0", "1.0.0", SPLIT_WRITES, 1, null, program())));
        cases.add(Arguments.of("empty transactions", input(SPLIT_WRITES, 1, List.of(), program())));
        cases.add(Arguments.of("too many transactions", input(SPLIT_WRITES, 1,
                List.of(new Transaction("a", 1), new Transaction("b", 1), new Transaction("c", 1), new Transaction("d", 1)), program())));
        cases.add(Arguments.of("null actor", input(SPLIT_WRITES, 1, Arrays.asList((Transaction) null), program())));
        cases.add(Arguments.of("duplicate actor", input(SPLIT_WRITES, 1, List.of(new Transaction("a", 1), new Transaction("a", 2)), program())));
        for (String id : Arrays.asList(null, "", "A", "1a", " a", "a\n", "é", "a".repeat(33))) {
            cases.add(Arguments.of("bad actor identity " + id, input(SPLIT_WRITES, 1, List.of(new Transaction(id, 1)), program())));
            cases.add(Arguments.of("bad step identity " + id, input(SPLIT_WRITES, 1, actors(), List.of(new Step(id, "a", BEGIN), step("a", ABORT)))));
            cases.add(Arguments.of("bad reference identity " + id, input(SPLIT_WRITES, 1, actors(), List.of(new Step("begin-a", id, BEGIN), step("a", ABORT)))));
        }
        for (Integer quantity : Arrays.asList(null, 0, 21)) {
            cases.add(Arguments.of("bad quantity " + quantity, input(SPLIT_WRITES, 1, List.of(new Transaction("a", quantity)), program())));
        }
        cases.add(Arguments.of("null schedule", raw("1.0", "1.0.0", SPLIT_WRITES, 1, actors(), null)));
        cases.add(Arguments.of("empty schedule", input(SPLIT_WRITES, 1, actors(), List.of())));
        cases.add(Arguments.of("short schedule", input(SPLIT_WRITES, 1, actors(), List.of(step("a", BEGIN)))));
        cases.add(Arguments.of("too long schedule", input(SPLIT_WRITES, 1, actors(), java.util.Collections.nCopies(13, step("a", BEGIN)))));
        cases.add(Arguments.of("null step", input(SPLIT_WRITES, 1, actors(), Arrays.asList(null, step("a", ABORT)))));
        cases.add(Arguments.of("null action", input(SPLIT_WRITES, 1, actors(), List.of(new Step("begin-a", "a", null), step("a", ABORT)))));
        cases.add(Arguments.of("unknown reference", input(SPLIT_WRITES, 1, actors(), List.of(step("b", BEGIN), step("a", ABORT)))));
        cases.add(Arguments.of("duplicate step", input(SPLIT_WRITES, 1, actors(), List.of(step("a", BEGIN), new Step("begin-a", "a", ABORT)))));
        cases.add(Arguments.of("actor without a program", input(SPLIT_WRITES, 1, List.of(new Transaction("a", 1), new Transaction("b", 1)), program())));
        return cases.stream();
    }
    @ParameterizedTest(name = "{0}") @MethodSource("invalidInputs")
    void malformedInputsFailBeforeExecution(String label, AtomicityInput input) {
        assertThatThrownBy(() -> AtomicityValidator.validate(input)).isInstanceOf(IllegalArgumentException.class).hasMessageNotContaining("com.hld");
        assertThatThrownBy(() -> new AtomicityAnalyzer().run(input)).isInstanceOf(IllegalArgumentException.class);
    }
    static Stream<List<Action>> illegalPrograms() {
        return Stream.of(
                List.of(ABORT, BEGIN), List.of(DECREMENT_STOCK, ABORT), List.of(RECORD_ALLOCATION, ABORT),
                List.of(COMMIT, ABORT), List.of(BEGIN, COMMIT), List.of(BEGIN, RECORD_ALLOCATION, ABORT),
                List.of(BEGIN, DECREMENT_STOCK, COMMIT), List.of(BEGIN, BEGIN, ABORT),
                List.of(BEGIN, DECREMENT_STOCK, DECREMENT_STOCK, ABORT),
                List.of(BEGIN, DECREMENT_STOCK, RECORD_ALLOCATION, RECORD_ALLOCATION, ABORT),
                List.of(BEGIN, ABORT, COMMIT), List.of(BEGIN, ABORT, DECREMENT_STOCK),
                List.of(BEGIN, DECREMENT_STOCK, RECORD_ALLOCATION, COMMIT, ABORT),
                List.of(BEGIN, DECREMENT_STOCK), List.of(BEGIN, DECREMENT_STOCK, RECORD_ALLOCATION));
    }
    @ParameterizedTest @MethodSource("illegalPrograms")
    void allInvalidLocalProgramsAreRejectedEvenIfStockWouldBeInsufficient(List<Action> actions) {
        // Unique step IDs keep phase-validation failures distinct from duplicate-identity errors.
        List<Step> schedule = new ArrayList<>();
        for (int i = 0; i < actions.size(); i++) schedule.add(new Step("s" + i, "a", actions.get(i)));
        var input = input(STAGED_VERSION_CHECK, 0, actors(), schedule);
        assertThatThrownBy(() -> new AtomicityAnalyzer().run(input)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void allFourCompleteProgramsAndIdentifierBoundaryAreAccepted() {
        for (var mode : AtomicityInput.Mode.values()) {
            for (var actions : List.of(List.of(BEGIN, ABORT), List.of(BEGIN, DECREMENT_STOCK, ABORT),
                    List.of(BEGIN, DECREMENT_STOCK, RECORD_ALLOCATION, ABORT),
                    List.of(BEGIN, DECREMENT_STOCK, RECORD_ALLOCATION, COMMIT))) {
                var valid = one(mode, 0, 20, actions.toArray(Action[]::new));
                var result = new AtomicityAnalyzer().run(valid);
                assertThat(result.outcomes()).hasSize(actions.size());
            }
        }
        String id = "a".repeat(32);
        var valid = input(SPLIT_WRITES, 20, List.of(new Transaction(id, 20)),
                List.of(new Step("b".repeat(32), id, BEGIN), new Step("c".repeat(32), id, ABORT)));
        AtomicityValidator.validate(valid);
        assertThat(new AtomicityAnalyzer().run(valid).finalState().transactions().get(0).id()).isEqualTo(id);
    }
}
