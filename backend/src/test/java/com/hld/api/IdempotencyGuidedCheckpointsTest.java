package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.catalog.CatalogService;
import com.hld.catalog.GuidedCheckpoint;
import com.hld.idempotency.IdempotencyInput;
import com.hld.idempotency.IdempotencyPresets;
import com.hld.idempotency.IdempotencyResult;
import com.hld.idempotency.IdempotencyResult.*;
import com.hld.idempotency.IdempotencySimulator;
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

/** Authored targets and every manual snapshot must agree with actual Java prefix evidence. */
@SpringBootTest
class IdempotencyGuidedCheckpointsTest {
    @Autowired CatalogService catalog;
    @Autowired IdempotencyController controller;
    @Autowired IdempotencySimulator simulator;
    @Autowired ObjectMapper mapper;

    record Expected(String id, String preset, String step, Kind kind, int sequence, int time,
            State state, Metrics wholeRunMetrics) {}

    private static Receipt receipt(String call) { return new Receipt("effect-" + call, 1); }
    private static Effect effect(String call, String operation, String tenant, int time) {
        return new Effect("effect-" + call, call, operation, tenant, 1, time);
    }
    private static KeyRecord key(String call, String tenant, String key, int created, KeyStatus status) {
        return new KeyRecord("record-" + call, tenant, key, 1, receipt(call), created, created + 100, status);
    }
    private static CallState call(String id, Phase phase, LookupDisposition lookup, String observed,
            String resolved, int pending, String ownEffect, Receipt receipt, Resolution resolution) {
        return new CallState(id, phase, lookup, observed, resolved, pending, ownEffect, receipt, resolution);
    }
    private static CallState executed(String id, Phase phase) {
        return call(id, phase, LookupDisposition.MISSING, null, "record-" + id, 0,
                "effect-" + id, receipt(id), Resolution.EXECUTED);
    }
    private static State state(List<CallState> calls, List<Effect> effects, List<KeyRecord> keys,
            int units, int active, int expired) {
        return new State(calls, effects, keys, units, active, expired);
    }

