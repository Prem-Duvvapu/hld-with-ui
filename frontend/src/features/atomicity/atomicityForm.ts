import type {
  AtomicityInput,
  AtomicityLimits,
  AtomicityStep,
} from "../../api/types";
export type TransactionDraft = { uiKey: string; id: string; quantity: string };
export type AtomicityStepDraft = {
  uiKey: string;
  id: string;
  transactionId: string;
  action: AtomicityStep["action"];
  ownerKey?: string;
};
export type AtomicityForm = {
  mode: AtomicityInput["mode"];
  initialUnits: string;
  transactions: TransactionDraft[];
  schedule: AtomicityStepDraft[];
};
export const atomicityActions: readonly AtomicityStep["action"][] = [
  "BEGIN",
  "DECREMENT_STOCK",
  "RECORD_ALLOCATION",
  "COMMIT",
  "ABORT",
];
export const atomicityActionLabels: Record<AtomicityStep["action"], string> = {
  BEGIN: "Begin transaction",
  DECREMENT_STOCK: "Change stock",
  RECORD_ALLOCATION: "Record allocation",
  COMMIT: "Commit",
  ABORT: "Abort",
};
export function toAtomicityForm(input: AtomicityInput): AtomicityForm {
  const transactions = input.transactions.map((actor, i) => ({
    uiKey: `actor-${i}`,
    id: actor.id,
    quantity: String(actor.quantity),
  }));
  return {
    mode: input.mode,
    initialUnits: String(input.initialUnits),
    transactions,
    schedule: input.schedule.map((step, i) => ({
      ...step,
      uiKey: `step-${i}`,
      ownerKey: transactions.find((actor) => actor.id === step.transactionId)
        ?.uiKey,
    })),
  };
}
export function parseAtomicityForm(
  form: AtomicityForm,
  limits: AtomicityLimits,
): { input?: AtomicityInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  function integer(value: string, key: string, min: number, max: number) {
    const parsed = /^[0-9]+$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
      errors[key] = `Enter a whole number from ${min} to ${max}.`;
    return parsed;
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
  if (!["SPLIT_WRITES", "STAGED_VERSION_CHECK"].includes(form.mode))
    errors.mode = "Choose a supported atomicity mode.";
  if (
    form.transactions.length < limits.minTransactions ||
    form.transactions.length > limits.maxTransactions
  )
    errors.transactions = `Use ${limits.minTransactions}–${limits.maxTransactions} transactions.`;
  const transactions = form.transactions.map((actor, i) => ({
    id: identifier(actor.id, `transaction-${i}-id`),
    quantity: integer(
      actor.quantity,
      `transaction-${i}-quantity`,
      1,
      limits.maxQuantity,
    ),
  }));
  if (
    new Set(transactions.map((actor) => actor.id)).size !== transactions.length
  )
    errors.transactions = "Give each transaction a different ID.";
  if (
    form.schedule.length < limits.minSteps ||
    form.schedule.length > limits.maxSteps
  )
    errors.schedule = `Use ${limits.minSteps}–${limits.maxSteps} steps with one complete program per transaction.`;
  const phases = new Map<string, "open" | "stock" | "record" | "terminal">();
  const schedule = form.schedule.map((step, i) => {
    const key = `step-${i}`;
    identifier(step.id, `${key}-id`);
    identifier(step.transactionId, `${key}-transactionId`);
    if (!transactions.some((actor) => actor.id === step.transactionId))
      errors[`${key}-transactionId`] =
        "Reference a transaction ID from this workload. ID edits do not rewrite step references.";
    const phase = phases.get(step.transactionId);
    const valid =
      step.action === "BEGIN"
        ? phase === undefined
        : step.action === "DECREMENT_STOCK"
          ? phase === "open"
          : step.action === "RECORD_ALLOCATION"
            ? phase === "stock"
            : step.action === "COMMIT"
              ? phase === "record"
              : step.action === "ABORT"
                ? phase === "open" || phase === "stock" || phase === "record"
                : false;
    if (!valid)
      errors[`${key}-action`] =
        "Begin once, change stock before recording, then commit after both writes or abort. No steps may follow a terminal action.";
    else
      phases.set(
        step.transactionId,
        step.action === "BEGIN"
          ? "open"
          : step.action === "DECREMENT_STOCK"
            ? "stock"
            : step.action === "RECORD_ALLOCATION"
              ? "record"
              : "terminal",
      );
    return {
      id: step.id,
      transactionId: step.transactionId,
      action: step.action,
    };
  });
  if (new Set(schedule.map((step) => step.id)).size !== schedule.length)
    errors.schedule = "Give each step a different ID.";
  if (transactions.some((actor) => phases.get(actor.id) !== "terminal"))
    errors.schedule =
      "Each transaction needs a complete program ending in commit or abort.";
  return Object.keys(errors).length
    ? { errors }
    : {
        errors,
        input: {
          schemaVersion: "1.0",
          modelVersion: "1.0.0",
          mode: form.mode,
          initialUnits,
          transactions,
          schedule,
        },
      };
}
function unused(form: AtomicityForm) {
  const occupied = new Set([
    ...form.transactions.flatMap((actor) => [actor.uiKey, actor.id]),
    ...form.schedule.flatMap((step) => [step.uiKey, step.id]),
  ]);
  let n = 1;
  while (
    [
      `new-actor-${n}`,
      `t${n}`,
      `begin-t${n}`,
      `decrement-t${n}`,
      `record-t${n}`,
      `commit-t${n}`,
      `new-begin-${n}`,
      `new-decrement-${n}`,
      `new-record-${n}`,
      `new-commit-${n}`,
      `new-step-${n}`,
      `step-${n}`,
    ].some((id) => occupied.has(id))
  )
    n++;
  return n;
}
export function addAtomicityTransaction(
  form: AtomicityForm,
  limits: AtomicityLimits,
): AtomicityForm {
  if (
    form.transactions.length >= limits.maxTransactions ||
    form.schedule.length + 4 > limits.maxSteps
  )
    return form;
  const n = unused(form),
    actor = { uiKey: `new-actor-${n}`, id: `t${n}`, quantity: "1" };
  const actions: readonly AtomicityStep["action"][] = [
    "BEGIN",
    "DECREMENT_STOCK",
    "RECORD_ALLOCATION",
    "COMMIT",
  ];
  const prefixes = ["begin", "decrement", "record", "commit"];
  return {
    ...form,
    transactions: [...form.transactions, actor],
    schedule: [
      ...form.schedule,
      ...actions.map((action, i) => ({
        uiKey: `new-${prefixes[i]}-${n}`,
        id: `${prefixes[i]}-${actor.id}`,
        transactionId: actor.id,
        ownerKey: actor.uiKey,
        action,
      })),
    ],
  };
}
export function removeAtomicityTransaction(
  form: AtomicityForm,
  uiKey: string,
  limits: AtomicityLimits,
): AtomicityForm {
  if (form.transactions.length <= limits.minTransactions) return form;
  const actor = form.transactions.find((item) => item.uiKey === uiKey);
  if (!actor) return form;
  return {
    ...form,
    transactions: form.transactions.filter((item) => item.uiKey !== uiKey),
    schedule: form.schedule.filter((step) =>
      step.ownerKey !== undefined
        ? step.ownerKey !== uiKey
        : step.transactionId !== actor.id,
    ),
  };
}
export function addAtomicityStep(
  form: AtomicityForm,
  limits: AtomicityLimits,
): AtomicityForm {
  if (form.schedule.length >= limits.maxSteps) return form;
  const n = unused(form),
    actor = form.transactions[0];
  return {
    ...form,
    schedule: [
      ...form.schedule,
      {
        uiKey: `new-step-${n}`,
        id: `step-${n}`,
        transactionId: actor?.id ?? "",
        ownerKey: actor?.uiKey,
        action: "BEGIN",
      },
    ],
  };
}
export function removeAtomicityStep(
  form: AtomicityForm,
  uiKey: string,
): AtomicityForm {
  return {
    ...form,
    schedule: form.schedule.filter((step) => step.uiKey !== uiKey),
  };
}
export function moveAtomicityStep(
  form: AtomicityForm,
  index: number,
  direction: -1 | 1,
): AtomicityForm {
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
