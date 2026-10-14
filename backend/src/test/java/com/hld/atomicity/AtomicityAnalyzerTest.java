package com.hld.atomicity;

import static com.hld.atomicity.AtomicityFixtures.actor;
import static com.hld.atomicity.AtomicityFixtures.input;
import static com.hld.atomicity.AtomicityFixtures.one;
import static com.hld.atomicity.AtomicityFixtures.preset;
import static com.hld.atomicity.AtomicityFixtures.step;
import static com.hld.atomicity.AtomicityInput.Action.*;
import static com.hld.atomicity.AtomicityInput.Mode.*;
import static org.assertj.core.api.Assertions.assertThat;

import com.hld.atomicity.AtomicityInput.Mode;
import com.hld.atomicity.AtomicityInput.Transaction;
import com.hld.atomicity.AtomicityResult.Allocation;
import com.hld.atomicity.AtomicityResult.CheckSource;
import com.hld.atomicity.AtomicityResult.InvariantStatus;
import com.hld.atomicity.AtomicityResult.Invariants;
import com.hld.atomicity.AtomicityResult.Kind;
import com.hld.atomicity.AtomicityResult.Metrics;
import com.hld.atomicity.AtomicityResult.PendingAllocation;
import com.hld.atomicity.AtomicityResult.Phase;
import com.hld.atomicity.AtomicityResult.Reason;
import com.hld.atomicity.AtomicityResult.TransactionState;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;

