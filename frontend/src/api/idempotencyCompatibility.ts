import Ajv2020 from "ajv/dist/2020.js";
import inputSchema from "../../../contracts/idempotency.input.schema.json";
import resultSchema from "../../../contracts/idempotency.result.schema.json";
import descriptorSchema from "./schemas/idempotency-descriptor.schema.json";
import checkpointsSchema from "../../../contracts/checkpoints.schema.json";
import type {
  IdempotencyDescriptor,
  IdempotencyInput,
  IdempotencyResult,
  IdempotencyState,
  GuidedCheckpoint,
} from "./types";

const ajv = new Ajv2020({
  allErrors: false,
  strict: true,
  strictRequired: false,
});
const validInput = ajv.compile(inputSchema);
const validResult = ajv.compile(resultSchema);
const validDescriptor = ajv.compile(descriptorSchema);
const validCheckpoints = ajv.compile(checkpointsSchema);
const checkpointKinds = new Set<string>(
  resultSchema.$defs.outcome.properties.kind.enum,
);
const unique = (values: readonly string[]) =>
  new Set(values).size === values.length;
export class IdempotencyCompatibilityError extends Error {
  constructor() {
    super(
      "This idempotency response is incompatible with this app. Refresh and try again. If this continues, update the frontend and backend together.",
    );
    this.name = "IdempotencyCompatibilityError";
  }
}
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  )
    return false;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameValue(item, right[index]))
    );
  const a = left as Record<string, unknown>,
    b = right as Record<string, unknown>;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every(
      (key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]),
    )
  );
}
function inputReferences(input: IdempotencyInput): boolean {
  const calls = new Map(input.calls.map((call) => [call.id, call]));
  return (
    unique(input.calls.map((call) => call.id)) &&
    unique(input.schedule.map((step) => step.id)) &&
    input.schedule.every(
      (step, index) =>
        calls.has(step.callId) &&
        (index === 0 || step.timeMs >= input.schedule[index - 1]!.timeMs),
    ) &&
    input.calls.every((call) =>
      input.calls.every(
        (other) =>
          call.tenantId !== other.tenantId ||
          call.operationId !== other.operationId ||
          call.units === other.units,
      ),
    )
  );
}
/** Static workload references only. Java validates complete per-call program grammar. */
export function assertIdempotencyInput(body: unknown): void {
  if (!validInput(body))
    throw new Error(
      `Check the idempotency input: ${validInput.errors?.[0]?.instancePath || "/"} ${validInput.errors?.[0]?.message || "invalid fields"}.`,
    );
  if (!inputReferences(body as IdempotencyInput))
    throw new Error(
      "Use unique call and step IDs, existing call references, chronological steps, and consistent units for each tenant's intended operation.",
    );
}
export function assertIdempotencyDescriptor(body: unknown): void {
  if (!validDescriptor(body)) throw new IdempotencyCompatibilityError();
  const descriptor = body as IdempotencyDescriptor;
  // The schema fixes the nine allowed IDs and exact cardinality; uniqueness makes coverage complete.
  if (
    !unique(descriptor.presets.map((preset) => preset.id)) ||
    !descriptor.presets.some(
      (preset) => preset.id === descriptor.defaultPresetId,
    ) ||
    !descriptor.presets.every((preset) => inputReferences(preset.input))
  )
    throw new IdempotencyCompatibilityError();
}
/** Validate authored shape and static references; only Java verifies the target's actual outcome. */
export function assertIdempotencyCheckpoints(
  checkpoints: unknown,
  descriptor: IdempotencyDescriptor,
): void {
  if (!validCheckpoints(checkpoints)) throw new IdempotencyCompatibilityError();
  const authored = checkpoints as GuidedCheckpoint[];
  const presets = new Map<string, IdempotencyDescriptor["presets"][number]>(
    descriptor.presets.map((preset) => [preset.id, preset]),
  );
  if (
    !unique(authored.map((checkpoint) => checkpoint.id)) ||
    !authored.every((checkpoint) => {
      const target = checkpoint.target;
      const preset = presets.get(checkpoint.presetId);
      return (
        checkpoint.simulationId === "idempotency" &&
        "stepId" in target &&
        Object.keys(target).sort().join(",") === "kind,occurrence,stepId" &&
        checkpointKinds.has(target.kind) &&
        target.occurrence === 1 &&
        preset !== undefined &&
        preset.input.schedule.some((step) => step.id === target.stepId)
      );
    })
  )
    throw new IdempotencyCompatibilityError();
}

