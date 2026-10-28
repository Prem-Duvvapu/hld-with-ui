package com.hld.idempotency;

import com.hld.idempotency.IdempotencyInput.Mode;
import com.hld.idempotency.IdempotencyResult.CallState;
import com.hld.idempotency.IdempotencyResult.Effect;
import com.hld.idempotency.IdempotencyResult.KeyRecord;
import com.hld.idempotency.IdempotencyResult.KeyStatus;
import com.hld.idempotency.IdempotencyResult.Kind;
import com.hld.idempotency.IdempotencyResult.LookupDisposition;
import com.hld.idempotency.IdempotencyResult.Metrics;
import com.hld.idempotency.IdempotencyResult.Outcome;
import com.hld.idempotency.IdempotencyResult.Phase;
import com.hld.idempotency.IdempotencyResult.Receipt;
import com.hld.idempotency.IdempotencyResult.Resolution;
import com.hld.idempotency.IdempotencyResult.State;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Pure finite logical interleaving. Every mutable object belongs to one execution. */
public class IdempotencySimulator {
    public static final String SIMULATION_ID = "idempotency";
    public static final List<String> ASSUMPTIONS = List.of(
            "This is an illustrative add-units endpoint, not a database, payment, provider or broker implementation.",
            "The complete authored schedule determines virtual time and equal-time order; no threads, clocks or randomness decide outcomes.",
            "Server duplicate lookup uses the typed tenant/key pair for one fixed endpoint; operationId is audit-only intent metadata.",
            "A lookup miss is an observation, not permission to publish a later protected effect without rechecking.",
            "Atomic mode privately prepares work, then rechecks the current key and publishes its effect and retained receipt in one transition.",
            "Split mode publishes the effect first; losing the later insert-if-absent result save cannot undo that effect.",
            "Key protection expires at time greater than or equal to its publication time plus retention; replay does not refresh retention.",
            "Expired key rows remain only as teaching history and cannot protect new calls; their public ledger effects remain.",
            "A cached replay decision can still return its original receipt after the key expires, without performing another write.",
            "Response loss hides the response from its caller; it does not undo published data or change the original stored receipt.",
            "A modeled handler crash clears private units and its cached receipt only; retained public data and recorded observations remain by model rule.",
            "Changed keys or retention expiry can permit repeated intended work; extra effects are evidence, not a universal invariant violation.",
            "Completed means every validated program step was evaluated; no actual SQL isolation, physical durability, crash recovery or exactly-once guarantee follows.");

    public IdempotencyResult run(IdempotencyInput input) {
        IdempotencyValidator.validate(input);
        Execution execution = new Execution(input);
        State initial = execution.snapshot();
        List<Outcome> outcomes = new ArrayList<>();
        for (var step : input.schedule()) {
            execution.advanceTo(step.timeMs());
            Actor actor = execution.actors.get(step.callId());
            Evidence evidence = execution.apply(actor, step);
            outcomes.add(new Outcome(outcomes.size() + 1, step.id(), step.callId(), step.timeMs(),
                    step.action(), evidence.kind(), execution.snapshot(), evidence.explanation()));
        }
        check(outcomes.size() <= IdempotencyInput.MAX_STEPS, "outcome bound");
        State finalState = outcomes.get(outcomes.size() - 1).postState();
        return new IdempotencyResult(SIMULATION_ID, IdempotencyInput.SCHEMA_VERSION,
                IdempotencyInput.MODEL_VERSION, "simulation", "completed", input, initial,
                outcomes, finalState, execution.metrics(finalState), ASSUMPTIONS);
    }

    private static final class Execution {
        private final IdempotencyInput input;
        private final Map<String, Actor> actors = new LinkedHashMap<>();
        private final List<Effect> effects = new ArrayList<>();
        private final List<KeyRecord> records = new ArrayList<>();
        private final Map<ScopedKey, Integer> activeKeys = new HashMap<>();
        private int currentTime;

        private Execution(IdempotencyInput input) {
            this.input = input;
            for (var call : input.calls()) actors.put(call.id(), new Actor(call));
        }

