import Ajv2020 from "ajv/dist/2020.js";
import inputSchema from "../../../contracts/transaction-atomicity.input.schema.json";
import resultSchema from "../../../contracts/transaction-atomicity.result.schema.json";
import descriptorSchema from "./schemas/atomicity-descriptor.schema.json";
import type {
  AtomicityDescriptor,
  AtomicityInput,
  AtomicityResult,
  AtomicityState,
} from "./types";

const ajv = new Ajv2020({
  allErrors: false,
  strict: true,
  strictRequired: false,
});
// The result references the canonical input owner; register that owner first.
const validInput = ajv.compile(inputSchema);
const validResult = ajv.compile(resultSchema);
const validDescriptor = ajv.compile(descriptorSchema);
const unique = (values: readonly string[]) =>
  new Set(values).size === values.length;
export class AtomicityCompatibilityError extends Error {
  constructor() {
    super(
      "This atomicity response is incompatible with this app. Refresh and try again. If this continues, update the frontend and backend together.",
    );
    this.name = "AtomicityCompatibilityError";
  }
}
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => sameValue(value, b[index]))
    );
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.keys(left).every(
      (key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]),
    )
  );
}
function inputReferences(input: AtomicityInput): boolean {
  if (
    !unique(input.transactions.map((actor) => actor.id)) ||
    !unique(input.schedule.map((step) => step.id))
  )
    return false;
  const phases = new Map(
    input.transactions.map((actor) => [actor.id, "NOT_STARTED"]),
  );
  for (const step of input.schedule) {
    const phase = phases.get(step.transactionId);
    if (!phase) return false;
    switch (step.action) {
      case "BEGIN":
        if (phase !== "NOT_STARTED") return false;
        phases.set(step.transactionId, "BEGUN");
        break;
      case "DECREMENT_STOCK":
        if (phase !== "BEGUN") return false;
        phases.set(step.transactionId, "STOCK");
        break;
      case "RECORD_ALLOCATION":
        if (phase !== "STOCK") return false;
        phases.set(step.transactionId, "ALLOCATION");
        break;
      case "COMMIT":
        if (phase !== "ALLOCATION") return false;
        phases.set(step.transactionId, "TERMINAL");
        break;
      case "ABORT":
        if (!["BEGUN", "STOCK", "ALLOCATION"].includes(phase)) return false;
        phases.set(step.transactionId, "TERMINAL");
        break;
    }
  }
  return Array.from(phases.values()).every((phase) => phase === "TERMINAL");
}
export function assertAtomicityInput(body: unknown): void {
  if (!validInput(body))
    throw new Error(
      `Check the atomicity input: ${validInput.errors?.[0]?.instancePath || "/"} ${validInput.errors?.[0]?.message || "invalid fields"}.`,
    );
  if (!inputReferences(body as AtomicityInput))
    throw new Error(
      "Each transaction needs a unique ID and a complete program: BEGIN, optional stock and allocation commands in order, then ABORT; COMMIT requires both writes. Steps need unique IDs and known transactions.",
    );
}
export function assertAtomicityDescriptor(body: unknown): void {
  if (!validDescriptor(body)) throw new AtomicityCompatibilityError();
  const value = body as AtomicityDescriptor;
  const required = [
    ["baseline", "SPLIT_WRITES"],
    ["protected-baseline", "STAGED_VERSION_CHECK"],
    ["protected-conflict", "STAGED_VERSION_CHECK"],
  ] as const;
  if (
    !unique(value.presets.map((preset) => preset.id)) ||
    !required.every(
      ([id, mode]) =>
        value.presets.find((preset) => preset.id === id)?.input.mode === mode,
    ) ||
    !value.presets.every((preset) => inputReferences(preset.input))
  )
    throw new AtomicityCompatibilityError();
}
function stateReferences(
  state: AtomicityState,
  input: AtomicityInput,
  position: number,
): boolean {
  if (
    state.transactions.length !== input.transactions.length ||
    !state.transactions.every(
      (actor, index) =>
        actor.id === input.transactions[index]!.id &&
        actor.quantity === input.transactions[index]!.quantity,
    ) ||
    !unique(state.allocations.map((allocation) => allocation.transactionId))
  )
    return false;
  const referencesStep = (stepId: string, actorId: string, action: string) => {
    const index = input.schedule.findIndex((step) => step.id === stepId);
    const step = input.schedule[index];
    return (
      index >= 0 &&
      index <= position &&
      step?.transactionId === actorId &&
      step.action === action
    );
  };
  return (
    state.allocations.every(
      (allocation) =>
        input.transactions.find(
          (actor) => actor.id === allocation.transactionId,
        )?.quantity === allocation.quantity &&
        referencesStep(
          allocation.preparedAtStepId,
          allocation.transactionId,
          "RECORD_ALLOCATION",
        ) &&
        referencesStep(
          allocation.publishedAtStepId,
          allocation.transactionId,
          input.mode === "SPLIT_WRITES" ? "RECORD_ALLOCATION" : "COMMIT",
        ),
    ) &&
    state.transactions.every((actor) => {
      const active = actor.phase === "OPEN" || actor.phase === "BLOCKED";
      if (
        input.mode === "SPLIT_WRITES"
          ? actor.workingRemaining !== undefined ||
            actor.pendingAllocation !== undefined ||
            actor.pendingStockUnits !== 0
          : active && actor.workingRemaining === undefined
      )
        return false;
      const pending = actor.pendingAllocation;
      return (
        !pending ||
        (pending.transactionId === actor.id &&
          pending.quantity === actor.quantity &&
          referencesStep(pending.stepId, actor.id, "RECORD_ALLOCATION"))
      );
    })
  );
}
/** Check identity and reported evidence equality. Java alone calculates stock, revisions, flags and outcomes. */
export function assertAtomicityResult(
  body: unknown,
  submitted: AtomicityInput,
): void {
  if (!validResult(body)) throw new AtomicityCompatibilityError();
  const result = body as AtomicityResult;
  if (
    !sameValue(result.input, submitted) ||
    !inputReferences(result.input) ||
    result.outcomes.length !== submitted.schedule.length ||
    !stateReferences(result.initialState, submitted, -1) ||
    result.initialState.remainingUnits !== submitted.initialUnits
  )
    throw new AtomicityCompatibilityError();
  let previous: AtomicityState = result.initialState;
  for (let index = 0; index < result.outcomes.length; index++) {
    const outcome = result.outcomes[index]!,
      step = submitted.schedule[index]!,
      state = outcome.postState;
    if (
      outcome.sequence !== index + 1 ||
      outcome.stepId !== step.id ||
      outcome.transactionId !== step.transactionId ||
      outcome.action !== step.action ||
      (outcome.checkSource !== undefined &&
        outcome.checkSource !==
          (submitted.mode === "SPLIT_WRITES" ? "CURRENT" : "WORKING_COPY")) ||
      (["STOCK_APPLIED", "ALLOCATION_APPLIED"].includes(outcome.kind) &&
        submitted.mode !== "SPLIT_WRITES") ||
      (["STOCK_STAGED", "ALLOCATION_STAGED"].includes(outcome.kind) &&
        submitted.mode !== "STAGED_VERSION_CHECK") ||
      (submitted.mode === "SPLIT_WRITES" &&
        outcome.expectedRevision !== undefined) ||
      (submitted.mode === "STAGED_VERSION_CHECK" &&
        outcome.kind === "TRANSACTION_COMMITTED" &&
        outcome.expectedRevision === undefined) ||
      !stateReferences(state, submitted, index) ||
      !state.transactions.every((actor, actorIndex) => {
        const before = previous.transactions[actorIndex]!;
        return (
          before.baseRemaining === undefined ||
          (actor.baseRemaining === before.baseRemaining &&
            actor.baseRevision === before.baseRevision)
        );
      })
    )
      throw new AtomicityCompatibilityError();
    previous = state;
  }
  if (
    !sameValue(result.finalState, previous) ||
    result.metrics.finalRemainingUnits !== previous.remainingUnits ||
    result.metrics.finalAllocatedUnits !== previous.allocatedUnits ||
    [
      result.metrics.committedTransactions,
      result.metrics.abortedTransactions,
      result.metrics.conflictedTransactions,
      result.metrics.abortedTransactionsWithEffects,
    ].some((count) => count > submitted.transactions.length) ||
    (result.metrics.firstViolationStepId !== undefined &&
      !result.outcomes.some(
        (outcome) => outcome.stepId === result.metrics.firstViolationStepId,
      ))
  )
    throw new AtomicityCompatibilityError();
}
