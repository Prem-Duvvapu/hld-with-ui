package com.hld.idempotency;

import static com.hld.idempotency.IdempotencyTestInputs.*;
import static org.assertj.core.api.Assertions.assertThat;

import com.hld.idempotency.IdempotencyInput.Action;
import com.hld.idempotency.IdempotencyInput.Mode;
import com.hld.idempotency.IdempotencyResult.*;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

class IdempotencySimulatorTest {
    private final IdempotencySimulator simulator = new IdempotencySimulator();

    static Stream<Arguments> canonicalResults() {
        return Stream.of(
                Arguments.of("unprotected-response-loss", new Metrics(2, 1, 2, 2, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 10)),
                Arguments.of("split-crash-gap", new Metrics(2, 1, 2, 2, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 10)),
                Arguments.of("split-race", new Metrics(2, 1, 2, 2, 1, 1, 1, 0, 0, 0, 1, 2, 0, 0, 0, 1, 1)),
                Arguments.of("atomic-response-loss", new Metrics(2, 1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 10)),
                Arguments.of("atomic-race", new Metrics(2, 1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 2, 0, 0, 0, 2, 1)),
                Arguments.of("payload-conflict", new Metrics(2, 2, 1, 1, 0, 0, 1, 0, 0, 1, 0, 2, 0, 0, 0, 1, 10)),
                Arguments.of("atomic-payload-race", new Metrics(2, 2, 1, 1, 0, 0, 1, 0, 0, 1, 0, 2, 0, 0, 0, 1, 1)),
                Arguments.of("retention-boundary", new Metrics(3, 1, 2, 2, 1, 1, 1, 1, 1, 0, 0, 3, 0, 0, 0, 3, 100)),
                Arguments.of("key-and-tenant-scope", new Metrics(3, 2, 3, 3, 1, 1, 3, 0, 0, 0, 0, 3, 0, 0, 0, 3, 20)));
    }

    @ParameterizedTest(name = "{0}") @MethodSource("canonicalResults")
    void ninePresetsReconcileEveryWholeRunPopulationWithoutConfusingResponsesAndEffects(String id, Metrics expected) {
        var input = preset(id);
        var run = simulator.run(input);
        assertThat(run.simulationId()).isEqualTo("idempotency");
        assertThat(run.schemaVersion()).isEqualTo("1.0");
        assertThat(run.modelVersion()).isEqualTo("1.0.0");
        assertThat(run.kind()).isEqualTo("simulation");
        assertThat(run.status()).isEqualTo("completed");
        assertThat(run.input()).isEqualTo(input);
        assertThat(run.metrics()).isEqualTo(expected);
        assertThat(run.outcomes()).hasSize(input.schedule().size());
        assertThat(run.finalState()).isEqualTo(run.outcomes().get(run.outcomes().size() - 1).postState());
        assertThat(run.initialState().effects()).isEmpty();
        assertThat(run.initialState().keyRecords()).isEmpty();
        assertThat(run.initialState().calls()).allSatisfy(c -> {
            assertThat(c.phase()).isEqualTo(Phase.NOT_STARTED);
            assertThat(c.pendingUnits()).isZero();
            assertThat(c.receipt()).isNull();
        });
    }

