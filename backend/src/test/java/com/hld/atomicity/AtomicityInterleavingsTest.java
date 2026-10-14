package com.hld.atomicity;

import static com.hld.atomicity.AtomicityFixtures.actor;
import static com.hld.atomicity.AtomicityFixtures.input;
import static com.hld.atomicity.AtomicityFixtures.step;
import static com.hld.atomicity.AtomicityInput.Action.*;
import static org.assertj.core.api.Assertions.assertThat;

import com.hld.atomicity.AtomicityInput.Mode;
import com.hld.atomicity.AtomicityInput.Step;
import com.hld.atomicity.AtomicityInput.Transaction;
import com.hld.atomicity.AtomicityResult.Allocation;
import com.hld.atomicity.AtomicityResult.InvariantStatus;
import com.hld.atomicity.AtomicityResult.Invariants;
import com.hld.atomicity.AtomicityResult.Kind;
import com.hld.atomicity.AtomicityResult.Phase;
import com.hld.atomicity.AtomicityResult.Reason;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/** All choose(8,4)=70 order-preserving programs, with expectations from schedule positions. */
class AtomicityInterleavingsTest {
    private final AtomicityAnalyzer analyzer = new AtomicityAnalyzer();

    static List<List<Step>> orders() {
        List<List<Step>> orders = new ArrayList<>();
        merge(List.of(step("a", BEGIN), step("a", DECREMENT_STOCK), step("a", RECORD_ALLOCATION), step("a", COMMIT)),
                List.of(step("b", BEGIN), step("b", DECREMENT_STOCK), step("b", RECORD_ALLOCATION), step("b", COMMIT)),
                0, 0, new ArrayList<>(), orders);
        return List.copyOf(orders);
    }
    private static void merge(List<Step> a, List<Step> b, int ai, int bi,
            List<Step> prefix, List<List<Step>> output) {
        if (ai == a.size() && bi == b.size()) {
            output.add(List.copyOf(prefix));
            return;
        }
        if (ai < a.size()) {
            prefix.add(a.get(ai));
            merge(a, b, ai + 1, bi, prefix, output);
            prefix.remove(prefix.size() - 1);
        }
        if (bi < b.size()) {
            prefix.add(b.get(bi));
            merge(a, b, ai, bi + 1, prefix, output);
            prefix.remove(prefix.size() - 1);
        }
    }
    static Stream<List<Step>> schedules() { return orders().stream(); }
    private static int position(List<Step> order, String id) {
        for (int i = 0; i < order.size(); i++) if (order.get(i).id().equals(id)) return i;
        throw new AssertionError("missing fixture step " + id);
    }

    @Test void enumerationContainsAllSeventyUniqueLegalOrdersAndBothSerialOrders() {
        var orders = orders();
        assertThat(orders).hasSize(70);
        assertThat(new HashSet<>(orders)).hasSize(70);
        assertThat(orders.stream().filter(order -> position(order, "commit-a") < position(order, "begin-b")
                || position(order, "commit-b") < position(order, "begin-a")).count()).isEqualTo(2);
    }

