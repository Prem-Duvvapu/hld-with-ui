package com.hld.atomicity;

import static com.hld.atomicity.AtomicityFixtures.input;
import static com.hld.atomicity.AtomicityFixtures.preset;
import static com.hld.atomicity.AtomicityFixtures.step;
import static com.hld.atomicity.AtomicityInput.Action.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.atomicity.AtomicityInput.Mode;
import com.hld.atomicity.AtomicityInput.Step;
import com.hld.atomicity.AtomicityInput.Transaction;
import com.hld.atomicity.AtomicityResult.InvariantStatus;
import com.hld.atomicity.AtomicityResult.Phase;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class AtomicityOwnershipTest {
    @Test void inputSnapshotsAndEveryReturnedCollectionOwnTheirContents() {
        List<Transaction> transactions = new ArrayList<>(List.of(new Transaction("a", 1)));
        List<Step> schedule = new ArrayList<>(List.of(step("a", BEGIN), step("a", DECREMENT_STOCK), step("a", RECORD_ALLOCATION), step("a", COMMIT)));
        var input = input(Mode.STAGED_VERSION_CHECK, 1, transactions, schedule);
        var result = new AtomicityAnalyzer().run(input);
        transactions.clear();
        schedule.clear();
        assertThat(input.transactions()).hasSize(1);
        assertThat(input.schedule()).hasSize(4);
        assertThatThrownBy(() -> input.transactions().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> input.schedule().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> result.outcomes().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> result.assumptions().clear()).isInstanceOf(UnsupportedOperationException.class);
        List<AtomicityResult.State> states = new ArrayList<>();
        states.add(result.initialState());
        result.outcomes().forEach(outcome -> states.add(outcome.postState()));
        for (var state : states) {
            assertThatThrownBy(() -> state.transactions().clear()).isInstanceOf(UnsupportedOperationException.class);
            assertThatThrownBy(() -> state.allocations().clear()).isInstanceOf(UnsupportedOperationException.class);
        }
        assertThat(result.initialState().transactions().get(0).phase()).isEqualTo(Phase.NOT_STARTED);
        assertThat(result.outcomes().get(2).postState().transactions().get(0).pendingAllocation()).isNotNull();
        assertThat(result.outcomes().get(2).postState().allocations()).isEmpty();
        assertThat(result.finalState().transactions().get(0).pendingAllocation()).isNull();
        assertThat(result.finalState().allocations()).hasSize(1);
    }

    @Test void sameAnalyzerReplaysAllInputsWithoutRetainingPreviousState() {
        var analyzer = new AtomicityAnalyzer();
        for (var preset : AtomicityPresets.all()) {
            var expected = new AtomicityAnalyzer().run(preset.input());
            assertThat(analyzer.run(preset.input())).isEqualTo(expected);
            analyzer.run(AtomicityPresets.baseline());
            assertThat(analyzer.run(preset.input())).isEqualTo(expected);
        }
    }

    @Test void concurrentCallsToOneAnalyzerHaveIndependentStateAndExactReplay() throws Exception {
        var analyzer = new AtomicityAnalyzer();
        var presets = AtomicityPresets.all();
        List<AtomicityResult> expected = presets.stream().map(p -> analyzer.run(p.input())).toList();
        var executor = Executors.newFixedThreadPool(6);
        try {
            List<Callable<AtomicityResult>> calls = new ArrayList<>();
            for (int i = 0; i < 24; i++) {
                var input = presets.get(i % presets.size()).input();
                calls.add(() -> analyzer.run(input));
            }
            var results = executor.invokeAll(calls);
            for (int i = 0; i < results.size(); i++) assertThat(results.get(i).get()).isEqualTo(expected.get(i % expected.size()));
        } finally {
            executor.shutdownNow();
        }
        assertThat(analyzer.run(preset("protected-conflict"))).isEqualTo(expected.get(6));
    }

    @ParameterizedTest @EnumSource(Mode.class)
    void maximumTwelveStepProgramReconcilesAllThreeActorsAndRevisionBound(Mode mode) {
        var transactions = List.of(new Transaction("a", 7), new Transaction("b", 6), new Transaction("c", 7));
        List<Step> schedule = new ArrayList<>();
        for (var transaction : transactions) {
            schedule.add(step(transaction.id(), BEGIN));
            schedule.add(step(transaction.id(), DECREMENT_STOCK));
            schedule.add(step(transaction.id(), RECORD_ALLOCATION));
            schedule.add(step(transaction.id(), COMMIT));
        }
        var result = new AtomicityAnalyzer().run(input(mode, 20, transactions, schedule));
        assertThat(result.outcomes()).hasSize(12);
        assertThat(result.finalState().transactions()).hasSize(3).allSatisfy(actor -> assertThat(actor.phase()).isEqualTo(Phase.COMMITTED));
        assertThat(result.finalState().allocations()).extracting(AtomicityResult.Allocation::transactionId).containsExactly("a", "b", "c");
        assertThat(result.finalState().remainingUnits()).isZero();
        assertThat(result.finalState().allocatedUnits()).isEqualTo(20);
        assertThat(result.finalState().revision()).isEqualTo(mode == Mode.SPLIT_WRITES ? 6 : 3);
        assertThat(result.metrics().committedTransactions()).isEqualTo(3);
        assertThat(result.metrics().invariantStatus()).isEqualTo(mode == Mode.SPLIT_WRITES ? InvariantStatus.VIOLATED : InvariantStatus.PRESERVED);
        assertThat(result.metrics().firstViolationStepId()).isEqualTo(mode == Mode.SPLIT_WRITES ? "decrement-a" : null);
    }
}
