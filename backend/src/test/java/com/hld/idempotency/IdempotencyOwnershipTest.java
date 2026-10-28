package com.hld.idempotency;

import static com.hld.idempotency.IdempotencyTestInputs.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.idempotency.IdempotencyInput.Action;
import com.hld.idempotency.IdempotencyResult.*;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;

class IdempotencyOwnershipTest {
    @Test void inputsAndEachSnapshotDefensivelyOwnTheirListsAndEarlierHistoryNeverChanges() {
        var calls = new ArrayList<>(List.of(call("a", "op", "t", "k", 1)));
        var schedule = new ArrayList<>(full("a", 0, Action.RESPOND));
        var input = configured(c -> { c.calls = calls; c.schedule = schedule; });
        calls.clear(); schedule.clear();
        assertThat(input.calls()).hasSize(1);
        assertThat(input.schedule()).hasSize(4);
        assertThatThrownBy(() -> input.calls().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> input.schedule().clear()).isInstanceOf(UnsupportedOperationException.class);
        var run = new IdempotencySimulator().run(preset("retention-boundary"));
        assertThatThrownBy(() -> run.outcomes().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> run.assumptions().clear()).isInstanceOf(UnsupportedOperationException.class);
        var states = new ArrayList<State>();
        states.add(run.initialState()); states.add(run.finalState());
        run.outcomes().forEach(outcome -> states.add(outcome.postState()));
        for (var state : states) {
            assertThatThrownBy(() -> state.calls().clear()).isInstanceOf(UnsupportedOperationException.class);
            assertThatThrownBy(() -> state.effects().clear()).isInstanceOf(UnsupportedOperationException.class);
            assertThatThrownBy(() -> state.keyRecords().clear()).isInstanceOf(UnsupportedOperationException.class);
        }
        var publicAtFirstCommit = run.outcomes().get(2).postState();
        assertThat(publicAtFirstCommit.keyRecords()).hasSize(1);
        assertThat(publicAtFirstCommit.keyRecords().get(0).status()).isEqualTo(KeyStatus.ACTIVE);
        assertThat(publicAtFirstCommit.effects()).extracting(Effect::id).containsExactly("effect-a");
        assertThat(run.finalState().keyRecords().get(0).status()).isEqualTo(KeyStatus.EXPIRED);
        assertThat(run.finalState().effects()).extracting(Effect::id).containsExactly("effect-a", "effect-c");
        assertThat(run.initialState().calls()).allSatisfy(c -> assertThat(c.phase()).isEqualTo(Phase.NOT_STARTED));
        assertThat(run.initialState().effects()).isEmpty();
        assertThat(run.initialState().publishedUnits()).isZero();
        var ownedCalls = new ArrayList<>(publicAtFirstCommit.calls());
        var ownedEffects = new ArrayList<>(publicAtFirstCommit.effects());
        var ownedRecords = new ArrayList<>(publicAtFirstCommit.keyRecords());
        var copied = new State(ownedCalls, ownedEffects, ownedRecords, publicAtFirstCommit.publishedUnits(),
                publicAtFirstCommit.activeKeyCount(), publicAtFirstCommit.expiredKeyCount());
        ownedCalls.clear(); ownedEffects.clear(); ownedRecords.clear();
        assertThat(copied).isEqualTo(publicAtFirstCommit);
        var ownedOutcomes = new ArrayList<>(run.outcomes());
        var ownedAssumptions = new ArrayList<>(run.assumptions());
        var copiedRun = new IdempotencyResult(run.simulationId(), run.schemaVersion(), run.modelVersion(),
                run.kind(), run.status(), run.input(), run.initialState(), ownedOutcomes, run.finalState(), run.metrics(), ownedAssumptions);
        ownedOutcomes.clear(); ownedAssumptions.clear();
        assertThat(copiedRun).isEqualTo(run);
    }

    @Test void repeatedAndConcurrentCallsToOneSimulatorNeverSharePrivateOrPublishedRunState() throws Exception {
        var simulator = new IdempotencySimulator();
        var presets = IdempotencyPresets.all();
        var expected = presets.stream().map(p -> simulator.run(p.input())).toList();
        var executor = Executors.newFixedThreadPool(4);
        try {
            List<Callable<IdempotencyResult>> tasks = new ArrayList<>();
            for (int i = 0; i < 36; i++) {
                var input = presets.get(i % presets.size()).input();
                tasks.add(() -> simulator.run(input));
            }
            var results = executor.invokeAll(tasks);
            for (int i = 0; i < results.size(); i++)
                assertThat(results.get(i).get()).isEqualTo(expected.get(i % expected.size()));
        } finally { executor.shutdownNow(); }
        for (int i = 0; i < presets.size(); i++)
            assertThat(simulator.run(presets.get(i).input())).isEqualTo(expected.get(i));
    }