        private void advanceTo(int time) {
            currentTime = time;
            for (int index = 0; index < records.size(); index++) {
                KeyRecord record = records.get(index);
                if (record.status() == KeyStatus.ACTIVE && time >= record.expiresAtMs()) {
                    records.set(index, new KeyRecord(record.id(), record.tenantId(), record.key(),
                            record.units(), record.receipt(), record.createdAtMs(),
                            record.expiresAtMs(), KeyStatus.EXPIRED));
                    check(activeKeys.remove(new ScopedKey(record.tenantId(), record.key()), index),
                            "expiring record must own its active scoped key");
                }
            }
        }

        private Evidence apply(Actor actor, IdempotencyInput.Step step) {
            return switch (step.action()) {
                case LOOKUP -> lookup(actor);
                case WRITE_EFFECT -> writeEffect(actor);
                case SAVE_RESULT -> saveResult(actor);
                case RESPOND -> respond(actor, false);
                case LOSE_RESPONSE -> respond(actor, true);
                case CRASH_HANDLER -> crash(actor);
            };
        }

        private Evidence lookup(Actor actor) {
            actor.phase = Phase.LOOKED_UP;
            if (input.mode() == Mode.NO_DEDUP) {
                actor.lookupDisposition = LookupDisposition.BYPASSED;
                return evidence(Kind.LOOKUP_BYPASSED,
                        "Call " + actor.call.id() + " does not check or reserve a retained key in unprotected mode.");
            }
            KeyRecord record = currentRecord(actor);
            if (record == null) {
                actor.lookupDisposition = LookupDisposition.MISSING;
                return evidence(Kind.LOOKUP_MISSED,
                        "Call " + actor.call.id() + " finds no active result for its tenant/key. This observation does not reserve the key.");
            }
            actor.observedRecordId = record.id();
            actor.resolvedRecordId = record.id();
            if (record.units() == actor.call.units()) {
                actor.lookupDisposition = LookupDisposition.MATCHED;
                actor.resolution = Resolution.REPLAYED;
                actor.receipt = record.receipt();
                return evidence(Kind.LOOKUP_REPLAYED,
                        "Call " + actor.call.id() + " remembers the original receipt for "
                                + actor.receipt.effectId() + "; no new effect is needed.");
            }
            actor.lookupDisposition = LookupDisposition.CONFLICT;
            actor.resolution = Resolution.PAYLOAD_CONFLICT;
            return evidence(Kind.LOOKUP_CONFLICT,
                    "Call " + actor.call.id() + " uses a retained tenant/key with different units. Its work is rejected without a new effect.");
        }

        private Evidence writeEffect(Actor actor) {
            actor.phase = Phase.WORK_DONE;
            if (actor.resolution != null) {
                return evidence(Kind.ACTION_SKIPPED,
                        "Call " + actor.call.id() + " skips work because its lookup already resolved as "
                                + actor.resolution + ". No effect is prepared or published.");
            }
            if (input.mode() == Mode.ATOMIC_EFFECT_RECORD) {
                actor.pendingUnits = actor.call.units();
                return evidence(Kind.EFFECT_PREPARED,
                        "Call " + actor.call.id() + " prepares " + actor.pendingUnits
                                + " units privately. Neither the ledger nor a retained key changes yet.");
            }
            Effect effect = publishEffect(actor);
            return evidence(Kind.EFFECT_PUBLISHED,
                    "Call " + actor.call.id() + " publishes " + effect.units() + " units as "
                            + effect.id() + " before saving any retained result.");
        }

