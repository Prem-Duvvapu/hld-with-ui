package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.catalog.CatalogService;
import com.hld.catalog.GuidedCheckpoint;
import com.hld.dataaccess.DataAccessAnalyzer;
import com.hld.dataaccess.DataAccessDescriptor.Preset;
import com.hld.dataaccess.DataAccessInput.Kind;
import com.hld.dataaccess.DataAccessResult;
import com.hld.dataaccess.DataAccessResult.AccessPath;
import com.hld.dataaccess.DataAccessResult.Conflict;
import com.hld.dataaccess.DataAccessResult.ConflictReason;
import com.hld.dataaccess.DataAccessResult.Outcome;
import com.hld.dataaccess.DataAccessResult.Work;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** Canonical checkpoints select real untimed outcomes and reconcile every authored numeric fixture. */
@SpringBootTest
class DataAccessGuidedCheckpointsTest {
    @Autowired CatalogService catalog;
    @Autowired DataAccessController controller;
    @Autowired DataAccessAnalyzer analyzer;
    record Expected(String id, String preset, String operation, Kind kind, AccessPath path,
            List<String> candidates, List<String> matched, int before, int after, Work work,
            Boolean accepted, Conflict conflict) {}
    static Stream<Expected> checkpoints() {
        List<String> beta = List.of("b2", "b3");
        List<String> allRows = List.of("a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4", "g1", "g2", "g3", "g4");
        List<String> global = List.of("a2", "b2", "g2", "a3", "b3", "g3");
        List<String> inserted = List.of("b2", "b5", "b3");
        return Stream.of(
                new Expected("tenant-groups-match", "baseline", "q1", Kind.TENANT_RANGE, AccessPath.TENANT_CREATED_INDEX,
                        beta, beta, 12, 12, new Work(0, 1, 2, 2, 2, 2, 0, 0, 0, 0), null, null),
                new Expected("scan-still-answers", "table-scan", "q1", Kind.TENANT_RANGE, AccessPath.TABLE_SCAN,
                        allRows, beta, 12, 12, new Work(0, 0, 0, 12, 2, 2, 0, 0, 0, 0), null, null),
                new Expected("creation-first-extra-candidates", "time-first", "q1", Kind.TENANT_RANGE, AccessPath.CREATED_TENANT_INDEX,
                        global, beta, 12, 12, new Work(0, 1, 6, 2, 2, 2, 0, 0, 0, 0), null, null),
                new Expected("global-query-changes-prefix", "global-range", "q1", Kind.ALL_RANGE, AccessPath.TENANT_CREATED_INDEX,
                        allRows, global, 12, 12, new Work(0, 1, 12, 6, 6, 6, 0, 0, 0, 0), null, null),
                new Expected("new-id-old-business-key", "duplicate-key", "op1", Kind.INSERT, AccessPath.INSERT,
                        List.of(), List.of(), 12, 12, new Work(1, 0, 0, 0, 0, 0, 0, 0, 1, 0), false,
                        new Conflict(ConflictReason.DUPLICATE_BUSINESS_KEY, "b2")),
                new Expected("removed-business-rule", "no-unique", "op1", Kind.INSERT, AccessPath.INSERT,
                        List.of(), List.of(), 12, 13, new Work(1, 0, 0, 0, 0, 0, 1, 1, 0, 0), true, null),
                new Expected("accepted-maintenance", "insert-order", "op1", Kind.INSERT, AccessPath.INSERT,
                        List.of(), List.of(), 12, 13, new Work(1, 0, 0, 0, 0, 0, 1, 1, 1, 1), true, null),
                new Expected("read-after-insert", "insert-order", "q1", Kind.TENANT_RANGE, AccessPath.TENANT_CREATED_INDEX,
                        inserted, inserted, 13, 13, new Work(0, 1, 3, 3, 3, 3, 0, 0, 0, 0), null, null));
    }
    private Preset preset(String id) {
        return controller.descriptor().presets().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow();
    }
    private GuidedCheckpoint checkpoint(String id) {
        return catalog.draftTopic("data-access-models").checkpoints().stream().filter(c -> c.id().equals(id)).findFirst().orElseThrow();
    }

    @ParameterizedTest @MethodSource("checkpoints")
    void eachCanonicalTargetHasItsExactReturnedEvidenceAndPopulation(Expected expected) {
        var checkpoint = checkpoint(expected.id());
        assertThat(checkpoint.simulationId()).isEqualTo("data-access-models");
        assertThat(checkpoint.presetId()).isEqualTo(expected.preset());
        var target = checkpoint.target();
        assertThat(target.operationId()).isEqualTo(expected.operation());
        assertThat(target.kind()).isEqualTo(expected.kind().name());
        assertThat(target.occurrence()).isEqualTo(1);
        assertThat(target.operation()).isNull(); assertThat(target.jobId()).isNull();
        assertThat(target.messageId()).isNull(); assertThat(target.attemptId()).isNull();
        var preset = preset(checkpoint.presetId());
        var result = analyzer.run(preset.input());
        assertThat(result.modelVersion()).isEqualTo("1.0.0");
        assertThat(result.schemaVersion()).isEqualTo("1.0");
        assertThat(result.kind()).isEqualTo("analysis");
        assertThat(result.status()).isEqualTo("completed");
        List<Outcome> matches = result.outcomes().stream().filter(o -> o.operationId().equals(target.operationId()) && o.kind().name().equals(target.kind())).toList();
        assertThat(matches).as(expected.id() + " stable outcome target").hasSize(1);
        var outcome = matches.get(0);
        assertThat(outcome.accessPath()).isEqualTo(expected.path());
        assertThat(outcome.candidateIds()).isEqualTo(expected.candidates());
        assertThat(outcome.matchedIds()).isEqualTo(expected.matched());
        assertThat(outcome.returnedIds()).isEqualTo(expected.matched());
        assertThat(outcome.recordCountBefore()).isEqualTo(expected.before());
        assertThat(outcome.recordCountAfter()).isEqualTo(expected.after());
        assertThat(outcome.work()).isEqualTo(expected.work());
        assertThat(outcome.accepted()).isEqualTo(expected.accepted());
        assertThat(outcome.conflict()).isEqualTo(expected.conflict());
        assertThat(result.totals()).isEqualTo(result.outcomes().stream().map(Outcome::work).reduce(Work.ZERO, Work::plus));
        verifyReportedStates(result);
    }