    @Test void onlyProtectionModeChangesTheLostResponseOutcomeForIdenticalCallsAndSchedule() {
        var baseline = preset("unprotected-response-loss");
        var none = simulator.run(baseline);
        var split = simulator.run(inMode(baseline, Mode.SPLIT_EFFECT_RECORD));
        var atomic = simulator.run(inMode(baseline, Mode.ATOMIC_EFFECT_RECORD));
        assertThat(none.finalState().effects()).extracting(Effect::id).containsExactly("effect-a", "effect-b");
        assertThat(none.finalState().keyRecords()).isEmpty();
        assertThat(stateCall(none.finalState(), "b").receipt()).isEqualTo(new Receipt("effect-b", 1));
        for (var protectedRun : List.of(split, atomic)) {
            assertThat(protectedRun.input().calls()).isEqualTo(baseline.calls());
            assertThat(protectedRun.input().schedule()).isEqualTo(baseline.schedule());
            assertThat(protectedRun.finalState().effects()).extracting(Effect::id).containsExactly("effect-a");
            assertThat(stateCall(protectedRun.finalState(), "a").phase()).isEqualTo(Phase.RESPONSE_LOST);
            assertThat(stateCall(protectedRun.finalState(), "b").phase()).isEqualTo(Phase.RESPONDED);
            assertThat(stateCall(protectedRun.finalState(), "b").receipt()).isEqualTo(new Receipt("effect-a", 1));
            assertThat(stateCall(protectedRun.finalState(), "b").publishedEffectId()).isNull();
            assertThat(protectedRun.metrics().responsesLost()).isEqualTo(1);
            assertThat(protectedRun.metrics().receiptsReceived()).isEqualTo(1);
        }
    }

    @Test void anInsertConflictCannotEraseTheEffectAlreadyPublishedByTheSplitLoser() {
        var run = simulator.run(preset("split-race"));
        var beforeSave = run.outcomes().get(3).postState();
        assertThat(beforeSave.effects()).extracting(Effect::id).containsExactly("effect-a", "effect-b");
        assertThat(beforeSave.keyRecords()).isEmpty();
        assertThat(stateCall(beforeSave, "a").lookupDisposition()).isEqualTo(LookupDisposition.MISSING);
        assertThat(stateCall(beforeSave, "b").lookupDisposition()).isEqualTo(LookupDisposition.MISSING);
        var winner = run.outcomes().get(4).postState().keyRecords().get(0);
        var loser = run.outcomes().get(5);
        assertThat(loser.kind()).isEqualTo(Kind.RESULT_SAVE_CONFLICT);
        assertThat(loser.postState().effects()).isEqualTo(beforeSave.effects());
        assertThat(loser.postState().keyRecords()).containsExactly(winner);
        assertThat(winner.receipt()).isEqualTo(new Receipt("effect-a", 1));
        var b = stateCall(loser.postState(), "b");
        assertThat(b.publishedEffectId()).isEqualTo("effect-b");
        assertThat(b.receipt()).isNull();
        assertThat(b.resolution()).isEqualTo(Resolution.RESULT_SAVE_CONFLICT);
        assertThat(b.observedRecordId()).isNull();
        assertThat(b.resolvedRecordId()).isEqualTo("record-a");
        assertThat(b.phase()).isEqualTo(Phase.RESULT_READY);
        assertThat(run.metrics().responsesReceived()).isEqualTo(2);
        assertThat(run.metrics().receiptsReceived()).isEqualTo(1);
    }

    @Test void atomicPublicationRechecksTheCurrentKeyAndKeepsEarlierLookupEvidenceUnchanged() {
        var input = preset("split-race");
        var run = simulator.run(inMode(input, Mode.ATOMIC_EFFECT_RECORD));
        var prepared = run.outcomes().get(3).postState();
        assertThat(prepared.effects()).isEmpty();
        assertThat(prepared.keyRecords()).isEmpty();
        assertThat(stateCall(prepared, "a").pendingUnits()).isEqualTo(1);
        assertThat(stateCall(prepared, "b").pendingUnits()).isEqualTo(1);
        var firstCommit = run.outcomes().get(4);
        assertThat(firstCommit.kind()).isEqualTo(Kind.ATOMIC_COMMITTED);
        assertThat(firstCommit.postState().effects()).extracting(Effect::id).containsExactly("effect-a");
        assertThat(firstCommit.postState().keyRecords()).extracting(KeyRecord::id).containsExactly("record-a");
        assertThat(stateCall(firstCommit.postState(), "b").pendingUnits()).isEqualTo(1);
        var recheck = run.outcomes().get(5);
        assertThat(recheck.kind()).isEqualTo(Kind.REPLAYED_AT_COMMIT);
        assertThat(recheck.postState().effects()).isEqualTo(firstCommit.postState().effects());
        var b = stateCall(recheck.postState(), "b");
        assertThat(b.lookupDisposition()).isEqualTo(LookupDisposition.MISSING);
        assertThat(b.observedRecordId()).isNull();
        assertThat(b.resolvedRecordId()).isEqualTo("record-a");
        assertThat(b.pendingUnits()).isZero();
        assertThat(b.publishedEffectId()).isNull();
        assertThat(b.receipt()).isEqualTo(new Receipt("effect-a", 1));
        assertThat(b.resolution()).isEqualTo(Resolution.REPLAYED);
    }