        private Evidence saveResult(Actor actor) {
            actor.phase = Phase.RESULT_READY;
            if (actor.resolution != null) {
                return evidence(Kind.ACTION_SKIPPED,
                        "Call " + actor.call.id() + " keeps its earlier " + actor.resolution
                                + " decision. It does not publish work or refresh key retention.");
            }
            if (input.mode() == Mode.NO_DEDUP) {
                actor.receipt = ownReceipt(actor);
                actor.resolution = Resolution.EXECUTED;
                return evidence(Kind.RESULT_READY,
                        "Call " + actor.call.id() + " prepares a response for its own "
                                + actor.receipt.effectId() + ". No duplicate-protection record is stored.");
            }
            KeyRecord current = currentRecord(actor);
            if (input.mode() == Mode.SPLIT_EFFECT_RECORD) {
                if (current != null) {
                    actor.resolvedRecordId = current.id();
                    actor.resolution = Resolution.RESULT_SAVE_CONFLICT;
                    return evidence(Kind.RESULT_SAVE_CONFLICT,
                            "Call " + actor.call.id() + " cannot insert its result because "
                                    + current.id() + " already owns the active key. Its earlier "
                                    + actor.publishedEffectId + " remains public and is not undone.");
                }
                actor.receipt = ownReceipt(actor);
                storeRecord(actor, actor.receipt);
                actor.resolution = Resolution.EXECUTED;
                return evidence(Kind.RESULT_STORED,
                        "Call " + actor.call.id() + " stores its published effect's receipt as "
                                + actor.resolvedRecordId + ". The separate earlier write remains a distinct boundary.");
            }

            check(input.mode() == Mode.ATOMIC_EFFECT_RECORD, "supported protection mode");
            check(actor.pendingUnits == actor.call.units(), "atomic publication needs private prepared work");
            if (current != null) {
                actor.pendingUnits = 0;
                actor.resolvedRecordId = current.id();
                if (current.units() == actor.call.units()) {
                    actor.receipt = current.receipt();
                    actor.resolution = Resolution.REPLAYED;
                    return evidence(Kind.REPLAYED_AT_COMMIT,
                            "Call " + actor.call.id() + " rechecks the current key, discards private work and reuses "
                                    + actor.receipt.effectId() + ". Its earlier missing-key observation is only history.");
                }
                actor.resolution = Resolution.PAYLOAD_CONFLICT;
                return evidence(Kind.CONFLICT_AT_COMMIT,
                        "Call " + actor.call.id() + " rechecks the current key and finds different units. Private work is discarded; no new effect is published.");
            }

            // There is no intervening callback or snapshot inside this publication boundary.
            publishEffect(actor);
            actor.receipt = ownReceipt(actor);
            storeRecord(actor, actor.receipt);
            actor.pendingUnits = 0;
            actor.resolution = Resolution.EXECUTED;
            return evidence(Kind.ATOMIC_COMMITTED,
                    "Call " + actor.call.id() + " rechecks the absent key and publishes "
                            + actor.publishedEffectId + " and " + actor.resolvedRecordId
                            + " together. Its receipt is retained without a separate write gap.");
        }

        private Evidence respond(Actor actor, boolean lost) {
            actor.phase = lost ? Phase.RESPONSE_LOST : Phase.RESPONDED;
            if (lost) {
                return evidence(Kind.RESPONSE_LOST,
                        "Call " + actor.call.id() + " does not receive its ready response. Public effects and retained results stay unchanged.");
            }
            if (actor.receipt != null) {
                return evidence(Kind.RESPONSE_RECEIVED,
                        "Call " + actor.call.id() + " receives the receipt for "
                                + actor.receipt.effectId() + " containing " + actor.receipt.units() + " units.");
            }
            return evidence(Kind.RESPONSE_RECEIVED,
                    "Call " + actor.call.id() + " receives the " + actor.resolution
                            + " error, not a receipt. Receiving an error does not undo an already published effect.");
        }

        private Evidence crash(Actor actor) {
            actor.phase = Phase.CRASHED;
            actor.pendingUnits = 0;
            actor.receipt = null;
            return evidence(Kind.HANDLER_CRASHED,
                    "Call " + actor.call.id() + " stops. Its private units and cached response are discarded; public ledger effects, retained results and prior observations remain as modeled history.");
        }

        private KeyRecord currentRecord(Actor actor) {
            Integer index = activeKeys.get(new ScopedKey(actor.call.tenantId(), actor.call.key()));
            return index == null ? null : records.get(index);
        }

        private Effect publishEffect(Actor actor) {
            check(actor.publishedEffectId == null, "each call publishes at most one effect");
            Effect effect = new Effect("effect-" + actor.call.id(), actor.call.id(),
                    actor.call.operationId(), actor.call.tenantId(), actor.call.units(), currentTime);
            effects.add(effect);
            actor.publishedEffectId = effect.id();
            return effect;
        }

        private Receipt ownReceipt(Actor actor) {
            check(actor.publishedEffectId != null, "a new receipt needs a published effect");
            return new Receipt(actor.publishedEffectId, actor.call.units());
        }

        private void storeRecord(Actor actor, Receipt receipt) {
            ScopedKey key = new ScopedKey(actor.call.tenantId(), actor.call.key());
            check(!activeKeys.containsKey(key), "result publication must not overwrite an active key");
            KeyRecord record = new KeyRecord("record-" + actor.call.id(), actor.call.tenantId(),
                    actor.call.key(), actor.call.units(), receipt, currentTime,
                    currentTime + input.retentionMs(), KeyStatus.ACTIVE);
            activeKeys.put(key, records.size());
            records.add(record);
            actor.resolvedRecordId = record.id();
        }

