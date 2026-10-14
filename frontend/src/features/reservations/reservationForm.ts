import type {
  ReservationInput,
  ReservationLimits,
  ReservationStep,
} from "../../api/types";
export type ActorDraft = { uiKey: string; id: string; quantity: string };
export type StepDraft = {
  uiKey: string;
  id: string;
  actorKey: string;
  action: ReservationStep["action"];
};
export type ReservationForm = {
  strategy: ReservationInput["strategy"];
  initialUnits: string;
  reservations: ActorDraft[];
  schedule: StepDraft[];
};
export function toReservationForm(input: ReservationInput): ReservationForm {
  const reservations = input.reservations.map((actor, i) => ({
    uiKey: `actor-${i}`,
    id: actor.id,
    quantity: String(actor.quantity),
  }));
  return {
    strategy: input.strategy,
    initialUnits: String(input.initialUnits),
    reservations,
    schedule: input.schedule.map((step, i) => ({
      uiKey: `step-${i}`,
      id: step.id,
      actorKey: reservations.find((actor) => actor.id === step.reservationId)!
        .uiKey,
      action: step.action,
    })),
  };
}
export function parseReservationForm(
  form: ReservationForm,
  limits: ReservationLimits,
): { input?: ReservationInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  function integer(value: string, key: string, min: number, max: number) {
    const number = value.trim() ? Number(value) : NaN;
    if (!Number.isSafeInteger(number) || number < min || number > max)
      errors[key] = `Enter a whole number from ${min} to ${max}.`;
    return number;
  }
  function identifier(value: string, key: string) {
    if (
      !/^[a-z][a-z0-9-]*$/.test(value) ||
      /\s/.test(value) ||
      value.length > limits.maxIdLength
    )
      errors[key] =
        `Use 1–${limits.maxIdLength} lowercase letters, digits or hyphens, starting with a letter.`;
    return value;
  }
  const initialUnits = integer(
    form.initialUnits,
    "initialUnits",
    0,
    limits.maxInitialUnits,
  );
  if (
    !["STALE_READ_WRITE", "ATOMIC_CONDITIONAL_RESERVATION"].includes(
      form.strategy,
    )
  )
    errors.strategy = "Choose a supported reservation strategy.";
  if (
    form.reservations.length < limits.minReservations ||
    form.reservations.length > limits.maxReservations
  )
    errors.reservations = `Use ${limits.minReservations}–${limits.maxReservations} reservations.`;
  const reservations = form.reservations.map((actor, i) => ({
    id: identifier(actor.id, `reservation-${i}-id`),
    quantity: integer(
      actor.quantity,
      `reservation-${i}-quantity`,
      1,
      limits.maxQuantity,
    ),
  }));
  if (
    new Set(reservations.map((actor) => actor.id)).size !== reservations.length
  )
    errors.reservations = "Give each reservation a different ID.";
  if (
    form.schedule.length !== reservations.length * 2 ||
    form.schedule.length > limits.maxSteps
  )
    errors.schedule =
      "Each reservation needs exactly one read and one later attempt.";
  const phases = new Map<string, number>();
  const schedule = form.schedule.map((step, i) => {
    const actor = form.reservations.find(
      (item) => item.uiKey === step.actorKey,
    );
    const phase = phases.get(step.actorKey) ?? 0;
    if (
      !actor ||
      (step.action === "READ"
        ? phase !== 0
        : step.action === "ATTEMPT_RESERVE"
          ? phase !== 1
          : true)
    )
      errors[`step-${i}-action`] =
        "Read once before attempting once for this reservation.";
    phases.set(step.actorKey, step.action === "READ" ? 1 : 2);
    return {
      id: identifier(step.id, `step-${i}-id`),
      reservationId: actor?.id ?? "",
      action: step.action,
    };
  });
  if (new Set(schedule.map((step) => step.id)).size !== schedule.length)
    errors.schedule = "Give each step a different ID.";
  if (form.reservations.some((actor) => phases.get(actor.uiKey) !== 2))
    errors.schedule =
      "Each reservation needs exactly one read and one later attempt.";
  return Object.keys(errors).length
    ? { errors }
    : {
        errors,
        input: {
          schemaVersion: "1.0",
          modelVersion: "1.0.0",
          strategy: form.strategy,
          initialUnits,
          reservations,
          schedule,
        },
      };
}
export function addReservation(form: ReservationForm): ReservationForm {
  if (form.reservations.length >= 4) return form;
  let n = 1;
  const occupied = new Set([
    ...form.reservations.flatMap((actor) => [actor.uiKey, actor.id]),
    ...form.schedule.flatMap((step) => [step.uiKey, step.id]),
  ]);
  while (
    [
      `new-actor-${n}`,
      `r${n}`,
      `read-r${n}`,
      `attempt-r${n}`,
      `new-read-${n}`,
      `new-attempt-${n}`,
    ].some((key) => occupied.has(key))
  )
    n++;
  const actor: ActorDraft = {
    uiKey: `new-actor-${n}`,
    id: `r${n}`,
    quantity: "1",
  };
  return {
    ...form,
    reservations: [...form.reservations, actor],
    schedule: [
      ...form.schedule,
      {
        uiKey: `new-read-${n}`,
        id: `read-r${n}`,
        actorKey: actor.uiKey,
        action: "READ",
      },
      {
        uiKey: `new-attempt-${n}`,
        id: `attempt-r${n}`,
        actorKey: actor.uiKey,
        action: "ATTEMPT_RESERVE",
      },
    ],
  };
}
export function removeReservation(
  form: ReservationForm,
  uiKey: string,
): ReservationForm {
  if (form.reservations.length <= 2) return form;
  return {
    ...form,
    reservations: form.reservations.filter((actor) => actor.uiKey !== uiKey),
    schedule: form.schedule.filter((step) => step.actorKey !== uiKey),
  };
}
export function moveReservationStep(
  form: ReservationForm,
  index: number,
  direction: -1 | 1,
): ReservationForm {
  const target = index + direction;
  if (
    index < 0 ||
    index >= form.schedule.length ||
    target < 0 ||
    target >= form.schedule.length
  )
    return form;
  const schedule = [...form.schedule];
  [schedule[index], schedule[target]] = [schedule[target]!, schedule[index]!];
  return { ...form, schedule };
}