    @Test void changedPayloadIsRejectedAtLookupOrPublicationWithoutPublishingTheConflictingEffect() {
        var atLookup = simulator.run(preset("payload-conflict"));
        assertThat(atLookup.outcomes().get(4).kind()).isEqualTo(Kind.LOOKUP_CONFLICT);
        assertThat(atLookup.outcomes().get(5).kind()).isEqualTo(Kind.ACTION_SKIPPED);
        assertThat(atLookup.outcomes().get(6).kind()).isEqualTo(Kind.ACTION_SKIPPED);
        assertThat(stateCall(atLookup.finalState(), "b").observedRecordId()).isEqualTo("record-a");
        var atCommit = simulator.run(preset("atomic-payload-race"));
        assertThat(stateCall(atCommit.outcomes().get(3).postState(), "b").pendingUnits()).isEqualTo(2);
        assertThat(atCommit.outcomes().get(5).kind()).isEqualTo(Kind.CONFLICT_AT_COMMIT);
        assertThat(stateCall(atCommit.finalState(), "b").observedRecordId()).isNull();
        for (var run : List.of(atLookup, atCommit)) {
            var b = stateCall(run.finalState(), "b");
            assertThat(b.resolution()).isEqualTo(Resolution.PAYLOAD_CONFLICT);
            assertThat(b.resolvedRecordId()).isEqualTo("record-a");
            assertThat(b.receipt()).isNull();
            assertThat(b.pendingUnits()).isZero();
            assertThat(b.publishedEffectId()).isNull();
            assertThat(run.finalState().effects()).extracting(Effect::id).containsExactly("effect-a");
            assertThat(run.finalState().publishedUnits()).isEqualTo(1);
            assertThat(run.finalState().keyRecords().get(0).units()).isEqualTo(1);
        }
    }

    @ParameterizedTest @ValueSource(ints = {99, 100, 101})
    void retentionBeforeEqualityAndAfterEqualityChangesKeyProtectionButNeverErasesOldEffects(int retryAt) {
        var input = configured(c -> {
            c.calls = List.of(call("a", "op", "t", "k", 1), call("b", "op", "t", "k", 1));
            c.schedule = joined(full("a", 0, Action.RESPOND), full("b", retryAt, Action.RESPOND));
        });
        var run = simulator.run(input);
        var original = run.finalState().keyRecords().get(0);
        assertThat(original.createdAtMs()).isZero();
        assertThat(original.expiresAtMs()).isEqualTo(100);
        assertThat(run.finalState().effects().get(0).id()).isEqualTo("effect-a");
        assertThat(run.metrics().finalTimeMs()).isEqualTo(retryAt);
        if (retryAt < 100) {
            assertThat(original.status()).isEqualTo(KeyStatus.ACTIVE);
            assertThat(run.finalState().effects()).hasSize(1);
            assertThat(stateCall(run.finalState(), "b").receipt()).isEqualTo(new Receipt("effect-a", 1));
        } else {
            assertThat(original.status()).isEqualTo(KeyStatus.EXPIRED);
            assertThat(run.finalState().effects()).extracting(Effect::id).containsExactly("effect-a", "effect-b");
            assertThat(run.finalState().keyRecords().get(1).expiresAtMs()).isEqualTo(retryAt + 100);
            assertThat(stateCall(run.finalState(), "b").receipt()).isEqualTo(new Receipt("effect-b", 1));
            assertThat(run.metrics().extraEffects()).isEqualTo(1);
        }
    }