        private State snapshot() {
            verifyStructure();
            int units = effects.stream().mapToInt(Effect::units).sum();
            int active = activeKeys.size();
            return new State(actors.values().stream().map(Actor::snapshot).toList(), effects,
                    records, units, active, records.size() - active);
        }

        private Metrics metrics(State state) {
            Set<OperationKey> operations = new HashSet<>();
            Map<OperationKey, Integer> effectCounts = new HashMap<>();
            for (var call : input.calls()) operations.add(new OperationKey(call.tenantId(), call.operationId()));
            for (Effect effect : effects) effectCounts.merge(
                    new OperationKey(effect.tenantId(), effect.operationId()), 1, Integer::sum);
            int repeated = 0, extra = 0;
            for (int count : effectCounts.values()) {
                if (count > 1) repeated++;
                extra += Math.max(0, count - 1);
            }
            int replayed = 0, payloadConflicts = 0, saveConflicts = 0;
            int received = 0, lost = 0, crashed = 0, crashedWithEffects = 0, receipts = 0;
            for (Actor actor : actors.values()) {
                if (actor.resolution == Resolution.REPLAYED) replayed++;
                if (actor.resolution == Resolution.PAYLOAD_CONFLICT) payloadConflicts++;
                if (actor.resolution == Resolution.RESULT_SAVE_CONFLICT) saveConflicts++;
                if (actor.phase == Phase.RESPONDED) {
                    received++;
                    if (actor.receipt != null) receipts++;
                }
                if (actor.phase == Phase.RESPONSE_LOST) lost++;
                if (actor.phase == Phase.CRASHED) {
                    crashed++;
                    if (actor.publishedEffectId != null) crashedWithEffects++;
                }
            }
            return new Metrics(actors.size(), operations.size(), effects.size(), state.publishedUnits(),
                    repeated, extra, state.activeKeyCount(), state.expiredKeyCount(), replayed,
                    payloadConflicts, saveConflicts, received, lost, crashed, crashedWithEffects,
                    receipts, currentTime);
        }