    static Stream<Expected> checkpoints() {
        var onlyEffect = List.of(effect("a", "op", "t", 0));
        var onlyKey = List.of(key("a", "t", "k", 0, KeyStatus.ACTIVE));
        var readyA = executed("a", Phase.RESULT_READY);
        return Stream.of(
                new Expected("idem-guided-response-ambiguity", "unprotected-response-loss", "lost-a", Kind.RESPONSE_LOST, 4, 0,
                        state(List.of(
                                call("a", Phase.RESPONSE_LOST, LookupDisposition.BYPASSED, null, null, 0, "effect-a", receipt("a"), Resolution.EXECUTED),
                                call("b", Phase.NOT_STARTED, null, null, null, 0, null, null, null)),
                                onlyEffect, List.of(), 1, 0, 0),
                        new Metrics(2, 1, 2, 2, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 10)),
                new Expected("idem-guided-original-receipt", "atomic-response-loss", "respond-b", Kind.RESPONSE_RECEIVED, 8, 10,
                        state(List.of(executed("a", Phase.RESPONSE_LOST),
                                call("b", Phase.RESPONDED, LookupDisposition.MATCHED, "record-a", "record-a", 0, null, receipt("a"), Resolution.REPLAYED)),
                                onlyEffect, onlyKey, 1, 1, 0),
                        new Metrics(2, 1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 10)),
                new Expected("idem-guided-crash-gap", "split-crash-gap", "lookup-b", Kind.LOOKUP_MISSED, 4, 10,
                        state(List.of(
                                call("a", Phase.CRASHED, LookupDisposition.MISSING, null, null, 0, "effect-a", null, null),
                                call("b", Phase.LOOKED_UP, LookupDisposition.MISSING, null, null, 0, null, null, null)),
                                onlyEffect, List.of(), 1, 0, 0),
                        new Metrics(2, 1, 2, 2, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 10)),
                new Expected("idem-guided-late-save-conflict", "split-race", "save-b", Kind.RESULT_SAVE_CONFLICT, 6, 0,
                        state(List.of(readyA,
                                call("b", Phase.RESULT_READY, LookupDisposition.MISSING, null, "record-a", 0, "effect-b", null, Resolution.RESULT_SAVE_CONFLICT)),
                                List.of(effect("a", "op", "t", 0), effect("b", "op", "t", 0)), onlyKey, 2, 1, 0),
                        new Metrics(2, 1, 2, 2, 1, 1, 1, 0, 0, 0, 1, 2, 0, 0, 0, 1, 1)),
                new Expected("idem-guided-current-key-recheck", "atomic-race", "save-b", Kind.REPLAYED_AT_COMMIT, 6, 0,
                        state(List.of(readyA,
                                call("b", Phase.RESULT_READY, LookupDisposition.MISSING, null, "record-a", 0, null, receipt("a"), Resolution.REPLAYED)),
                                onlyEffect, onlyKey, 1, 1, 0),
                        new Metrics(2, 1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 2, 0, 0, 0, 2, 1)),
                new Expected("idem-guided-payload-race", "atomic-payload-race", "save-b", Kind.CONFLICT_AT_COMMIT, 6, 0,
                        state(List.of(readyA,
                                call("b", Phase.RESULT_READY, LookupDisposition.MISSING, null, "record-a", 0, null, null, Resolution.PAYLOAD_CONFLICT)),
                                List.of(effect("a", "op-one", "t", 0)), onlyKey, 1, 1, 0),
                        new Metrics(2, 2, 1, 1, 0, 0, 1, 0, 0, 1, 0, 2, 0, 0, 0, 1, 1)),
                new Expected("idem-guided-retention-equality", "retention-boundary", "save-c", Kind.ATOMIC_COMMITTED, 11, 100,
                        state(List.of(executed("a", Phase.RESPONDED),
                                call("b", Phase.RESPONDED, LookupDisposition.MATCHED, "record-a", "record-a", 0, null, receipt("a"), Resolution.REPLAYED),
                                executed("c", Phase.RESULT_READY)),
                                List.of(effect("a", "op", "t", 0), effect("c", "op", "t", 100)),
                                List.of(key("a", "t", "k", 0, KeyStatus.EXPIRED), key("c", "t", "k", 100, KeyStatus.ACTIVE)), 2, 1, 1),
                        new Metrics(3, 1, 2, 2, 1, 1, 1, 1, 1, 0, 0, 3, 0, 0, 0, 3, 100)),
                new Expected("idem-guided-key-tenant-scope", "key-and-tenant-scope", "respond-c", Kind.RESPONSE_RECEIVED, 12, 20,
                        state(List.of(executed("a", Phase.RESPONDED), executed("b", Phase.RESPONDED), executed("c", Phase.RESPONDED)),
                                List.of(effect("a", "op", "t", 0), effect("b", "op", "t", 10), effect("c", "op", "other", 20)),
                                List.of(key("a", "t", "k", 0, KeyStatus.ACTIVE), key("b", "t", "new", 10, KeyStatus.ACTIVE),
                                        key("c", "other", "k", 20, KeyStatus.ACTIVE)), 3, 3, 0),
                        new Metrics(3, 2, 3, 3, 1, 1, 3, 0, 0, 0, 0, 3, 0, 0, 0, 3, 20)));
    }

