package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.atomicity.AtomicityAnalyzer;
import com.hld.atomicity.AtomicityInput;
import com.hld.atomicity.AtomicityResult.Allocation;
import com.hld.atomicity.AtomicityResult.CheckSource;
import com.hld.atomicity.AtomicityResult.InvariantStatus;
import com.hld.atomicity.AtomicityResult.Invariants;
import com.hld.atomicity.AtomicityResult.Kind;
import com.hld.atomicity.AtomicityResult.Metrics;
import com.hld.atomicity.AtomicityResult.Phase;
import com.hld.atomicity.AtomicityResult.Reason;
import com.hld.atomicity.AtomicityResult.State;
import com.hld.atomicity.AtomicityResult.TransactionState;
import com.hld.catalog.CatalogService;
import com.hld.catalog.GuidedCheckpoint;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Check the authored claims against complete actual Java prefix states, not narrative parsing. */
@SpringBootTest
class AtomicityGuidedCheckpointsTest {
    @Autowired CatalogService catalog;
    @Autowired AtomicityController controller;
    @Autowired AtomicityAnalyzer analyzer;
    @Autowired ObjectMapper mapper;

    record Expected(String id, String preset, String step, Kind kind, int sequence,
            Integer checked, CheckSource source, Integer expectedRevision, Integer actualRevision,
            Reason reason, State state, Metrics metrics) {}

    private static TransactionState actor(String id, Phase phase, int applied, int pending,
            int baseRemaining, Integer workingRemaining, Reason reason) {
        return new TransactionState(id, 1, phase, applied, pending, baseRemaining, 0,
                workingRemaining, null, reason);
    }

    private static State state(int remaining, int allocated, int revision, boolean conserved,
            boolean abortedEffectsAbsent, int accounted, List<TransactionState> actors,
            List<Allocation> allocations) {
        return new State(remaining, allocated, revision, actors, allocations,
                new Invariants(true, true, conserved, abortedEffectsAbsent, accounted));
    }

    static Stream<Expected> checkpoints() {
        var stagedRow = List.of(new Allocation("a", 1, "record-a", "commit-a"));
        var splitRow = List.of(new Allocation("a", 1, "record-a", "record-a"));
        var stagedCommit = new Metrics(1, 0, 0, 0, 0, 1, InvariantStatus.PRESERVED, null);
        return Stream.of(
                new Expected("atomicity-split-abort-leaks", "baseline", "abort-a", Kind.TRANSACTION_ABORTED, 3,
                        null, null, null, null, Reason.USER_ABORT,
                        state(0, 0, 1, false, false, 0,
                                List.of(actor("a", Phase.ABORTED, 1, 0, 1, null, Reason.USER_ABORT)), List.of()),
                        new Metrics(0, 1, 0, 1, 0, 0, InvariantStatus.VIOLATED, "decrement-a")),
                new Expected("atomicity-private-abort-discards", "protected-baseline", "abort-a", Kind.TRANSACTION_ABORTED, 3,
                        null, null, null, null, Reason.USER_ABORT,
                        state(1, 0, 0, true, true, 1,
                                List.of(actor("a", Phase.ABORTED, 0, 0, 1, null, Reason.USER_ABORT)), List.of()),
                        new Metrics(0, 1, 0, 0, 1, 0, InvariantStatus.PRESERVED, null)),
                new Expected("atomicity-private-stock-is-not-public", "protected-commit", "decrement-a", Kind.STOCK_STAGED, 2,
                        1, CheckSource.WORKING_COPY, null, null, null,
                        state(1, 0, 0, true, true, 1,
                                List.of(actor("a", Phase.OPEN, 0, 1, 1, 0, null)), List.of()), stagedCommit),
                new Expected("atomicity-publish-pair", "protected-commit", "commit-a", Kind.TRANSACTION_COMMITTED, 4,
                        null, null, 0, 0, null,
                        state(0, 1, 1, true, true, 1,
                                List.of(actor("a", Phase.COMMITTED, 1, 0, 1, null, null)), stagedRow), stagedCommit),
                new Expected("atomicity-final-state-has-history", "split-commit", "commit-a", Kind.TRANSACTION_COMMITTED, 4,
                        null, null, null, null, null,
                        state(0, 1, 2, true, true, 1,
                                List.of(actor("a", Phase.COMMITTED, 1, 0, 1, null, null)), splitRow),
                        new Metrics(1, 0, 0, 0, 0, 1, InvariantStatus.VIOLATED, "decrement-a")),
                new Expected("atomicity-aborted-row-still-counts", "split-abort-after-record", "abort-a", Kind.TRANSACTION_ABORTED, 4,
                        null, null, null, null, Reason.USER_ABORT,
                        state(0, 1, 2, true, false, 1,
                                List.of(actor("a", Phase.ABORTED, 1, 0, 1, null, Reason.USER_ABORT)), splitRow),
                        new Metrics(0, 1, 0, 1, 0, 1, InvariantStatus.VIOLATED, "decrement-a")),
                new Expected("atomicity-blocked-work-is-skipped", "empty-stock", "record-a", Kind.WORK_SKIPPED, 3,
                        null, null, null, null, Reason.INSUFFICIENT_STOCK,
                        state(0, 0, 0, true, true, 0,
                                List.of(actor("a", Phase.BLOCKED, 0, 0, 0, 0, Reason.INSUFFICIENT_STOCK)), List.of()),
                        new Metrics(0, 1, 0, 0, 0, 0, InvariantStatus.PRESERVED, null)),
                new Expected("atomicity-conflict-with-spare-stock", "conservative-conflict", "commit-b", Kind.TRANSACTION_ABORTED, 8,
                        null, null, 0, 1, Reason.REVISION_CONFLICT,
                        state(2, 1, 1, true, true, 3, List.of(
                                actor("a", Phase.COMMITTED, 1, 0, 3, null, null),
                                actor("b", Phase.ABORTED, 0, 0, 3, null, Reason.REVISION_CONFLICT)), stagedRow),
                        new Metrics(1, 1, 1, 0, 2, 1, InvariantStatus.PRESERVED, null)));
    }