    /** Apply only reported accepted inserts; query behavior is not recomputed by this projection. */
    private static void verifyReportedStates(DataAccessResult result) {
        Map<String, com.hld.dataaccess.DataAccessInput.Row> known = new LinkedHashMap<>();
        result.input().rows().forEach(row -> known.put(row.id(), row));
        for (int i = 0; i < result.outcomes().size(); i++) {
            var outcome = result.outcomes().get(i);
            var operation = result.input().operations().get(i);
            assertThat(outcome.operationId()).isEqualTo(operation.id());
            assertThat(outcome.kind()).isEqualTo(operation.kind());
            assertThat(outcome.recordCountBefore()).isEqualTo(known.size());
            assertThat(known.keySet()).containsAll(outcome.candidateIds()).containsAll(outcome.matchedIds()).containsAll(outcome.returnedIds());
            if (outcome.conflict() != null) assertThat(known).containsKey(outcome.conflict().recordId());
            if (operation.kind() == Kind.INSERT && Boolean.TRUE.equals(outcome.accepted())) {
                assertThat(known).doesNotContainKey(operation.row().id());
                known.put(operation.row().id(), operation.row());
            }
            assertThat(outcome.recordCountAfter()).isEqualTo(known.size());
            if (result.input().enforceBusinessKey()) {
                Set<List<String>> keys = new HashSet<>();
                for (var row : known.values()) assertThat(keys.add(List.of(row.tenant(), row.businessKey()))).isTrue();
            }
        }
        assertThat(result.finalRows()).containsExactlyElementsOf(known.values());
    }

    @Test void authoredCoverageUsesSevenPresetsAndThreeKindsWithoutInventingLookupCoverage() {
        var checkpoints = catalog.draftTopic("data-access-models").checkpoints();
        assertThat(checkpoints).extracting(GuidedCheckpoint::id).containsExactly(
                "tenant-groups-match", "scan-still-answers", "creation-first-extra-candidates", "global-query-changes-prefix",
                "new-id-old-business-key", "removed-business-rule", "accepted-maintenance", "read-after-insert");
        assertThat(checkpoints).extracting(GuidedCheckpoint::presetId).containsExactlyInAnyOrder(
                "baseline", "table-scan", "time-first", "global-range", "duplicate-key", "no-unique", "insert-order", "insert-order");
        assertThat(checkpoints.stream().map(c -> c.target().kind()).distinct()).containsExactlyInAnyOrder("TENANT_RANGE", "ALL_RANGE", "INSERT");
        assertThat(checkpoints.stream().map(c -> c.presetId()).distinct()).hasSize(7);
        for (var checkpoint : checkpoints) assertThat(checkpoint.tradeoff().options()).extracting(GuidedCheckpoint.Tradeoff.Option::id)
                .contains(checkpoint.tradeoff().recommendedOptionId());
    }

    @Test void unknownOperationOrWrongKindCannotResolveToAnOutcomeDespiteMatchingNarrationOrPosition() {
        var result = analyzer.run(preset("baseline").input());
        for (var target : List.of(
                new GuidedCheckpoint.Target(null, null, null, null, "missing", "TENANT_RANGE", 1),
                new GuidedCheckpoint.Target(null, null, null, null, "q1", "LOOKUP_ID", 1))) {
            assertThat(result.outcomes().stream().filter(o -> target.operationId().equals(o.operationId()) && target.kind().equals(o.kind().name()))).isEmpty();
        }
    }

    @Test void authoredAcceptedAndRejectedSequenceFactsReconcileWithTheirCompleteJavaWorkloads() {
        var accepted = analyzer.run(preset("insert-order").input());
        assertThat(accepted.outcomes().get(0).work()).isEqualTo(new Work(1, 0, 0, 0, 0, 0, 1, 1, 1, 1));
        assertThat(accepted.outcomes().get(1).returnedIds()).containsExactly("b2", "b5", "b3");
        assertThat(accepted.finalRows()).hasSize(13);
        var rejected = analyzer.run(preset("duplicate-key").input());
        assertThat(rejected.outcomes().get(0).conflict()).isEqualTo(new Conflict(ConflictReason.DUPLICATE_BUSINESS_KEY, "b2"));
        assertThat(rejected.outcomes().get(0).work()).isEqualTo(new Work(1, 0, 0, 0, 0, 0, 0, 0, 1, 0));
        assertThat(rejected.finalRows()).isEqualTo(rejected.input().rows());
        assertThat(rejected.outcomes().get(1).returnedIds()).containsExactly("b2", "b3");
        var baseline = analyzer.run(preset("baseline").input());
        assertThat(baseline.outcomes().get(0).work()).isEqualTo(new Work(0, 1, 2, 2, 2, 2, 0, 0, 0, 0));
        assertThat(baseline.outcomes().get(0).returnedIds()).containsExactly("b2", "b3");
    }
}
