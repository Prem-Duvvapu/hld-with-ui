package com.hld.idempotency;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** Validate the complete program before any modeled effect or retained result is published. */
public final class IdempotencyValidator {
    private static final Pattern ID = Pattern.compile(IdempotencyInput.ID_PATTERN);

    private IdempotencyValidator() {}

    public static void validate(IdempotencyInput input) {
        require(input != null, "input is required");
        require(IdempotencyInput.SCHEMA_VERSION.equals(input.schemaVersion()), "schemaVersion must be 1.0");
        require(IdempotencyInput.MODEL_VERSION.equals(input.modelVersion()), "modelVersion must be 1.0.0");
        require(input.mode() != null, "mode is required");
        range(input.retentionMs(), 1, IdempotencyInput.MAX_RETENTION_MS, "retentionMs");
        size(input.calls(), IdempotencyInput.MIN_CALLS, IdempotencyInput.MAX_CALLS, "calls");
        size(input.schedule(), IdempotencyInput.MIN_STEPS, IdempotencyInput.MAX_STEPS, "schedule");

        Map<String, ProgramPhase> phases = new HashMap<>();
        Map<OperationKey, Integer> operationUnits = new HashMap<>();
        for (var call : input.calls()) {
            require(call != null, "calls must not contain null");
            identity(call.id(), "call ID");
            identity(call.operationId(), "call operationId");
            identity(call.tenantId(), "call tenantId");
            identity(call.key(), "call key");
            range(call.units(), 1, IdempotencyInput.MAX_UNITS, "call units");
            require(phases.putIfAbsent(call.id(), ProgramPhase.NOT_STARTED) == null,
                    "call IDs must be unique");
            Integer previousUnits = operationUnits.putIfAbsent(
                    new OperationKey(call.tenantId(), call.operationId()), call.units());
            require(previousUnits == null || previousUnits.equals(call.units()),
                    "calls for the same tenantId and operationId must describe consistent units");
        }

        int previousTime = -1;
        Set<String> stepIds = new HashSet<>();
        for (var step : input.schedule()) {
            require(step != null, "schedule must not contain null");
            identity(step.id(), "step ID");
            identity(step.callId(), "step callId");
            require(stepIds.add(step.id()), "step IDs must be unique");
            range(step.timeMs(), 0, IdempotencyInput.MAX_TIME_MS, "step timeMs");
            require(step.timeMs() >= previousTime, "schedule times must be nondecreasing");
            previousTime = step.timeMs();
            require(step.action() != null, "step action is required");
            ProgramPhase phase = phases.get(step.callId());
            require(phase != null, "step callId must name a configured call");
            ProgramPhase next = switch (step.action()) {
                case LOOKUP -> {
                    require(phase == ProgramPhase.NOT_STARTED, "LOOKUP must start each call exactly once");
                    yield ProgramPhase.LOOKED_UP;
                }
                case WRITE_EFFECT -> {
                    require(phase == ProgramPhase.LOOKED_UP, "WRITE_EFFECT must follow LOOKUP exactly once");
                    yield ProgramPhase.WORK_DONE;
                }
                case SAVE_RESULT -> {
                    require(phase == ProgramPhase.WORK_DONE, "SAVE_RESULT must follow WRITE_EFFECT exactly once");
                    yield ProgramPhase.RESULT_READY;
                }
                case RESPOND, LOSE_RESPONSE -> {
                    require(phase == ProgramPhase.RESULT_READY, "response actions must follow SAVE_RESULT exactly once");
                    yield ProgramPhase.TERMINAL;
                }
                case CRASH_HANDLER -> {
                    require(phase == ProgramPhase.LOOKED_UP || phase == ProgramPhase.WORK_DONE
                                    || phase == ProgramPhase.RESULT_READY,
                            "CRASH_HANDLER must follow LOOKUP and precede a terminal action");
                    yield ProgramPhase.TERMINAL;
                }
            };
            phases.put(step.callId(), next);
        }
        require(phases.values().stream().allMatch(phase -> phase == ProgramPhase.TERMINAL),
                "every configured call must finish with RESPOND, LOSE_RESPONSE or CRASH_HANDLER");
    }

    private static void identity(String value, String label) {
        require(value != null && value.length() <= IdempotencyInput.MAX_ID_LENGTH && ID.matcher(value).matches(),
                label + " must contain 1–32 lowercase ASCII letters, digits or hyphens and start with a letter");
    }

    private static void range(Integer value, int minimum, int maximum, String label) {
        require(value != null && value >= minimum && value <= maximum,
                label + " must be an integer from " + minimum + " to " + maximum);
    }

    private static void size(List<?> values, int minimum, int maximum, String label) {
        require(values != null && values.size() >= minimum && values.size() <= maximum,
                label + " must contain " + minimum + "–" + maximum + " entries");
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalArgumentException(message);
    }

    private record OperationKey(String tenantId, String operationId) {}
    private enum ProgramPhase { NOT_STARTED, LOOKED_UP, WORK_DONE, RESULT_READY, TERMINAL }
}