    @ParameterizedTest @MethodSource("checkpoints")
    void eachAuthoredTargetMatchesItsActualJavaPrefixAndSeparateWholeRunSummary(Expected expected) {
        var checkpoint = atomicityCheckpoints().stream().filter(c -> c.id().equals(expected.id())).findFirst().orElseThrow();
        assertThat(checkpoint.presetId()).isEqualTo(expected.preset());
        var target = checkpoint.target();
        assertThat(target.stepId()).isEqualTo(expected.step());
        assertThat(target.kind()).isEqualTo(expected.kind().name());
        assertThat(target.occurrence()).isEqualTo(1);
        assertThat(target.operation()).isNull(); assertThat(target.jobId()).isNull();
        assertThat(target.messageId()).isNull(); assertThat(target.attemptId()).isNull(); assertThat(target.operationId()).isNull();
        var preset = controller.descriptor().presets().stream().filter(p -> p.id().equals(checkpoint.presetId())).findFirst().orElseThrow();
        var result = analyzer.run(preset.input());
        var matches = result.outcomes().stream()
                .filter(o -> o.stepId().equals(target.stepId()) && o.kind().name().equals(target.kind())).toList();
        assertThat(matches).as(expected.id() + " exact semantic target").hasSize(1);
        var outcome = matches.get(0);
        var inputStep = preset.input().schedule().get(expected.sequence() - 1);
        assertThat(outcome.sequence()).isEqualTo(expected.sequence());
        assertThat(outcome.transactionId()).isEqualTo(inputStep.transactionId());
        assertThat(outcome.action()).isEqualTo(inputStep.action());
        assertThat(outcome.checkedRemaining()).isEqualTo(expected.checked());
        assertThat(outcome.checkSource()).isEqualTo(expected.source());
        assertThat(outcome.expectedRevision()).isEqualTo(expected.expectedRevision());
        assertThat(outcome.actualRevision()).isEqualTo(expected.actualRevision());
        assertThat(outcome.reason()).isEqualTo(expected.reason());
        assertThat(outcome.postState()).isEqualTo(expected.state());
        assertThat(result.metrics()).isEqualTo(expected.metrics());
        assertThat(result.finalState()).isEqualTo(result.outcomes().get(result.outcomes().size() - 1).postState());
        assertThat(result.input()).isEqualTo(preset.input());
        assertThat(result.simulationId()).isEqualTo(AtomicityAnalyzer.SIMULATION_ID);
        assertThat(result.schemaVersion()).isEqualTo("1.0");
        assertThat(result.modelVersion()).isEqualTo("1.0.0");
        assertThat(result.kind()).isEqualTo("analysis");
        assertThat(result.status()).isEqualTo("completed");
    }

