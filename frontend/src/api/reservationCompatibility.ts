import Ajv2020 from "ajv/dist/2020.js";
import inputSchema from "../../../contracts/transactions-isolation.input.schema.json";
import resultSchema from "../../../contracts/transactions-isolation.result.schema.json";
import descriptorSchema from "./schemas/reservation-descriptor.schema.json";
import type {
  ReservationDescriptor,
  ReservationInput,
  ReservationOutcome,
  ReservationResult,
  ReservationState,
} from "./types";

const ajv = new Ajv2020({
  allErrors: false,
  strict: true,
  strictRequired: false,
});
// Register canonical input first; result references its captured input and identity owner.
const validInput = ajv.compile(inputSchema);
const validResult = ajv.compile(resultSchema);
const validDescriptor = ajv.compile(descriptorSchema);
const unique = (values: readonly string[]) =>
  new Set(values).size === values.length;
export class ReservationCompatibilityError extends Error {
  constructor() {
    super(
      "This reservation response is incompatible with this app. Refresh and try again. If this continues, update the frontend and backend together.",
    );
    this.name = "ReservationCompatibilityError";
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
function inputReferences(input: ReservationInput): boolean {
  if (
    !unique(input.reservations.map((actor) => actor.id)) ||
    !unique(input.schedule.map((step) => step.id)) ||
    input.schedule.length !== 2 * input.reservations.length
  )
    return false;
  const phases = new Map(
    input.reservations.map((actor) => [actor.id, "NOT_READ"]),
  );
  for (const step of input.schedule) {
    const phase = phases.get(step.reservationId);
    if (step.action === "READ" ? phase !== "NOT_READ" : phase !== "READ")
      return false;
    phases.set(step.reservationId, step.action === "READ" ? "READ" : "DONE");
  }
  return Array.from(phases.values()).every((phase) => phase === "DONE");
}
export function assertReservationInput(body: unknown): void {
  if (!validInput(body))
    throw new Error(
      `Check the reservation input: ${validInput.errors?.[0]?.instancePath || "/"} ${validInput.errors?.[0]?.message || "invalid fields"}.`,
    );
  if (!inputReferences(body as ReservationInput))
    throw new Error(
      "Each reservation needs a unique ID and exactly one READ followed by one ATTEMPT_RESERVE. Steps need unique IDs and known reservations.",
    );
}
export function assertReservationDescriptor(body: unknown): void {
  if (!validDescriptor(body)) throw new ReservationCompatibilityError();
  const value = body as ReservationDescriptor;
  const unsafe = value.presets.find(
    (preset) => preset.id === "unsafe-baseline",
  );
  const protectedPreset = value.presets.find(
    (preset) => preset.id === "protected-baseline",
  );
  if (
    !unique(value.presets.map((preset) => preset.id)) ||
    unsafe?.input.strategy !== "STALE_READ_WRITE" ||
    protectedPreset?.input.strategy !== "ATOMIC_CONDITIONAL_RESERVATION" ||
    !value.presets.every((preset) => inputReferences(preset.input))
  )
    throw new ReservationCompatibilityError();
}
function actorReferences(
  state: ReservationState,
  input: ReservationInput,
): boolean {
  return (
    state.reservations.length === input.reservations.length &&
    state.reservations.every(
      (actor, index) =>
        actor.id === input.reservations[index]!.id &&
        actor.quantity === input.reservations[index]!.quantity,
    )
  );
}
function unchangedSharedState(
  before: ReservationState,
  after: ReservationState,
): boolean {
  return (
    before.remainingUnits === after.remainingUnits &&
    before.allocatedUnits === after.allocatedUnits &&
    sameValue(before.allocations, after.allocations) &&
    sameValue(before.invariants, after.invariants)
  );
}
function allocationReferences(
  state: ReservationState,
  input: ReservationInput,
): boolean {
  return (
    unique(state.allocations.map((allocation) => allocation.reservationId)) &&
    state.allocations.every((allocation) => {
      const actor = input.reservations.find(
        (actor) => actor.id === allocation.reservationId,
      );
      const step = input.schedule.find((step) => step.id === allocation.stepId);
      return (
        actor?.quantity === allocation.quantity &&
        step?.action === "ATTEMPT_RESERVE" &&
        step.reservationId === allocation.reservationId
      );
    }) &&
    state.reservations.every(
      (actor) =>
        state.allocations.some(
          (allocation) => allocation.reservationId === actor.id,
        ) ===
        (actor.status === "ACCEPTED"),
    )
  );
}
/** Validate reported snapshots and references, without choosing outcomes or calculating stock/flags. */
export function assertReservationResult(
  body: unknown,
  submitted: ReservationInput,
): void {
  if (!validResult(body)) throw new ReservationCompatibilityError();
  const result = body as ReservationResult;
  if (
    !sameValue(result.input, submitted) ||
    !inputReferences(result.input) ||
    result.outcomes.length !== submitted.schedule.length ||
    !actorReferences(result.initialState, submitted) ||
    result.initialState.remainingUnits !== submitted.initialUnits ||
    result.initialState.invariants.accountedUnits !== submitted.initialUnits
  )
    throw new ReservationCompatibilityError();
  let previous: ReservationState = result.initialState;
  let firstViolation: ReservationOutcome | undefined;
  for (let index = 0; index < result.outcomes.length; index++) {
    const outcome = result.outcomes[index]!,
      step = submitted.schedule[index]!,
      state = outcome.postState;
    const actorIndex = submitted.reservations.findIndex(
      (actor) => actor.id === step.reservationId,
    );
    const actor = state.reservations[actorIndex],
      before = previous.reservations[actorIndex];
    if (
      outcome.sequence !== index + 1 ||
      outcome.stepId !== step.id ||
      outcome.reservationId !== step.reservationId ||
      outcome.action !== step.action ||
      !actorReferences(state, submitted) ||
      !allocationReferences(state, submitted) ||
      !actor ||
      !before ||
      !state.reservations.every(
        (other, otherIndex) =>
          otherIndex === actorIndex ||
          sameValue(other, previous.reservations[otherIndex]),
      )
    )
      throw new ReservationCompatibilityError();
    if (step.action === "READ") {
      if (
        before.status !== "NOT_READ" ||
        actor.status !== "READ_OBSERVED" ||
        outcome.observedRemaining !== previous.remainingUnits ||
        actor.observedRemaining !== outcome.observedRemaining ||
        !unchangedSharedState(previous, state)
      )
        throw new ReservationCompatibilityError();
    } else {
      const source =
        submitted.strategy === "STALE_READ_WRITE" ? "SNAPSHOT" : "CURRENT";
      const checked =
        source === "SNAPSHOT"
          ? before.observedRemaining
          : previous.remainingUnits;
      if (
        before.status !== "READ_OBSERVED" ||
        actor.observedRemaining !== before.observedRemaining ||
        outcome.checkSource !== source ||
        outcome.checkedRemaining !== checked ||
        outcome.quantity !== actor.quantity
      )
        throw new ReservationCompatibilityError();
      // Copy only the identities in Java's accepted evidence; no condition or subtraction is evaluated.
      if (outcome.kind === "RESERVATION_ACCEPTED") {
        const added = state.allocations.at(-1);
        if (
          actor.status !== "ACCEPTED" ||
          state.allocations.length !== previous.allocations.length + 1 ||
          !sameValue(state.allocations.slice(0, -1), previous.allocations) ||
          added?.reservationId !== step.reservationId ||
          added.stepId !== step.id ||
          added.quantity !== actor.quantity
        )
          throw new ReservationCompatibilityError();
      } else if (
        actor.status !== "REJECTED" ||
        !unchangedSharedState(previous, state)
      ) {
        throw new ReservationCompatibilityError();
      }
    }
    // Summarize only the reported flags for consistency; their arithmetic remains exclusively Java's.
    const flags = state.invariants;
    if (
      !firstViolation &&
      (!flags.remainingNonnegative ||
        !flags.allocatedWithinCapacity ||
        !flags.unitsConserved)
    )
      firstViolation = outcome;
    previous = state;
  }
  if (
    !sameValue(result.finalState, previous) ||
    result.metrics.finalRemainingUnits !== previous.remainingUnits ||
    result.metrics.finalAllocatedUnits !== previous.allocatedUnits ||
    result.metrics.acceptedReservations > submitted.reservations.length ||
    result.metrics.rejectedReservations > submitted.reservations.length ||
    result.metrics.invariantStatus !==
      (firstViolation ? "VIOLATED" : "PRESERVED") ||
    result.metrics.firstViolationStepId !== firstViolation?.stepId
  )
    throw new ReservationCompatibilityError();
}