    @ParameterizedTest @MethodSource("checkpoints")
    void eachTargetResolvesOneExactJavaPrefixWithIndependentWholeRunMetrics(Expected expected) {
        var checkpoint = catalog.draftTopic("idempotency").checkpoints().stream()
                .filter(row -> row.id().equals(expected.id())).findFirst().orElseThrow();
        assertThat(checkpoint.simulationId()).isEqualTo(IdempotencySimulator.SIMULATION_ID);
        assertThat(checkpoint.presetId()).isEqualTo(expected.preset());
        var target = checkpoint.target();
        assertThat(target.stepId()).isEqualTo(expected.step());
        assertThat(target.kind()).isEqualTo(expected.kind().name());
        assertThat(target.occurrence()).isEqualTo(1);
        assertThat(target.operation()).isNull(); assertThat(target.jobId()).isNull();
        assertThat(target.messageId()).isNull(); assertThat(target.attemptId()).isNull();
        assertThat(target.operationId()).isNull(); assertThat(target.requestId()).isNull();
        var preset = controller.descriptor().presets().stream().filter(row -> row.id().equals(expected.preset())).findFirst().orElseThrow();
        var result = simulator.run(preset.input());
        var resolved = matches(result, target);
        assertThat(resolved).as(expected.id() + " exact semantic target").hasSize(1);
        var outcome = resolved.get(0);
        assertThat(outcome.sequence()).isEqualTo(expected.sequence());
        assertThat(outcome.timeMs()).isEqualTo(expected.time());
        var step = preset.input().schedule().stream().filter(row -> row.id().equals(expected.step())).findFirst().orElseThrow();
        assertThat(outcome.callId()).isEqualTo(step.callId());
        assertThat(outcome.action()).isEqualTo(step.action());
        assertThat(outcome.postState()).isEqualTo(expected.state());
        // Whole-run metrics are checked independently; the selected prefix must not display them.
        assertThat(result.metrics()).isEqualTo(expected.wholeRunMetrics());
        assertThat(result.input()).isEqualTo(preset.input());
        assertThat(result.finalState()).isEqualTo(result.outcomes().get(result.outcomes().size() - 1).postState());
        assertThat(result.schemaVersion()).isEqualTo("1.0");
        assertThat(result.modelVersion()).isEqualTo("1.0.0");
        assertThat(result.kind()).isEqualTo("simulation");
        assertThat(result.status()).isEqualTo("completed");
    }

    @Test void eightDistinctActivitiesUseExistingPresetsAndPreserveTheNinePracticeAnswerIdentities() {
        var detail = catalog.draftTopic("idempotency");
        var checkpoints = detail.checkpoints();
        assertThat(checkpoints).extracting(GuidedCheckpoint::id).containsExactlyElementsOf(checkpoints().map(Expected::id).toList());
        assertThat(checkpoints).hasSize(8);
        assertThat(checkpoints).extracting(GuidedCheckpoint::presetId).doesNotHaveDuplicates();
        assertThat(detail.questions()).hasSize(9);
        assertThat(detail.topic().contentVersion()).isEqualTo("1.1.0");
        assertThat(detail.topic().capabilities()).containsExactlyInAnyOrder("study", "simulation", "guided", "practice");
        assertThat(controller.descriptor().presets()).hasSize(9);
        assertThat(checkpoints).allSatisfy(checkpoint -> {
            assertThat(checkpoint.simulationId()).isEqualTo("idempotency");
            assertThat(IdempotencyPresets.all()).anyMatch(preset -> preset.id().equals(checkpoint.presetId()));
            assertThat(checkpoint.id()).hasSizeLessThanOrEqualTo(100 - "-prediction".length());
            assertThat(detail.questions()).noneMatch(question -> question.id().equals(checkpoint.id() + "-prediction")
                    || question.id().equals(checkpoint.id() + "-tradeoff"));
            assertThat(checkpoint.tradeoff().options()).extracting(GuidedCheckpoint.Tradeoff.Option::id)
                    .doesNotHaveDuplicates().contains(checkpoint.tradeoff().recommendedOptionId());
        });
    }

    @Test void earlyEvidenceDoesNotBorrowLaterEffectsReceiptsOrResponses() {
        var unprotected = run("unprotected-response-loss");
        var lost = unprotected.outcomes().get(3).postState();
        assertThat(lost.effects()).hasSize(1);
        assertThat(lost.calls().get(1).phase()).isEqualTo(Phase.NOT_STARTED);
        assertThat(unprotected.finalState().effects()).hasSize(2);
        var crash = run("split-crash-gap");
        assertThat(crash.outcomes().get(3).postState().keyRecords()).isEmpty();
        assertThat(crash.outcomes().get(3).postState().effects()).hasSize(1);
        assertThat(crash.finalState().effects()).hasSize(2);
        var split = run("split-race");
        assertThat(split.outcomes().get(5).postState().calls()).allSatisfy(call -> assertThat(call.phase()).isEqualTo(Phase.RESULT_READY));
        assertThat(split.finalState().calls()).allSatisfy(call -> assertThat(call.phase()).isEqualTo(Phase.RESPONDED));
        assertThat(split.finalState().calls().get(1).receipt()).isNull();
        assertThat(split.metrics().responsesReceived()).isEqualTo(2);
        assertThat(split.metrics().receiptsReceived()).isEqualTo(1);
    }