class AtomicityAnalyzerTest {
    private final AtomicityAnalyzer analyzer = new AtomicityAnalyzer();
    record Expected(String id, int remaining, int allocated, int revision,
            int committed, int aborted, int conflicts, int leaked, boolean conserved,
            boolean abortClean, String firstViolation) {}
    static Stream<Expected> presets() {
        return Stream.of(
                new Expected("baseline", 0, 0, 1, 0, 1, 0, 1, false, false, "decrement-a"),
                new Expected("protected-baseline", 1, 0, 0, 0, 1, 0, 0, true, true, null),
                new Expected("protected-commit", 0, 1, 1, 1, 0, 0, 0, true, true, null),
                new Expected("split-commit", 0, 1, 2, 1, 0, 0, 0, true, true, "decrement-a"),
                new Expected("split-abort-after-record", 0, 1, 2, 0, 1, 0, 1, true, false, "decrement-a"),
                new Expected("empty-stock", 0, 0, 0, 0, 1, 0, 0, true, true, null),
                new Expected("protected-conflict", 0, 1, 1, 1, 1, 1, 0, true, true, null),
                new Expected("conservative-conflict", 2, 1, 1, 1, 1, 1, 0, true, true, null));
    }
    @ParameterizedTest @MethodSource("presets")
    void canonicalPresetsHaveExactPopulationsAndHistory(Expected expected) {
        var input = preset(expected.id());
        var result = analyzer.run(input);
        assertThat(result.input()).isEqualTo(input);
        assertThat(result.simulationId()).isEqualTo("transaction-atomicity");
        assertThat(result.schemaVersion()).isEqualTo("1.0");
        assertThat(result.modelVersion()).isEqualTo("1.0.0");
        assertThat(result.kind()).isEqualTo("analysis");
        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.initialState().invariants()).isEqualTo(new Invariants(true, true, true, true, input.initialUnits()));
        assertThat(result.initialState().remainingUnits()).isEqualTo(input.initialUnits());
        assertThat(result.initialState().allocatedUnits()).isZero();
        assertThat(result.initialState().revision()).isZero();
        assertThat(result.initialState().allocations()).isEmpty();
        assertThat(result.initialState().transactions()).allSatisfy(actor -> {
            assertThat(actor.phase()).isEqualTo(Phase.NOT_STARTED);
            assertThat(actor.baseRemaining()).isNull();
            assertThat(actor.baseRevision()).isNull();
            assertThat(actor.workingRemaining()).isNull();
            assertThat(actor.pendingAllocation()).isNull();
            assertThat(actor.failureReason()).isNull();
            assertThat(actor.appliedStockUnits()).isZero();
            assertThat(actor.pendingStockUnits()).isZero();
        });
        assertThat(result.outcomes()).hasSize(input.schedule().size());
        for (int i = 0; i < input.schedule().size(); i++) {
            var outcome = result.outcomes().get(i);
            assertThat(outcome.sequence()).isEqualTo(i + 1);
            assertThat(outcome.stepId()).isEqualTo(input.schedule().get(i).id());
            assertThat(outcome.transactionId()).isEqualTo(input.schedule().get(i).transactionId());
            assertThat(outcome.action()).isEqualTo(input.schedule().get(i).action());
        }
        assertThat(result.finalState()).isEqualTo(result.outcomes().get(result.outcomes().size() - 1).postState());
        assertThat(result.finalState().revision()).isEqualTo(expected.revision());
        assertThat(result.finalState().invariants()).isEqualTo(new Invariants(true, true,
                expected.conserved(), expected.abortClean(), expected.remaining() + expected.allocated()));
        assertThat(result.metrics()).isEqualTo(new Metrics(expected.committed(), expected.aborted(),
                expected.conflicts(), expected.leaked(), expected.remaining(), expected.allocated(),
                expected.firstViolation() == null ? InvariantStatus.PRESERVED : InvariantStatus.VIOLATED, expected.firstViolation()));
        assertThat(result.finalState().transactions()).allSatisfy(actor -> {
            assertThat(actor.phase()).isIn(Phase.COMMITTED, Phase.ABORTED);
            assertThat(actor.workingRemaining()).isNull();
            assertThat(actor.pendingStockUnits()).isZero();
            assertThat(actor.pendingAllocation()).isNull();
            assertThat(actor.baseRemaining()).isNotNull();
            assertThat(actor.baseRevision()).isNotNull();
        });
    }

    @Test void splitStockOnlyAbortRetainsItsEffectWithoutAnAllocationRow() {
        var result = analyzer.run(AtomicityPresets.baseline());
        assertThat(result.outcomes()).extracting(AtomicityResult.Outcome::kind).containsExactly(
                Kind.TRANSACTION_STARTED, Kind.STOCK_APPLIED, Kind.TRANSACTION_ABORTED);
        assertThat(actor(result.outcomes().get(0).postState(), "a")).isEqualTo(
                new TransactionState("a", 1, Phase.OPEN, 0, 0, 1, 0, null, null, null));
        assertThat(result.outcomes().get(1).postState().invariants()).isEqualTo(new Invariants(true, true, false, true, 0));
        assertThat(actor(result.finalState(), "a")).isEqualTo(
                new TransactionState("a", 1, Phase.ABORTED, 1, 0, 1, 0, null, null, Reason.USER_ABORT));
        assertThat(result.finalState().allocations()).isEmpty();
        assertThat(result.outcomes().get(1).checkedRemaining()).isEqualTo(1);
        assertThat(result.outcomes().get(1).checkSource()).isEqualTo(CheckSource.CURRENT);
    }

    @Test void stagedHalfWorkIsPrivateAndPublicationClearsItsWorkspace() {
        var result = analyzer.run(preset("protected-commit"));
        assertThat(actor(result.outcomes().get(1).postState(), "a")).isEqualTo(
                new TransactionState("a", 1, Phase.OPEN, 0, 1, 1, 0, 0, null, null));
        assertThat(actor(result.outcomes().get(2).postState(), "a")).isEqualTo(
                new TransactionState("a", 1, Phase.OPEN, 0, 1, 1, 0, 0,
                        new PendingAllocation("a", 1, "record-a"), null));
        for (int i = 0; i < 3; i++) {
            assertThat(result.outcomes().get(i).postState().remainingUnits()).isEqualTo(1);
            assertThat(result.outcomes().get(i).postState().allocatedUnits()).isZero();
            assertThat(result.outcomes().get(i).postState().revision()).isZero();
        }
        assertThat(result.finalState().allocations()).containsExactly(new Allocation("a", 1, "record-a", "commit-a"));
        assertThat(actor(result.finalState(), "a")).isEqualTo(
                new TransactionState("a", 1, Phase.COMMITTED, 1, 0, 1, 0, null, null, null));
        assertThat(result.outcomes().get(3).expectedRevision()).isZero();
        assertThat(result.outcomes().get(3).actualRevision()).isZero();
    }

    @Test void abortAfterBothSplitWritesPassesConservationButStillLeaksAbortedEffects() {
        var result = analyzer.run(preset("split-abort-after-record"));
        assertThat(result.finalState().allocations()).containsExactly(new Allocation("a", 1, "record-a", "record-a"));
        assertThat(result.finalState().invariants()).isEqualTo(new Invariants(true, true, true, false, 1));
        assertThat(actor(result.finalState(), "a").appliedStockUnits()).isEqualTo(1);
        assertThat(result.metrics().firstViolationStepId()).isEqualTo("decrement-a");
    }

    @Test void insufficientWorkIsAnExplicitCompleteProgramWithOriginalReasonOnAbort() {
        for (var terminal : List.of(COMMIT, ABORT)) {
            for (var mode : Mode.values()) {
                var result = analyzer.run(one(mode, 0, 1, BEGIN, DECREMENT_STOCK, RECORD_ALLOCATION, terminal));
                assertThat(result.outcomes()).extracting(AtomicityResult.Outcome::kind).containsExactly(
                        Kind.TRANSACTION_STARTED, Kind.STOCK_REJECTED, Kind.WORK_SKIPPED, Kind.TRANSACTION_ABORTED);
                assertThat(result.outcomes().subList(1, 4)).allSatisfy(outcome ->
                        assertThat(outcome.reason()).isEqualTo(Reason.INSUFFICIENT_STOCK));
                assertThat(actor(result.outcomes().get(1).postState(), "a").phase()).isEqualTo(Phase.BLOCKED);
                assertThat(actor(result.outcomes().get(2).postState(), "a").phase()).isEqualTo(Phase.BLOCKED);
                assertThat(actor(result.finalState(), "a").failureReason()).isEqualTo(Reason.INSUFFICIENT_STOCK);
                assertThat(result.finalState().revision()).isZero();
                assertThat(result.finalState().allocations()).isEmpty();
                assertThat(result.outcomes().get(3).expectedRevision()).isNull();
                assertThat(result.outcomes().get(3).actualRevision()).isNull();
            }
        }
    }

    @ParameterizedTest @EnumSource(Mode.class)
    void earlyAbortHasNoVisibleEffects(Mode mode) {
        var result = analyzer.run(one(mode, 7, 3, BEGIN, ABORT));
        assertThat(result.finalState().remainingUnits()).isEqualTo(7);
        assertThat(result.finalState().revision()).isZero();
        assertThat(result.finalState().allocations()).isEmpty();
        assertThat(actor(result.finalState(), "a").failureReason()).isEqualTo(Reason.USER_ABORT);
        assertThat(result.metrics().invariantStatus()).isEqualTo(InvariantStatus.PRESERVED);
    }

    @Test void protectedAbortAfterBothPreparationsPublishesNothing() {
        var result = analyzer.run(one(STAGED_VERSION_CHECK, 3, 2, BEGIN, DECREMENT_STOCK, RECORD_ALLOCATION, ABORT));
        assertThat(actor(result.outcomes().get(2).postState(), "a").pendingAllocation()).isEqualTo(new PendingAllocation("a", 2, "record-a"));
        assertThat(result.finalState().remainingUnits()).isEqualTo(3);
        assertThat(result.finalState().revision()).isZero();
        assertThat(result.finalState().allocations()).isEmpty();
        assertThat(actor(result.finalState(), "a").workingRemaining()).isNull();
        assertThat(actor(result.finalState(), "a").appliedStockUnits()).isZero();
    }

    @Test void coarseRevisionConflictIsNotInsufficientCapacityAndPreservesTheWinner() {
        var result = analyzer.run(preset("conservative-conflict"));
        var conflict = result.outcomes().get(7);
        assertThat(conflict.reason()).isEqualTo(Reason.REVISION_CONFLICT);
        assertThat(conflict.expectedRevision()).isZero();
        assertThat(conflict.actualRevision()).isEqualTo(1);
        assertThat(conflict.postState().remainingUnits()).isEqualTo(2);
        assertThat(conflict.postState().allocations()).containsExactly(new Allocation("a", 1, "record-a", "commit-a"));
        assertThat(actor(conflict.postState(), "b").appliedStockUnits()).isZero();
        assertThat(actor(conflict.postState(), "b").pendingStockUnits()).isZero();
        assertThat(actor(conflict.postState(), "b").pendingAllocation()).isNull();
    }

    @Test void abortDiscardsOnlyItsOwnWorkspaceAndDoesNotRestoreAnotherActorsCommit() {
        var result = analyzer.run(input(STAGED_VERSION_CHECK, 3, List.of(new Transaction("a", 1), new Transaction("b", 2)),
                List.of(step("a", BEGIN), step("a", DECREMENT_STOCK), step("a", RECORD_ALLOCATION),
                        step("b", BEGIN), step("b", DECREMENT_STOCK), step("b", RECORD_ALLOCATION), step("b", COMMIT), step("a", ABORT))));
        assertThat(result.finalState().remainingUnits()).isEqualTo(1);
        assertThat(result.finalState().revision()).isEqualTo(1);
        assertThat(result.finalState().allocations()).containsExactly(new Allocation("b", 2, "record-b", "commit-b"));
        assertThat(actor(result.finalState(), "a").baseRemaining()).isEqualTo(3);
        assertThat(actor(result.finalState(), "a").appliedStockUnits()).isZero();
        assertThat(result.metrics().invariantStatus()).isEqualTo(InvariantStatus.PRESERVED);
    }

    @Test void splitAbortDoesNotReplenishStockForLaterWork() {
        var result = analyzer.run(input(SPLIT_WRITES, 1, List.of(new Transaction("a", 1), new Transaction("b", 1)),
                List.of(step("a", BEGIN), step("a", DECREMENT_STOCK), step("a", ABORT),
                        step("b", BEGIN), step("b", DECREMENT_STOCK), step("b", RECORD_ALLOCATION), step("b", COMMIT))));
        assertThat(result.outcomes().get(4).kind()).isEqualTo(Kind.STOCK_REJECTED);
        assertThat(result.outcomes().get(4).checkedRemaining()).isZero();
        assertThat(result.finalState().remainingUnits()).isZero();
        assertThat(result.finalState().allocations()).isEmpty();
        assertThat(result.metrics().abortedTransactions()).isEqualTo(2);
        assertThat(result.metrics().abortedTransactionsWithEffects()).isEqualTo(1);
    }

    @ParameterizedTest @EnumSource(Mode.class)
    void exactQuantitySucceedsAndLargerQuantityRejects(Mode mode) {
        var equal = analyzer.run(one(mode, 20, 20, BEGIN, DECREMENT_STOCK, RECORD_ALLOCATION, COMMIT));
        assertThat(equal.finalState().remainingUnits()).isZero();
        assertThat(equal.finalState().allocatedUnits()).isEqualTo(20);
        assertThat(equal.metrics().committedTransactions()).isEqualTo(1);
        var greater = analyzer.run(one(mode, 19, 20, BEGIN, DECREMENT_STOCK, RECORD_ALLOCATION, COMMIT));
        assertThat(greater.finalState().remainingUnits()).isEqualTo(19);
        assertThat(greater.finalState().allocatedUnits()).isZero();
        assertThat(greater.outcomes().get(1).checkedRemaining()).isEqualTo(19);
        assertThat(greater.metrics().abortedTransactions()).isEqualTo(1);
    }

    @Test void outcomeEvidenceIsConditionalAndTextIsBounded() {
        assertThat(AtomicityPresets.all()).extracting(AtomicityPresets.Preset::id).containsExactly(
                "baseline", "protected-baseline", "protected-commit", "split-commit", "split-abort-after-record",
                "empty-stock", "protected-conflict", "conservative-conflict");
        for (var preset : AtomicityPresets.all()) {
            var result = analyzer.run(preset.input());
            assertThat(result.assumptions()).hasSizeLessThanOrEqualTo(12);
            assertThat(result.assumptions()).allSatisfy(text -> assertThat(text.length()).isBetween(1, 600));
            for (var outcome : result.outcomes()) {
                assertThat(outcome.explanation().length()).isBetween(1, 600);
                boolean stock = outcome.action() == DECREMENT_STOCK;
                assertThat(outcome.checkedRemaining() != null).isEqualTo(stock);
                assertThat(outcome.checkSource() != null).isEqualTo(stock);
                boolean validation = preset.input().mode() == STAGED_VERSION_CHECK && outcome.action() == COMMIT
                        && outcome.reason() != Reason.INSUFFICIENT_STOCK;
                assertThat(outcome.expectedRevision() != null).isEqualTo(validation);
                assertThat(outcome.actualRevision() != null).isEqualTo(validation);
                boolean needsReason = List.of(Kind.STOCK_REJECTED, Kind.WORK_SKIPPED, Kind.TRANSACTION_ABORTED).contains(outcome.kind());
                assertThat(outcome.reason() != null).isEqualTo(needsReason);
            }
        }
    }
}