    @Test void retentionStartsAtPublicationAndAReplayNeverRefreshesIt() {
        var input = configured(c -> {
            c.calls = List.of(call("a", "op", "t", "k", 1), call("b", "op", "t", "k", 1));
            c.schedule = joined(List.of(step("lookup-a", "a", 0, Action.LOOKUP),
                    step("write-a", "a", 1, Action.WRITE_EFFECT), step("save-a", "a", 50, Action.SAVE_RESULT),
                    step("finish-a", "a", 50, Action.RESPOND)), full("b", 149, Action.RESPOND));
        });
        var run = simulator.run(input);
        assertThat(run.finalState().keyRecords()).hasSize(1);
        assertThat(run.finalState().keyRecords().get(0).createdAtMs()).isEqualTo(50);
        assertThat(run.finalState().keyRecords().get(0).expiresAtMs()).isEqualTo(150);
        assertThat(run.metrics().finalTimeMs()).isEqualTo(149);
        assertThat(run.metrics().replayedCalls()).isEqualTo(1);
    }

    @Test void aCachedReceiptCanCrossExpiryAndNewPublicationWithoutRewritingItsHistoricalObservation() {
        var input = configured(c -> {
            c.calls = List.of(call("a", "op", "t", "k", 1), call("b", "op", "t", "k", 1), call("c", "op", "t", "k", 1));
            c.schedule = joined(full("a", 0, Action.RESPOND),
                    List.of(step("lookup-b", "b", 99, Action.LOOKUP)), full("c", 100, Action.RESPOND),
                    List.of(step("write-b", "b", 100, Action.WRITE_EFFECT), step("save-b", "b", 100, Action.SAVE_RESULT),
                            step("finish-b", "b", 100, Action.RESPOND)));
        });
        var run = simulator.run(input);
        var b = stateCall(run.finalState(), "b");
        assertThat(b.lookupDisposition()).isEqualTo(LookupDisposition.MATCHED);
        assertThat(b.observedRecordId()).isEqualTo("record-a");
        assertThat(b.resolvedRecordId()).isEqualTo("record-a");
        assertThat(b.receipt()).isEqualTo(new Receipt("effect-a", 1));
        assertThat(b.publishedEffectId()).isNull();
        assertThat(stateCall(run.finalState(), "c").receipt()).isEqualTo(new Receipt("effect-c", 1));
        assertThat(run.finalState().effects()).extracting(Effect::id).containsExactly("effect-a", "effect-c");
        assertThat(run.finalState().keyRecords()).extracting(KeyRecord::status).containsExactly(KeyStatus.EXPIRED, KeyStatus.ACTIVE);
        assertThat(run.outcomes().get(9).kind()).isEqualTo(Kind.ACTION_SKIPPED);
        assertThat(run.outcomes().get(10).kind()).isEqualTo(Kind.ACTION_SKIPPED);
    }

    @ParameterizedTest @EnumSource(Mode.class)
    void aHandlerCrashAfterWorkPreservesOnlyAlreadyPublishedData(Mode mode) {
        var run = simulator.run(inMode(preset("split-crash-gap"), mode));
        var crash = run.outcomes().get(2);
        var a = stateCall(crash.postState(), "a");
        assertThat(crash.kind()).isEqualTo(Kind.HANDLER_CRASHED);
        assertThat(a.phase()).isEqualTo(Phase.CRASHED);
        assertThat(a.pendingUnits()).isZero();
        assertThat(a.receipt()).isNull();
        assertThat(a.lookupDisposition()).isEqualTo(mode == Mode.NO_DEDUP ? LookupDisposition.BYPASSED : LookupDisposition.MISSING);
        assertThat(crash.postState().effects()).hasSize(mode == Mode.ATOMIC_EFFECT_RECORD ? 0 : 1);
        assertThat(crash.postState().keyRecords()).isEmpty();
        assertThat(run.metrics().publishedEffects()).isEqualTo(mode == Mode.ATOMIC_EFFECT_RECORD ? 1 : 2);
        assertThat(run.metrics().crashedCallsWithEffects()).isEqualTo(mode == Mode.ATOMIC_EFFECT_RECORD ? 0 : 1);
    }

