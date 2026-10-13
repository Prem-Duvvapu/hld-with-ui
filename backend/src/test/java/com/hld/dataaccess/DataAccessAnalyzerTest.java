package com.hld.dataaccess;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.dataaccess.DataAccessInput.IndexOrder;
import com.hld.dataaccess.DataAccessInput.Kind;
import com.hld.dataaccess.DataAccessInput.Operation;
import com.hld.dataaccess.DataAccessInput.Row;
import com.hld.dataaccess.DataAccessResult.AccessPath;
import com.hld.dataaccess.DataAccessResult.ConflictReason;
import com.hld.dataaccess.DataAccessResult.Work;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

class DataAccessAnalyzerTest {
    private final DataAccessAnalyzer analyzer = new DataAccessAnalyzer();
    record Expected(String preset, int entries, int base, int records, List<String> returned) {}
    static Stream<Expected> presets() {
        return Stream.of(new Expected("baseline", 2, 2, 12, List.of("b2", "b3")),
                new Expected("table-scan", 0, 12, 12, List.of("b2", "b3")),
                new Expected("time-first", 6, 2, 12, List.of("b2", "b3")),
                new Expected("global-range", 12, 6, 12, List.of("a2", "b2", "g2", "a3", "b3", "g3")),
                new Expected("duplicate-key", 2, 2, 12, List.of("b2", "b3")),
                new Expected("no-unique", 3, 3, 13, List.of("b2", "b5", "b3")),
                new Expected("insert-order", 3, 3, 13, List.of("b2", "b5", "b3")));
    }
    private DataAccessInput preset(String id) {
        return DataAccessPresets.all().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow().input();
    }
    private static DataAccessInput input(IndexOrder order, boolean enforced, List<Row> rows, List<Operation> operations) {
        return new DataAccessInput("1.0", "1.0.0", order, enforced, rows, operations);
    }
    @ParameterizedTest @MethodSource("presets")
    void sevenPresetsHaveExactAuthoredEvidence(Expected expected) {
        var input = preset(expected.preset());
        var result = analyzer.run(input);
        var query = result.outcomes().get(result.outcomes().size() - 1);
        assertThat(query.work().indexEntriesExamined()).isEqualTo(expected.entries());
        assertThat(query.work().baseRowsExamined()).isEqualTo(expected.base());
        assertThat(query.matchedIds()).isEqualTo(expected.returned());
        assertThat(query.returnedIds()).isEqualTo(expected.returned());
        assertThat(result.finalRows()).hasSize(expected.records());
        assertThat(result.input()).isEqualTo(input);
        assertThat(result.kind()).isEqualTo("analysis");
        assertThat(result.status()).isEqualTo("completed");
        assertThat(query.accepted()).isNull();
        assertThat(query.conflict()).isNull();
        assertThat(result.totals()).isEqualTo(result.outcomes().stream().map(DataAccessResult.Outcome::work).reduce(Work.ZERO, Work::plus));
    }
    @Test void traversalOrderIsDistinctFromReturnedOrder() {
        var scan = analyzer.run(preset("table-scan")).outcomes().get(0);
        assertThat(scan.candidateIds()).containsExactly("a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4", "g1", "g2", "g3", "g4");
        var time = analyzer.run(preset("time-first")).outcomes().get(0);
        assertThat(time.candidateIds()).containsExactly("a2", "b2", "g2", "a3", "b3", "g3");
        var global = analyzer.run(preset("global-range")).outcomes().get(0);
        assertThat(global.candidateIds()).isEqualTo(scan.candidateIds());
        assertThat(global.matchedIds()).containsExactly("a2", "b2", "g2", "a3", "b3", "g3");
    }
    @Test void globalRangeBenefitsFromCreatedFirstAndTenantRangeFromTenantFirst() {
        var query = Operation.allRange("q1", 20, 30, 20);
        var tenant = analyzer.run(input(IndexOrder.TENANT_CREATED, true, DataAccessPresets.rows(), List.of(query)));
        var created = analyzer.run(input(IndexOrder.CREATED_TENANT, true, DataAccessPresets.rows(), List.of(query)));
        assertThat(tenant.totals().indexEntriesExamined()).isEqualTo(12);
        assertThat(created.totals().indexEntriesExamined()).isEqualTo(6);
        assertThat(created.totals().baseRowsExamined()).isEqualTo(6);
        assertThat(created.outcomes().get(0).returnedIds()).isEqualTo(tenant.outcomes().get(0).returnedIds());
    }
    @Test void limitChangesReturnsWithoutHidingCandidateOrFetchWork() {
        var result = analyzer.run(input(IndexOrder.CREATED_TENANT, true, DataAccessPresets.rows(),
                List.of(Operation.tenantRange("q1", "beta", 20, 30, 1))));
        var outcome = result.outcomes().get(0);
        assertThat(outcome.work()).isEqualTo(new Work(0, 1, 6, 2, 2, 1, 0, 0, 0, 0));
        assertThat(outcome.matchedIds()).containsExactly("b2", "b3");
        assertThat(outcome.returnedIds()).containsExactly("b2");
    }
    @Test void rangeEndpointsAreInclusiveAndEqualKeysUseStableIdOrdering() {
        List<Row> rows = List.of(new Row("z", "beta", "k1", 20), new Row("a", "beta", "k2", 20), new Row("m", "alpha", "k1", 20));
        for (IndexOrder order : IndexOrder.values()) {
            var result = analyzer.run(input(order, true, rows, List.of(Operation.tenantRange("q", "beta", 20, 20, 20))));
            assertThat(result.outcomes().get(0).matchedIds()).containsExactly("a", "z");
            assertThat(result.outcomes().get(0).returnedIds()).containsExactly("a", "z");
        }
    }
    @Test void missingTenantAndEmptyIntervalsHaveHonestZeroMatches() {
        var result = analyzer.run(input(IndexOrder.CREATED_TENANT, true, DataAccessPresets.rows(),
                List.of(Operation.tenantRange("missing", "delta", 20, 30, 20), Operation.allRange("empty", 21, 29, 20))));
        assertThat(result.outcomes().get(0).work()).isEqualTo(new Work(0, 1, 6, 0, 0, 0, 0, 0, 0, 0));
        assertThat(result.outcomes().get(0).matchedIds()).isEmpty();
        assertThat(result.outcomes().get(1).work()).isEqualTo(new Work(0, 1, 0, 0, 0, 0, 0, 0, 0, 0));
    }
    @Test void primaryLookupCountsOneProbeForBothHitAndMiss() {
        var result = analyzer.run(input(IndexOrder.NONE, true, DataAccessPresets.rows(), List.of(Operation.lookup("hit", "b2"), Operation.lookup("miss", "unknown"))));
        assertThat(result.outcomes().get(0).work()).isEqualTo(new Work(1, 0, 0, 1, 1, 1, 0, 0, 0, 0));
        assertThat(result.outcomes().get(0).accessPath()).isEqualTo(AccessPath.PRIMARY_KEY);
        assertThat(result.outcomes().get(1).work()).isEqualTo(new Work(1, 0, 0, 0, 0, 0, 0, 0, 0, 0));
        assertThat(result.outcomes().get(1).candidateIds()).isEmpty();
    }
    @Test void rejectedScopedBusinessKeyDoesNotMutateRecordsOrIndexes() {
        var result = analyzer.run(preset("duplicate-key"));
        var insertion = result.outcomes().get(0);
        assertThat(insertion.accepted()).isFalse();
        assertThat(insertion.conflict().reason()).isEqualTo(ConflictReason.DUPLICATE_BUSINESS_KEY);
        assertThat(insertion.conflict().recordId()).isEqualTo("b2");
        assertThat(insertion.work()).isEqualTo(new Work(1, 0, 0, 0, 0, 0, 0, 0, 1, 0));
        assertThat(result.finalRows()).isEqualTo(DataAccessPresets.rows());
    }
    @Test void disabledBusinessRuleAllowsDuplicateWithoutChangingPrimaryRule() {
        var result = analyzer.run(preset("no-unique"));
        assertThat(result.outcomes().get(0).work()).isEqualTo(new Work(1, 0, 0, 0, 0, 0, 1, 1, 0, 0));
        assertThat(result.finalRows().stream().filter(r -> r.tenant().equals("beta") && r.businessKey().equals("k2"))).hasSize(2);
        for (boolean enforce : new boolean[] {false, true}) {
            var duplicateId = analyzer.run(input(IndexOrder.TENANT_CREATED, enforce, DataAccessPresets.rows(),
                    List.of(Operation.insert("i", new Row("b2", "beta", "k2", 25))))).outcomes().get(0);
            assertThat(duplicateId.conflict().reason()).isEqualTo(ConflictReason.DUPLICATE_ID);
            assertThat(duplicateId.work()).isEqualTo(new Work(1, 0, 0, 0, 0, 0, 0, 0, 0, 0));
        }
    }
    @Test void sameBusinessKeyAcrossTenantsIsValidAndAcceptedInsertIsImmediatelyQueryable() {
        var result = analyzer.run(input(IndexOrder.NONE, true, DataAccessPresets.rows(),
                List.of(Operation.insert("i", new Row("d1", "delta", "k2", 20)), Operation.lookup("q", "d1"))));
        assertThat(result.outcomes().get(0).accepted()).isTrue();
        assertThat(result.outcomes().get(0).conflict()).isNull();
        assertThat(result.outcomes().get(0).work()).isEqualTo(new Work(1, 0, 0, 0, 0, 0, 1, 0, 1, 1));
        assertThat(result.outcomes().get(1).returnedIds()).containsExactly("d1");
        assertThat(result.finalRows().get(12).id()).isEqualTo("d1");
    }
    @Test void emptyInitialStateAndMaximumInsertsRemainBounded() {
        var empty = analyzer.run(input(IndexOrder.TENANT_CREATED, true, List.of(), List.of(Operation.allRange("q", 0, 1_000_000, 20))));
        assertThat(empty.outcomes().get(0).work()).isEqualTo(new Work(0, 1, 0, 0, 0, 0, 0, 0, 0, 0));
        List<Row> initial = IntStream.range(0, 20).mapToObj(i -> new Row("r" + i, "alpha", "k" + i, i)).toList();
        List<Operation> inserts = IntStream.range(20, 30).mapToObj(i -> Operation.insert("i" + i, new Row("r" + i, "alpha", "k" + i, i))).toList();
        var maximum = analyzer.run(input(IndexOrder.TENANT_CREATED, true, initial, inserts));
        assertThat(maximum.finalRows()).hasSize(30);
        assertThat(maximum.totals()).isEqualTo(new Work(10, 0, 0, 0, 0, 0, 10, 10, 10, 10));
    }
    @Test void inputAndResultListsCannotBeChangedByCallers() {
        var rows = new ArrayList<>(DataAccessPresets.rows());
        var operations = new ArrayList<>(List.of(Operation.lookup("q", "b2")));
        var input = input(IndexOrder.NONE, true, rows, operations);
        rows.clear(); operations.clear();
        var result = analyzer.run(input);
        assertThat(result.input().rows()).hasSize(12);
        assertThat(result.input().operations()).hasSize(1);
        assertThatThrownBy(() -> input.rows().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> result.finalRows().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> result.outcomes().get(0).candidateIds().clear()).isInstanceOf(UnsupportedOperationException.class);
    }
    @Test void repeatedAndConcurrentCallsHaveExactlyTheSameRequestLocalEvidence() throws Exception {
        var input = preset("insert-order");
        var expected = analyzer.run(input);
        var executor = Executors.newFixedThreadPool(4);
        try {
            var futures = IntStream.range(0, 24).mapToObj(i -> executor.submit(() -> analyzer.run(input))).toList();
            for (var future : futures) assertThat(future.get(5, TimeUnit.SECONDS)).isEqualTo(expected);
            assertThat(analyzer.run(DataAccessPresets.baseline()).finalRows()).hasSize(12);
            assertThat(analyzer.run(input)).isEqualTo(expected);
        } finally { executor.shutdownNow(); }
    }
    @Test void directDomainRejectsInvalidVersionsCollectionsIdsBoundsAndInitialInvariants() {
        var base = DataAccessPresets.baseline();
        List<DataAccessInput> invalid = new ArrayList<>();
        invalid.add(null);
        invalid.add(new DataAccessInput("2.0", "1.0.0", base.indexOrder(), true, base.rows(), base.operations()));
        invalid.add(new DataAccessInput("1.0", "2.0.0", base.indexOrder(), true, base.rows(), base.operations()));
        invalid.add(new DataAccessInput("1.0", "1.0.0", null, true, base.rows(), base.operations()));
        invalid.add(new DataAccessInput("1.0", "1.0.0", base.indexOrder(), null, base.rows(), base.operations()));
        invalid.add(input(IndexOrder.NONE, true, null, base.operations()));
        invalid.add(input(IndexOrder.NONE, true, base.rows(), null));
        invalid.add(input(IndexOrder.NONE, true, base.rows(), List.of()));
        invalid.add(input(IndexOrder.NONE, true, base.rows(), java.util.Collections.singletonList(null)));
        invalid.add(input(IndexOrder.NONE, true, java.util.Collections.singletonList(null), base.operations()));
        invalid.add(input(IndexOrder.NONE, true, List.of(base.rows().get(0), base.rows().get(0)), base.operations()));
        invalid.add(input(IndexOrder.NONE, true, List.of(new Row("x", "alpha", "k1", 1), new Row("y", "alpha", "k1", 2)), base.operations()));
        for (String id : List.of("", "A", "a\n", "a ", "a".repeat(33), "é"))
            invalid.add(input(IndexOrder.NONE, true, List.of(new Row(id, "alpha", "k1", 1)), base.operations()));
        for (Integer value : new Integer[] {null, -1, 1_000_001})
            invalid.add(input(IndexOrder.NONE, true, List.of(new Row("r", "alpha", "k1", value)), base.operations()));
        for (DataAccessInput input : invalid) assertThatThrownBy(() -> analyzer.run(input)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void directDomainRejectsMissingMixedAndInvalidOperationVariants() {
        List<Operation> invalid = List.of(
                new Operation("q", null, null, null, null, null, null, null),
                Operation.lookup("q", null),
                new Operation("q", Kind.LOOKUP_ID, "b2", "beta", null, null, null, null),
                new Operation("q", Kind.TENANT_RANGE, null, null, 20, 30, 20, null),
                Operation.tenantRange("q", "beta", 30, 20, 20),
                Operation.tenantRange("q", "beta", -1, 20, 20),
                Operation.tenantRange("q", "beta", 0, 1_000_001, 20),
                Operation.tenantRange("q", "beta", 20, 30, 0),
                Operation.tenantRange("q", "beta", 20, 30, 21),
                new Operation("q", Kind.ALL_RANGE, null, "beta", 20, 30, 20, null),
                Operation.insert("q", null),
                new Operation("q", Kind.INSERT, "b2", null, null, null, null, new Row("x", "beta", "k5", 20)));
        for (Operation operation : invalid)
            assertThatThrownBy(() -> analyzer.run(input(IndexOrder.NONE, true, DataAccessPresets.rows(), List.of(operation))))
                    .as(operation.toString()).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> analyzer.run(input(IndexOrder.NONE, true, DataAccessPresets.rows(),
                List.of(Operation.lookup("q", "b2"), Operation.lookup("q", "b3")))))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
