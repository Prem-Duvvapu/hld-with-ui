package com.hld.idempotency;

import java.util.List;

/** Immutable logical evidence, not a database, provider or physical crash-recovery guarantee. */
public record IdempotencyResult(String simulationId, String schemaVersion, String modelVersion,
        String kind, String status, IdempotencyInput input, State initialState,
        List<Outcome> outcomes, State finalState, Metrics metrics, List<String> assumptions) {
    public IdempotencyResult {
        outcomes = List.copyOf(outcomes);
        assumptions = List.copyOf(assumptions);
    }

    public record State(List<CallState> calls, List<Effect> effects, List<KeyRecord> keyRecords,
            int publishedUnits, int activeKeyCount, int expiredKeyCount) {
        public State {
            calls = List.copyOf(calls);
            effects = List.copyOf(effects);
            keyRecords = List.copyOf(keyRecords);
        }
    }

    public record CallState(String id, Phase phase, LookupDisposition lookupDisposition,
            String observedRecordId, String resolvedRecordId, int pendingUnits,
            String publishedEffectId, Receipt receipt, Resolution resolution) {}
    public record Effect(String id, String callId, String operationId, String tenantId,
            int units, int publishedAtMs) {}
    public record Receipt(String effectId, int units) {}
    public record KeyRecord(String id, String tenantId, String key, int units, Receipt receipt,
            int createdAtMs, int expiresAtMs, KeyStatus status) {}
    public record Outcome(int sequence, String stepId, String callId, int timeMs,
            IdempotencyInput.Action action, Kind kind, State postState, String explanation) {}
    public record Metrics(int calls, int logicalOperations, int publishedEffects, int publishedUnits,
            int operationsWithRepeatedEffects, int extraEffects, int activeKeyRecords,
            int expiredKeyRecords, int replayedCalls, int payloadConflicts, int resultSaveConflicts,
            int responsesReceived, int responsesLost, int crashedCalls, int crashedCallsWithEffects,
            int receiptsReceived, int finalTimeMs) {}

    public enum Phase { NOT_STARTED, LOOKED_UP, WORK_DONE, RESULT_READY, RESPONDED, RESPONSE_LOST, CRASHED }
    public enum LookupDisposition { BYPASSED, MISSING, MATCHED, CONFLICT }
    public enum Resolution { EXECUTED, REPLAYED, PAYLOAD_CONFLICT, RESULT_SAVE_CONFLICT }
    public enum KeyStatus { ACTIVE, EXPIRED }
    public enum Kind {
        LOOKUP_BYPASSED, LOOKUP_MISSED, LOOKUP_REPLAYED, LOOKUP_CONFLICT,
        EFFECT_PUBLISHED, EFFECT_PREPARED, ACTION_SKIPPED, RESULT_READY, RESULT_STORED,
        RESULT_SAVE_CONFLICT, ATOMIC_COMMITTED, REPLAYED_AT_COMMIT, CONFLICT_AT_COMMIT,
        RESPONSE_RECEIVED, RESPONSE_LOST, HANDLER_CRASHED
    }
}