        private void verifyStructure() {
            check(effects.size() <= IdempotencyInput.MAX_CALLS && records.size() <= IdempotencyInput.MAX_CALLS,
                    "published collection bounds");
            Map<String, Effect> byEffect = new HashMap<>();
            int totalUnits = 0;
            for (Effect effect : effects) {
                Actor owner = actors.get(effect.callId());
                check(owner != null && byEffect.putIfAbsent(effect.id(), effect) == null,
                        "effects have unique identities and configured owners");
                check(effect.id().equals("effect-" + owner.call.id())
                                && effect.tenantId().equals(owner.call.tenantId())
                                && effect.operationId().equals(owner.call.operationId())
                                && effect.units() == owner.call.units()
                                && effect.publishedAtMs() >= 0 && effect.publishedAtMs() <= currentTime,
                        "effect facts match their actual publishing call");
                totalUnits += effect.units();
            }
            check(totalUnits <= IdempotencyInput.MAX_PUBLISHED_UNITS, "published units bound");
            Map<String, KeyRecord> byRecord = new HashMap<>();
            Set<ScopedKey> active = new HashSet<>();
            for (int index = 0; index < records.size(); index++) {
                KeyRecord record = records.get(index);
                check(byRecord.putIfAbsent(record.id(), record) == null, "retained record identities are unique");
                Effect effect = byEffect.get(record.receipt().effectId());
                check(effect != null && record.units() == effect.units()
                                && record.receipt().units() == effect.units()
                                && record.tenantId().equals(effect.tenantId())
                                && record.id().equals("record-" + effect.callId())
                                && record.key().equals(actors.get(effect.callId()).call.key()),
                        "retained receipt and scoped payload reference their original effect");
                check(record.createdAtMs() >= effect.publishedAtMs() && record.createdAtMs() <= currentTime
                                && record.expiresAtMs() == record.createdAtMs() + input.retentionMs()
                                && record.expiresAtMs() <= IdempotencyInput.MAX_EXPIRES_AT_MS,
                        "retention starts at result publication");
                ScopedKey key = new ScopedKey(record.tenantId(), record.key());
                if (record.status() == KeyStatus.ACTIVE) {
                    check(currentTime < record.expiresAtMs() && active.add(key)
                                    && Objects.equals(activeKeys.get(key), index),
                            "one unexpired active result owns each typed scoped key");
                } else {
                    check(currentTime >= record.expiresAtMs(), "expired rows are historical only");
                }
            }
            check(active.size() == activeKeys.size(), "active-key index matches retained history");
            check(input.mode() != Mode.NO_DEDUP || records.isEmpty(), "unprotected mode retains no key records");
            for (Actor actor : actors.values()) {
                check(actor.pendingUnits == 0 || (input.mode() == Mode.ATOMIC_EFFECT_RECORD
                                && actor.phase == Phase.WORK_DONE && actor.resolution == null
                                && actor.pendingUnits == actor.call.units()),
                        "pending work is private atomic preparation only");
                if (actor.publishedEffectId != null) {
                    Effect effect = byEffect.get(actor.publishedEffectId);
                    check(effect != null && effect.callId().equals(actor.call.id()),
                            "publishedEffectId belongs to this call, not a replayed call");
                }
                if (actor.receipt != null) {
                    Effect effect = byEffect.get(actor.receipt.effectId());
                    check(effect != null && effect.tenantId().equals(actor.call.tenantId())
                                    && effect.units() == actor.call.units() && actor.receipt.units() == effect.units(),
                            "cached receipt refers to an existing effect with the same scoped payload");
                }
                verifyRecordReference(actor, actor.observedRecordId, byRecord);
                verifyRecordReference(actor, actor.resolvedRecordId, byRecord);
                if (actor.phase == Phase.CRASHED) {
                    check(actor.pendingUnits == 0 && actor.receipt == null, "crashed calls retain no private work or receipt");
                }
                if (actor.resolution == Resolution.EXECUTED) {
                    check(actor.publishedEffectId != null && (actor.phase == Phase.CRASHED
                                    || actor.receipt != null && actor.receipt.effectId().equals(actor.publishedEffectId)),
                            "executed resolution retains its own published effect history");
                } else if (actor.resolution == Resolution.REPLAYED) {
                    check(actor.publishedEffectId == null && actor.resolvedRecordId != null
                                    && (actor.phase == Phase.CRASHED || actor.receipt != null),
                            "replay reuses a retained receipt without publishing its own effect");
                } else if (actor.resolution == Resolution.PAYLOAD_CONFLICT) {
                    check(actor.publishedEffectId == null && actor.receipt == null && actor.resolvedRecordId != null,
                            "payload rejection publishes no effect or receipt");
                } else if (actor.resolution == Resolution.RESULT_SAVE_CONFLICT) {
                    check(actor.publishedEffectId != null && actor.receipt == null && actor.resolvedRecordId != null,
                            "late split-save conflict cannot erase the earlier effect");
                }
            }
        }

        private void verifyRecordReference(Actor actor, String id, Map<String, KeyRecord> recordsById) {
            if (id == null) return;
            KeyRecord record = recordsById.get(id);
            check(record != null && record.tenantId().equals(actor.call.tenantId())
                            && record.key().equals(actor.call.key()),
                    "record references belong to this call's actual tenant/key, including historical rows");
        }
    }

    private static final class Actor {
        private final IdempotencyInput.Call call;
        private Phase phase = Phase.NOT_STARTED;
        private LookupDisposition lookupDisposition;
        private String observedRecordId;
        private String resolvedRecordId;
        private int pendingUnits;
        private String publishedEffectId;
        private Receipt receipt;
        private Resolution resolution;

        private Actor(IdempotencyInput.Call call) { this.call = call; }

        private CallState snapshot() {
            return new CallState(call.id(), phase, lookupDisposition, observedRecordId, resolvedRecordId,
                    pendingUnits, publishedEffectId, receipt, resolution);
        }
    }

    private record ScopedKey(String tenantId, String key) {}
    private record OperationKey(String tenantId, String operationId) {}
    private record Evidence(Kind kind, String explanation) {}

    private static Evidence evidence(Kind kind, String explanation) { return new Evidence(kind, explanation); }

    private static void check(boolean condition, String message) {
        if (!condition) throw new IllegalStateException("Idempotency model invariant failed: " + message);
    }
}