    @Test void authoredCoverageKeepsEightDistinctAtomicityActivitiesAndTheOriginalEightReservationActivities() {
        var all = catalog.draftTopic("transactions-isolation").checkpoints();
        assertThat(all).hasSize(16);
        assertThat(all).extracting(GuidedCheckpoint::id).doesNotHaveDuplicates();
        assertThat(all.stream().filter(c -> c.simulationId().equals("transactions-isolation"))).hasSize(8);
        var checkpoints = atomicityCheckpoints();
        assertThat(checkpoints).extracting(GuidedCheckpoint::id).containsExactly(
                "atomicity-split-abort-leaks", "atomicity-private-abort-discards", "atomicity-private-stock-is-not-public",
                "atomicity-publish-pair", "atomicity-final-state-has-history", "atomicity-aborted-row-still-counts",
                "atomicity-blocked-work-is-skipped", "atomicity-conflict-with-spare-stock");
        assertThat(checkpoints.stream().map(GuidedCheckpoint::presetId).distinct()).containsExactlyInAnyOrder(
                "baseline", "protected-baseline", "protected-commit", "split-commit", "split-abort-after-record", "empty-stock", "conservative-conflict");
        assertThat(checkpoints.stream().map(c -> c.target().kind()).distinct()).containsExactlyInAnyOrder(
                "TRANSACTION_ABORTED", "STOCK_STAGED", "TRANSACTION_COMMITTED", "WORK_SKIPPED");
        assertThat(controller.descriptor().presets()).hasSize(8);
        for (var checkpoint : checkpoints) assertThat(checkpoint.tradeoff().options()).extracting(GuidedCheckpoint.Tradeoff.Option::id)
                .contains(checkpoint.tradeoff().recommendedOptionId());
    }

    @Test void selectedPrivateAndBlockedStatesDoNotBorrowTheirLaterTerminalState() {
        var commit = run("protected-commit");
        var privateStock = commit.outcomes().get(1).postState();
        assertThat(privateStock.remainingUnits()).isEqualTo(1);
        assertThat(privateStock.allocatedUnits()).isZero();
        assertThat(privateStock.transactions().get(0).workingRemaining()).isZero();
        assertThat(privateStock.transactions().get(0).pendingAllocation()).isNull();
        var prepared = commit.outcomes().get(2).postState();
        assertThat(prepared.transactions().get(0).pendingAllocation()).isEqualTo(
                new com.hld.atomicity.AtomicityResult.PendingAllocation("a", 1, "record-a"));
        assertThat(prepared.allocations()).isEmpty();
        assertThat(commit.finalState().transactions().get(0).workingRemaining()).isNull();
        assertThat(commit.metrics().committedTransactions()).isEqualTo(1);
        var empty = run("empty-stock");
        assertThat(empty.outcomes().get(2).postState().transactions().get(0).phase()).isEqualTo(Phase.BLOCKED);
        assertThat(empty.outcomes().get(2).postState().transactions().get(0).workingRemaining()).isZero();
        assertThat(empty.outcomes().get(3).action()).isEqualTo(AtomicityInput.Action.COMMIT);
        assertThat(empty.outcomes().get(3).kind()).isEqualTo(Kind.TRANSACTION_ABORTED);
        assertThat(empty.finalState().transactions().get(0).workingRemaining()).isNull();
        assertThat(empty.finalState().transactions().get(0).failureReason()).isEqualTo(Reason.INSUFFICIENT_STOCK);
    }

    @Test void conservationFinalFlagsAndAbortEffectHistoryRemainIndependentEvidence() {
        var repaired = run("split-commit");
        assertThat(repaired.outcomes().get(1).postState().invariants().unitsConserved()).isFalse();
        assertThat(repaired.finalState().invariants()).isEqualTo(new Invariants(true, true, true, true, 1));
        assertThat(repaired.metrics().firstViolationStepId()).isEqualTo("decrement-a");
        var aborted = run("split-abort-after-record");
        assertThat(aborted.finalState().invariants().unitsConserved()).isTrue();
        assertThat(aborted.finalState().invariants().abortedEffectsAbsent()).isFalse();
        assertThat(aborted.finalState().allocations()).hasSize(1);
        assertThat(aborted.metrics().abortedTransactionsWithEffects()).isEqualTo(1);
    }

    @Test void unknownStepWrongKindAndAnotherModelsKindNeverResolveByArrayPosition() {
        var result = run("protected-commit");
        for (var target : List.of(
                new GuidedCheckpoint.Target(null, null, null, null, null, "missing", "STOCK_STAGED", 1),
                new GuidedCheckpoint.Target(null, null, null, null, null, "decrement-a", "STOCK_APPLIED", 1),
                new GuidedCheckpoint.Target(null, null, null, null, null, "decrement-a", "RESERVATION_ACCEPTED", 1)))
            assertThat(result.outcomes().stream().filter(o -> target.stepId().equals(o.stepId()) && target.kind().equals(o.kind().name()))).isEmpty();
    }