    @Test void everyReturnedReferenceAndPopulationReconcilesAtEachActualAuthoredStep() {
        for (var preset : IdempotencyPresets.all()) {
            var run = new IdempotencySimulator().run(preset.input());
            var ids = preset.input().calls().stream().map(IdempotencyInput.Call::id).toList();
            for (int index = 0; index < run.outcomes().size(); index++) {
                var outcome = run.outcomes().get(index);
                var submitted = preset.input().schedule().get(index);
                assertThat(outcome.sequence()).isEqualTo(index + 1);
                assertThat(outcome.stepId()).isEqualTo(submitted.id());
                assertThat(outcome.callId()).isEqualTo(submitted.callId());
                assertThat(outcome.timeMs()).isEqualTo(submitted.timeMs());
                assertThat(outcome.action()).isEqualTo(submitted.action());
                var state = outcome.postState();
                assertThat(state.calls()).extracting(CallState::id).containsExactlyElementsOf(ids);
                assertThat(state.effects()).extracting(Effect::id).doesNotHaveDuplicates();
                assertThat(state.keyRecords()).extracting(KeyRecord::id).doesNotHaveDuplicates();
                assertThat(state.publishedUnits()).isEqualTo(state.effects().stream().mapToInt(Effect::units).sum());
                assertThat(state.activeKeyCount()).isEqualTo(Math.toIntExact(state.keyRecords().stream().filter(k -> k.status() == KeyStatus.ACTIVE).count()));
                assertThat(state.expiredKeyCount()).isEqualTo(Math.toIntExact(state.keyRecords().stream().filter(k -> k.status() == KeyStatus.EXPIRED).count()));
                Map<List<String>, Integer> activeCounts = new HashMap<>();
                for (var record : state.keyRecords()) {
                    var effect = state.effects().stream().filter(e -> e.id().equals(record.receipt().effectId())).findFirst().orElseThrow();
                    assertThat(effect.tenantId()).isEqualTo(record.tenantId());
                    assertThat(effect.units()).isEqualTo(record.units());
                    assertThat(record.receipt().units()).isEqualTo(record.units());
                    assertThat(record.expiresAtMs()).isEqualTo(record.createdAtMs() + preset.input().retentionMs());
                    assertThat(record.status()).isEqualTo(outcome.timeMs() >= record.expiresAtMs() ? KeyStatus.EXPIRED : KeyStatus.ACTIVE);
                    if (record.status() == KeyStatus.ACTIVE)
                        activeCounts.merge(List.of(record.tenantId(), record.key()), 1, Integer::sum);
                }
                assertThat(activeCounts.values()).allSatisfy(count -> assertThat(count).isEqualTo(1));
                for (var call : state.calls()) {
                    if (call.receipt() != null) {
                        var effect = state.effects().stream().filter(e -> e.id().equals(call.receipt().effectId())).findFirst().orElseThrow();
                        assertThat(effect.units()).isEqualTo(call.receipt().units());
                    }
                    if (call.publishedEffectId() != null)
                        assertThat(state.effects()).anySatisfy(e -> {
                            assertThat(e.id()).isEqualTo(call.publishedEffectId());
                            assertThat(e.callId()).isEqualTo(call.id());
                        });
                    for (String reference : new String[]{call.observedRecordId(), call.resolvedRecordId()})
                        if (reference != null) assertThat(state.keyRecords()).extracting(KeyRecord::id).contains(reference);
                    if (call.phase() == Phase.CRASHED) {
                        assertThat(call.pendingUnits()).isZero();
                        assertThat(call.receipt()).isNull();
                    }
                }
            }
            assertThat(run.outcomes()).hasSizeLessThanOrEqualTo(48);
            assertThat(run.finalState().effects()).hasSizeLessThanOrEqualTo(12);
            assertThat(run.finalState().keyRecords()).hasSizeLessThanOrEqualTo(12);
            assertThat(run.metrics().finalTimeMs()).isEqualTo(preset.input().schedule().get(preset.input().schedule().size() - 1).timeMs());
        }
    }
}