function stateReferences(
  state: IdempotencyState,
  input: IdempotencyInput,
  now: number,
): boolean {
  const calls = new Map(input.calls.map((call) => [call.id, call]));
  const effects = new Map(state.effects.map((effect) => [effect.id, effect]));
  const records = new Map(
    state.keyRecords.map((record) => [record.id, record]),
  );
  if (
    state.calls.length !== input.calls.length ||
    !state.calls.every((call, index) => call.id === input.calls[index]!.id) ||
    !unique(state.effects.map((effect) => effect.id)) ||
    !unique(state.keyRecords.map((record) => record.id))
  )
    return false;
  if (
    !state.effects.every((effect) => {
      const call = calls.get(effect.callId);
      return (
        call !== undefined &&
        effect.id === `effect-${call.id}` &&
        effect.operationId === call.operationId &&
        effect.tenantId === call.tenantId &&
        effect.units === call.units &&
        state.calls.find((row) => row.id === call.id)?.publishedEffectId ===
          effect.id &&
        effect.publishedAtMs <= now
      );
    })
  )
    return false;
  if (
    !state.keyRecords.every((record) => {
      const call = calls.get(record.id.slice("record-".length));
      const effect = effects.get(record.receipt.effectId);
      return (
        call !== undefined &&
        record.id === `record-${call.id}` &&
        record.tenantId === call.tenantId &&
        record.key === call.key &&
        record.units === call.units &&
        record.receipt.effectId === `effect-${call.id}` &&
        record.receipt.units === effect?.units &&
        record.createdAtMs <= now
      );
    })
  )
    return false;
  const activeScopes = state.keyRecords
    .filter((record) => record.status === "ACTIVE")
    .map((record) => JSON.stringify([record.tenantId, record.key]));
  if (!unique(activeScopes)) return false;
  return state.calls.every((call) => {
    const configured = calls.get(call.id)!;
    const scopedRecord = (id: string | undefined) => {
      if (id === undefined) return true;
      const record = records.get(id);
      // References are historical: an expired row remains valid evidence for a cached decision.
      return (
        record !== undefined &&
        record.tenantId === configured.tenantId &&
        record.key === configured.key
      );
    };
    const effect =
      call.publishedEffectId === undefined
        ? undefined
        : effects.get(call.publishedEffectId);
    if (
      (call.observedRecordId !== undefined &&
        call.resolvedRecordId !== call.observedRecordId) ||
      !scopedRecord(call.observedRecordId) ||
      !scopedRecord(call.resolvedRecordId) ||
      (call.publishedEffectId !== undefined && effect?.callId !== call.id)
    )
      return false;
    if (call.receipt !== undefined) {
      const receiptEffect = effects.get(call.receipt.effectId);
      if (
        receiptEffect === undefined ||
        receiptEffect.units !== call.receipt.units ||
        receiptEffect.tenantId !== configured.tenantId
      )
        return false;
      if (input.mode === "NO_DEDUP")
        return call.receipt.effectId === call.publishedEffectId;
      const record = records.get(call.resolvedRecordId ?? "");
      if (!record || !sameValue(call.receipt, record.receipt)) return false;
    }
    return true;
  });
}
function retainedHistory(
  before: IdempotencyState,
  after: IdempotencyState,
  currentCallId: string,
): boolean {
  if (
    after.effects.length < before.effects.length ||
    after.keyRecords.length < before.keyRecords.length
  )
    return false;
  if (
    !before.effects.every((effect, index) =>
      sameValue(effect, after.effects[index]),
    )
  )
    return false;
  if (
    !before.keyRecords.every((record, index) => {
      const next = after.keyRecords[index];
      return (
        next !== undefined &&
        sameValue({ ...record, status: next.status }, next) &&
        (record.status !== "EXPIRED" || next.status === "EXPIRED")
      );
    })
  )
    return false;
  return before.calls.every((call, index) => {
    const next = after.calls[index]!;
    if (call.id !== currentCallId) return sameValue(call, next);
    // Once reported these observations and identities remain history, including after a crash.
    if (
      !(
        [
          "lookupDisposition",
          "observedRecordId",
          "resolvedRecordId",
          "publishedEffectId",
          "resolution",
        ] as const
      ).every(
        (field) => call[field] === undefined || call[field] === next[field],
      )
    )
      return false;
    return (
      call.receipt === undefined ||
      next.phase === "CRASHED" ||
      sameValue(call.receipt, next.receipt)
    );
  });
}
/** Validate reported identity/reference/history consistency, never execute actions or recalculate metrics. */
export function assertIdempotencyResult(
  body: unknown,
  submitted: IdempotencyInput,
): void {
  if (!validResult(body)) throw new IdempotencyCompatibilityError();
  const result = body as IdempotencyResult;
  if (
    !sameValue(result.input, submitted) ||
    !inputReferences(result.input) ||
    result.outcomes.length !== submitted.schedule.length ||
    !stateReferences(result.initialState, submitted, 0)
  )
    throw new IdempotencyCompatibilityError();
  let previous: IdempotencyState = result.initialState;
  for (let index = 0; index < result.outcomes.length; index++) {
    const outcome = result.outcomes[index]!,
      step = submitted.schedule[index]!;
    if (
      outcome.sequence !== index + 1 ||
      outcome.stepId !== step.id ||
      outcome.callId !== step.callId ||
      outcome.timeMs !== step.timeMs ||
      outcome.action !== step.action ||
      !stateReferences(outcome.postState, submitted, outcome.timeMs) ||
      !retainedHistory(previous, outcome.postState, outcome.callId)
    )
      throw new IdempotencyCompatibilityError();
    previous = outcome.postState;
  }
  if (
    !sameValue(result.finalState, previous) ||
    result.metrics.calls !== submitted.calls.length ||
    result.metrics.finalTimeMs !== result.outcomes.at(-1)!.timeMs
  )
    throw new IdempotencyCompatibilityError();
}