    @ParameterizedTest @MethodSource("schedules")
    void everyOrderHasExactWinnersFailureCausesVisibleRowsAndInvariantHistory(List<Step> schedule) {
        for (int stock : List.of(1, 2)) {
            for (Mode mode : Mode.values()) {
                var result = analyzer.run(input(mode, stock,
                        List.of(new Transaction("a", 1), new Transaction("b", 1)), schedule));
                assertThat(result.outcomes()).hasSize(8);
                assertThat(result.finalState().invariants()).isEqualTo(new Invariants(true, true, true, true, stock));
                assertThat(result.finalState().transactions()).allSatisfy(actor -> {
                    assertThat(actor.workingRemaining()).isNull();
                    assertThat(actor.pendingStockUnits()).isZero();
                    assertThat(actor.pendingAllocation()).isNull();
                });
                if (mode == Mode.SPLIT_WRITES) {
                    String firstStock = position(schedule, "decrement-a") < position(schedule, "decrement-b") ? "a" : "b";
                    if (stock == 1) {
                        String loser = firstStock.equals("a") ? "b" : "a";
                        assertThat(result.metrics().committedTransactions()).isEqualTo(1);
                        assertThat(result.metrics().abortedTransactions()).isEqualTo(1);
                        assertThat(actor(result.finalState(), loser).failureReason()).isEqualTo(Reason.INSUFFICIENT_STOCK);
                        assertThat(actor(result.finalState(), loser).appliedStockUnits()).isZero();
                        assertThat(result.outcomes().get(position(schedule, "decrement-" + loser)).kind()).isEqualTo(Kind.STOCK_REJECTED);
                        assertThat(result.outcomes().get(position(schedule, "record-" + loser)).kind()).isEqualTo(Kind.WORK_SKIPPED);
                        assertThat(result.finalState().allocations()).containsExactly(
                                new Allocation(firstStock, 1, "record-" + firstStock, "record-" + firstStock));
                        assertThat(result.finalState().revision()).isEqualTo(2);
                    } else {
                        assertThat(result.metrics().committedTransactions()).isEqualTo(2);
                        assertThat(result.metrics().abortedTransactions()).isZero();
                        String firstRow = position(schedule, "record-a") < position(schedule, "record-b") ? "a" : "b";
                        String secondRow = firstRow.equals("a") ? "b" : "a";
                        assertThat(result.finalState().allocations()).containsExactly(
                                new Allocation(firstRow, 1, "record-" + firstRow, "record-" + firstRow),
                                new Allocation(secondRow, 1, "record-" + secondRow, "record-" + secondRow));
                        assertThat(result.finalState().revision()).isEqualTo(4);
                    }
                    assertThat(result.metrics().conflictedTransactions()).isZero();
                    assertThat(result.metrics().firstViolationStepId()).isEqualTo("decrement-" + firstStock);
                    assertThat(result.metrics().invariantStatus()).isEqualTo(InvariantStatus.VIOLATED);
                } else {
                    String firstCommit = position(schedule, "commit-a") < position(schedule, "commit-b") ? "a" : "b";
                    String second = firstCommit.equals("a") ? "b" : "a";
                    boolean serial = position(schedule, "commit-" + firstCommit) < position(schedule, "begin-" + second);
                    int committed = serial && stock == 2 ? 2 : 1;
                    assertThat(result.metrics().committedTransactions()).isEqualTo(committed);
                    assertThat(result.metrics().abortedTransactions()).isEqualTo(2 - committed);
                    assertThat(result.metrics().conflictedTransactions()).isEqualTo(serial ? 0 : 1);
                    assertThat(actor(result.finalState(), firstCommit).phase()).isEqualTo(Phase.COMMITTED);
                    assertThat(actor(result.finalState(), second).failureReason()).isEqualTo(
                            serial ? (stock == 1 ? Reason.INSUFFICIENT_STOCK : null) : Reason.REVISION_CONFLICT);
                    assertThat(result.finalState().allocations().get(0)).isEqualTo(
                            new Allocation(firstCommit, 1, "record-" + firstCommit, "commit-" + firstCommit));
                    if (committed == 2) assertThat(result.finalState().allocations().get(1)).isEqualTo(
                            new Allocation(second, 1, "record-" + second, "commit-" + second));
                    assertThat(result.finalState().revision()).isEqualTo(committed);
                    assertThat(result.outcomes()).allSatisfy(outcome ->
                            assertThat(outcome.postState().invariants()).isEqualTo(new Invariants(true, true, true, true, stock)));
                    assertThat(result.metrics().invariantStatus()).isEqualTo(InvariantStatus.PRESERVED);
                    assertThat(result.metrics().firstViolationStepId()).isNull();
                }
                assertThat(result.metrics().abortedTransactionsWithEffects()).isZero();
                assertThat(result.finalState().remainingUnits() + result.finalState().allocatedUnits()).isEqualTo(stock);
                assertThat(result.finalState().allocatedUnits()).isEqualTo(result.metrics().committedTransactions());
                assertThat(result.outcomes().get(7).postState()).isEqualTo(result.finalState());
            }
        }
    }
}