    @ParameterizedTest @ValueSource(ints = {1, 2, 3})
    void atomicHandlerCrashAtEachBoundaryClearsPrivateDataWithoutFabricatingAResponse(int crashAfter) {
        var actions = List.of(Action.LOOKUP, Action.WRITE_EFFECT, Action.SAVE_RESULT);
        var schedule = new ArrayList<IdempotencyInput.Step>();
        for (int i = 0; i < crashAfter; i++) schedule.add(step("work-" + i, "a", 0, actions.get(i)));
        schedule.add(step("crash-a", "a", 0, Action.CRASH_HANDLER));
        schedule.addAll(full("b", 10, Action.RESPOND));
        var run = simulator.run(configured(c -> {
            c.calls = List.of(call("a", "op", "t", "k", 1), call("b", "op", "t", "k", 1)); c.schedule = schedule;
        }));
        var a = stateCall(run.finalState(), "a");
        assertThat(a.pendingUnits()).isZero(); assertThat(a.receipt()).isNull();
        assertThat(a.phase()).isEqualTo(Phase.CRASHED);
        assertThat(run.metrics().publishedEffects()).isEqualTo(1);
        assertThat(run.metrics().responsesReceived()).isEqualTo(1);
        assertThat(run.metrics().responsesLost()).isZero();
        assertThat(run.metrics().receiptsReceived()).isEqualTo(1);
        if (crashAfter == 3) {
            assertThat(a.resolution()).isEqualTo(Resolution.EXECUTED);
            assertThat(a.publishedEffectId()).isEqualTo("effect-a");
            assertThat(a.resolvedRecordId()).isEqualTo("record-a");
            assertThat(stateCall(run.finalState(), "b").receipt()).isEqualTo(new Receipt("effect-a", 1));
        } else {
            assertThat(a.resolution()).isNull();
            assertThat(a.publishedEffectId()).isNull();
            assertThat(stateCall(run.finalState(), "b").receipt()).isEqualTo(new Receipt("effect-b", 1));
        }
    }

    @Test void crashingAfterCachedReplayRetainsServerHistoryWithoutClaimingItsCallerReceivedAReceipt() {
        var input = configured(c -> {
            c.calls = List.of(call("a", "op", "t", "k", 1), call("b", "op", "t", "k", 1));
            c.schedule = joined(full("a", 0, Action.RESPOND), full("b", 10, Action.CRASH_HANDLER));
        });
        var run = simulator.run(input);
        var b = stateCall(run.finalState(), "b");
        assertThat(b.phase()).isEqualTo(Phase.CRASHED);
        assertThat(b.resolution()).isEqualTo(Resolution.REPLAYED);
        assertThat(b.observedRecordId()).isEqualTo("record-a");
        assertThat(b.resolvedRecordId()).isEqualTo("record-a");
        assertThat(b.receipt()).isNull();
        assertThat(b.publishedEffectId()).isNull();
        assertThat(run.metrics().replayedCalls()).isEqualTo(1);
        assertThat(run.metrics().crashedCallsWithEffects()).isZero();
        assertThat(run.metrics().receiptsReceived()).isEqualTo(1);
        assertThat(run.metrics().responsesReceived()).isEqualTo(1);
        assertThat(run.finalState().effects()).extracting(Effect::id).containsExactly("effect-a");
    }