    @Test void privatePreparationAndCurrentKeyResolutionPreserveEarlierLookupHistory() {
        var race = run("atomic-race");
        var prepared = race.outcomes().get(3).postState();
        assertThat(prepared.effects()).isEmpty();
        assertThat(prepared.calls()).extracting(CallState::pendingUnits).containsExactly(1, 1);
        var firstPublication = race.outcomes().get(4).postState();
        assertThat(firstPublication.effects()).hasSize(1);
        assertThat(firstPublication.calls().get(1).pendingUnits()).isEqualTo(1);
        var replay = race.outcomes().get(5).postState().calls().get(1);
        assertThat(replay.lookupDisposition()).isEqualTo(LookupDisposition.MISSING);
        assertThat(replay.observedRecordId()).isNull();
        assertThat(replay.resolvedRecordId()).isEqualTo("record-a");
        assertThat(replay.pendingUnits()).isZero();
        assertThat(replay.publishedEffectId()).isNull();
        assertThat(replay.receipt()).isEqualTo(receipt("a"));
        assertThat(replay.phase()).isEqualTo(Phase.RESULT_READY);
        var conflict = run("atomic-payload-race");
        assertThat(conflict.outcomes().get(4).postState().calls().get(1).pendingUnits()).isEqualTo(2);
        var rejected = conflict.outcomes().get(5).postState().calls().get(1);
        assertThat(rejected.pendingUnits()).isZero();
        assertThat(rejected.receipt()).isNull(); assertThat(rejected.publishedEffectId()).isNull();
        assertThat(rejected.resolution()).isEqualTo(Resolution.PAYLOAD_CONFLICT);
        assertThat(conflict.outcomes().get(5).postState().effects()).hasSize(1);
    }

    @Test void expiryEqualityKeepsOldEffectsAndEarlierReplayedReceiptHistory() {
        var retention = run("retention-boundary");
        var beforeExpiry = retention.outcomes().get(7).postState();
        assertThat(beforeExpiry.keyRecords()).containsExactly(key("a", "t", "k", 0, KeyStatus.ACTIVE));
        assertThat(beforeExpiry.calls().get(1).receipt()).isEqualTo(receipt("a"));
        var equality = retention.outcomes().get(8);
        assertThat(equality.timeMs()).isEqualTo(100);
        assertThat(equality.kind()).isEqualTo(Kind.LOOKUP_MISSED);
        assertThat(equality.postState().effects()).hasSize(1);
        assertThat(equality.postState().keyRecords()).containsExactly(key("a", "t", "k", 0, KeyStatus.EXPIRED));
        var published = retention.outcomes().get(10).postState();
        assertThat(published.effects()).extracting(Effect::id).containsExactly("effect-a", "effect-c");
        assertThat(published.calls().get(1).receipt()).isEqualTo(receipt("a"));
        assertThat(published.calls().get(2).phase()).isEqualTo(Phase.RESULT_READY);
        assertThat(published.calls().get(2).receipt()).isEqualTo(receipt("c"));
    }

    @Test void missingStepWrongKindOtherModelAndForeignSelectorFamiliesNeverResolveByPosition() {
        var result = run("atomic-race");
        for (var target : List.of(
                new GuidedCheckpoint.Target(null, null, null, null, null, "missing", "REPLAYED_AT_COMMIT", 1),
                new GuidedCheckpoint.Target(null, null, null, null, null, "save-b", "ATOMIC_COMMITTED", 1),
                new GuidedCheckpoint.Target(null, null, null, null, null, "save-b", "TRANSACTION_COMMITTED", 1),
                new GuidedCheckpoint.Target(null, null, null, null, "q1", "TENANT_RANGE", 1),
                new GuidedCheckpoint.Target(null, null, null, null, null, null, "a", "REQUEST_SUCCEEDED", 1)))
            assertThat(matches(result, target)).isEmpty();
        assertThat(matches(result, new GuidedCheckpoint.Target(null, null, null, null, null, "save-b", "REPLAYED_AT_COMMIT", 1))).hasSize(1);
    }