    @Test void everyAuthoredSequenceSnapshotMatchesItsActualJavaStateIncludingAbsentPrivateValues() throws Exception {
        var paths = mapper.readTree(Files.readString(Path.of("../frontend/src/features/atomicity/atomicityAuthoredPaths.json")));
        assertThat(paths.isArray()).isTrue();
        assertThat(paths.size()).isEqualTo(3);
        var pathIds = new ArrayList<String>();
        int checkedStates = 0;
        for (JsonNode path : paths) {
            pathIds.add(path.path("id").asString());
            var result = run(path.path("presetId").asString());
            var expectedSteps = new ArrayList<String>();
            expectedSteps.add("initial");
            result.outcomes().forEach(outcome -> expectedSteps.add(outcome.stepId()));
            var authoredSteps = new ArrayList<String>();
            for (JsonNode step : path.path("steps")) {
                String id = step.path("id").asString();
                authoredSteps.add(id);
                State state = id.equals("initial") ? result.initialState()
                        : result.outcomes().stream().filter(outcome -> outcome.stepId().equals(id)).findFirst().orElseThrow().postState();
                String context = path.path("id").asString() + "/" + id;
                assertThat(step.path("remainingUnits").asInt()).as(context + " remaining").isEqualTo(state.remainingUnits());
                assertThat(step.path("allocatedUnits").asInt()).as(context + " allocated").isEqualTo(state.allocatedUnits());
                assertThat(step.path("revision").asInt()).as(context + " revision").isEqualTo(state.revision());
                assertThat(step.path("remainingNonnegative").asBoolean()).as(context + " nonnegative").isEqualTo(state.invariants().remainingNonnegative());
                assertThat(step.path("allocatedWithinCapacity").asBoolean()).as(context + " capacity").isEqualTo(state.invariants().allocatedWithinCapacity());
                assertThat(step.path("unitsConserved").asBoolean()).as(context + " conservation").isEqualTo(state.invariants().unitsConserved());
                assertThat(step.path("abortedEffectsAbsent").asBoolean()).as(context + " aborted effects").isEqualTo(state.invariants().abortedEffectsAbsent());
                var actorIds = new ArrayList<String>();
                for (JsonNode actor : step.path("actors")) {
                    String actorId = actor.path("id").asString();
                    actorIds.add(actorId);
                    var actual = state.transactions().stream().filter(transaction -> transaction.id().equals(actorId)).findFirst().orElseThrow();
                    assertThat(actor.path("phase").asString()).as(context + " " + actorId + " phase").isEqualTo(actual.phase().name());
                    assertThat(actor.path("pendingStockUnits").asInt()).as(context + " pending stock").isEqualTo(actual.pendingStockUnits());
                    assertThat(actor.path("pendingAllocation").asBoolean()).as(context + " pending record").isEqualTo(actual.pendingAllocation() != null);
                    assertThat(actor.path("appliedStockUnits").asInt()).as(context + " applied stock").isEqualTo(actual.appliedStockUnits());
                    assertThat(optionalInteger(actor, "baseRemaining")).as(context + " captured stock").isEqualTo(actual.baseRemaining());
                    assertThat(optionalInteger(actor, "baseRevision")).as(context + " captured revision").isEqualTo(actual.baseRevision());
                    assertThat(optionalInteger(actor, "workingRemaining")).as(context + " working stock").isEqualTo(actual.workingRemaining());
                    assertThat(actor.has("failureReason") ? actor.path("failureReason").asString() : null)
                            .as(context + " failure reason").isEqualTo(actual.failureReason() == null ? null : actual.failureReason().name());
                }
                assertThat(actorIds).as(context + " complete actor order").containsExactlyElementsOf(state.transactions().stream().map(TransactionState::id).toList());
                checkedStates++;
            }
            assertThat(authoredSteps).as(path.path("id").asString() + " full initial/post-step order").containsExactlyElementsOf(expectedSteps);
        }
        assertThat(pathIds).containsExactly("split-abort", "staged-publish", "conflict-discard");
        assertThat(checkedStates).isEqualTo(18);
    }

    private static Integer optionalInteger(JsonNode node, String field) {
        return node.has(field) ? node.path(field).asInt() : null;
    }

    private List<GuidedCheckpoint> atomicityCheckpoints() {
        return catalog.draftTopic("transactions-isolation").checkpoints().stream()
                .filter(c -> c.simulationId().equals(AtomicityAnalyzer.SIMULATION_ID)).toList();
    }

    private com.hld.atomicity.AtomicityResult run(String presetId) {
        return analyzer.run(controller.descriptor().presets().stream().filter(p -> p.id().equals(presetId)).findFirst().orElseThrow().input());
    }
}