    @Test void freshKeysExecuteTheSameAuditedIntentAndTenantScopeNeverUsesAmbiguousConcatenation() {
        var scope = simulator.run(preset("key-and-tenant-scope"));
        assertThat(scope.finalState().effects()).extracting(Effect::id).containsExactly("effect-a", "effect-b", "effect-c");
        assertThat(scope.metrics().logicalOperations()).isEqualTo(2);
        assertThat(scope.metrics().extraEffects()).isEqualTo(1);
        var ambiguous = configured(c -> {
            c.calls = List.of(call("a", "op", "t-x", "k", 1), call("b", "op", "t", "x-k", 1));
            c.schedule = joined(full("a", 0, Action.RESPOND), full("b", 10, Action.RESPOND));
        });
        var run = simulator.run(ambiguous);
        assertThat(run.finalState().keyRecords()).hasSize(2);
        assertThat(run.metrics().logicalOperations()).isEqualTo(2);
        assertThat(run.metrics().extraEffects()).isZero();
        assertThat(stateCall(run.finalState(), "a").receipt()).isEqualTo(new Receipt("effect-a", 1));
        assertThat(stateCall(run.finalState(), "b").receipt()).isEqualTo(new Receipt("effect-b", 1));
        var auditTuple = simulator.run(configured(c -> {
            c.calls = List.of(call("a", "o", "t-x", "k-a", 1), call("b", "x-o", "t", "k-b", 1));
            c.schedule = ambiguous.schedule();
        }));
        assertThat(auditTuple.metrics().logicalOperations()).isEqualTo(2);
    }

    @Test void identicalPayloadsCanRepresentDifferentIntentsButTheRetainedKeyStillControlsServerReplay() {
        var run = simulator.run(configured(c -> {
            c.calls = List.of(call("a", "first-intent", "t", "k", 1), call("b", "second-intent", "t", "k", 1));
            c.schedule = joined(full("a", 0, Action.RESPOND), full("b", 10, Action.RESPOND));
        }));
        assertThat(run.metrics().logicalOperations()).isEqualTo(2);
        assertThat(run.metrics().publishedEffects()).isEqualTo(1);
        assertThat(stateCall(run.finalState(), "b").resolution()).isEqualTo(Resolution.REPLAYED);
        assertThat(stateCall(run.finalState(), "b").receipt()).isEqualTo(new Receipt("effect-a", 1));
    }

    @ParameterizedTest @EnumSource(Mode.class)
    void theMaximumCompleteProgramRemainsBoundedAndDoesNotWaitForFutureExpiry(Mode mode) {
        var run = simulator.run(maximum(mode));
        assertThat(run.outcomes()).hasSize(48);
        assertThat(run.finalState().effects()).hasSize(12);
        assertThat(run.finalState().publishedUnits()).isEqualTo(12000);
        assertThat(run.metrics().finalTimeMs()).isEqualTo(10000);
        assertThat(run.finalState().calls()).allSatisfy(c -> {
            assertThat(c.id()).hasSize(32);
            assertThat(c.phase()).isEqualTo(Phase.RESPONDED);
            assertThat(c.pendingUnits()).isZero();
            assertThat(c.publishedEffectId()).hasSize(39);
            assertThat(c.receipt().units()).isEqualTo(1000);
        });
        if (mode == Mode.NO_DEDUP) assertThat(run.finalState().keyRecords()).isEmpty();
        else assertThat(run.finalState().keyRecords()).allSatisfy(record -> {
            assertThat(record.id()).hasSize(39);
            assertThat(record.status()).isEqualTo(KeyStatus.ACTIVE);
            assertThat(record.createdAtMs()).isEqualTo(10000);
            assertThat(record.expiresAtMs()).isEqualTo(20000);
        });
    }

    private static CallState stateCall(State state, String id) {
        return state.calls().stream().filter(c -> c.id().equals(id)).findFirst().orElseThrow();
    }
}