    @Test void allTwentySevenAuthoredStatesAndTheirCompleteOrderMatchActualJavaWithoutNullOrFutureFacts() throws Exception {
        var paths = mapper.readTree(Files.readString(Path.of("../frontend/src/features/idempotency/idempotencyAuthoredPaths.json")));
        assertThat(paths.isArray()).isTrue();
        assertThat(paths.size()).isEqualTo(3);
        var pathIds = new ArrayList<String>();
        var presetIds = new ArrayList<String>();
        int checkedStates = 0;
        for (JsonNode path : paths) {
            assertThat(path.propertyNames()).containsExactlyInAnyOrder("id", "title", "presetId", "summary", "takeaway", "steps");
            pathIds.add(path.path("id").asString()); presetIds.add(path.path("presetId").asString());
            var result = run(path.path("presetId").asString());
            var expectedOrder = new ArrayList<String>(); expectedOrder.add("initial");
            result.outcomes().forEach(outcome -> expectedOrder.add(outcome.stepId()));
            var authoredOrder = new ArrayList<String>();
            for (JsonNode step : path.path("steps")) {
                String id = step.path("id").asString(); authoredOrder.add(id);
                String context = path.path("id").asString() + "/" + id;
                State expectedState;
                if (id.equals("initial")) {
                    assertThat(step.propertyNames()).as(context).containsExactlyInAnyOrder("id", "title", "from", "to", "detail", "sequence", "timeMs", "state");
                    assertThat(step.path("sequence").asInt()).isZero();
                    assertThat(step.path("timeMs").asInt()).isZero();
                    expectedState = result.initialState();
                } else {
                    assertThat(step.propertyNames()).as(context).containsExactlyInAnyOrder("id", "title", "from", "to", "detail", "sequence", "timeMs", "kind", "callId", "state");
                    var actual = result.outcomes().stream().filter(outcome -> outcome.stepId().equals(id)).findFirst().orElseThrow();
                    assertThat(step.path("sequence").asInt()).as(context).isEqualTo(actual.sequence());
                    assertThat(step.path("timeMs").asInt()).as(context).isEqualTo(actual.timeMs());
                    assertThat(step.path("kind").asString()).as(context).isEqualTo(actual.kind().name());
                    assertThat(step.path("callId").asString()).as(context).isEqualTo(actual.callId());
                    expectedState = actual.postState();
                }
                assertThat(mapper.treeToValue(step.path("state"), State.class)).as(context + " complete typed state").isEqualTo(expectedState);
                assertThat(step.path("state")).as(context + " exact absent/present serialized facts").isEqualTo(mapper.valueToTree(expectedState));
                for (String text : List.of("title", "from", "to", "detail")) assertThat(step.path(text).asString()).as(context + " " + text).isNotBlank();
                checkedStates++;
            }
            assertThat(authoredOrder).as(path.path("id").asString() + " complete initial/post-step order").containsExactlyElementsOf(expectedOrder);
        }
        assertThat(pathIds).containsExactly("idem-path-atomic-response-loss", "idem-path-split-race", "idem-path-atomic-race");
        assertThat(presetIds).containsExactly("atomic-response-loss", "split-race", "atomic-race");
        assertThat(checkedStates).isEqualTo(27);
    }

    private IdempotencyResult run(String presetId) {
        return simulator.run(controller.descriptor().presets().stream().filter(preset -> preset.id().equals(presetId)).findFirst().orElseThrow().input());
    }
    private static List<Outcome> matches(IdempotencyResult result, GuidedCheckpoint.Target target) {
        if (target.stepId() == null) return List.of();
        return result.outcomes().stream().filter(outcome -> outcome.stepId().equals(target.stepId())
                && outcome.kind().name().equals(target.kind())).toList();
    }
}
