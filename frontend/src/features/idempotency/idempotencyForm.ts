import type { IdempotencyDescriptor, IdempotencyInput } from "../../api/types";
export type IdempotencyLimits = IdempotencyDescriptor["limits"];
type Action = IdempotencyInput["schedule"][number]["action"];
export type CallDraft = {
  uiKey: string;
  id: string;
  operationId: string;
  tenantId: string;
  key: string;
  units: string;
};
export type StepDraft = {
  uiKey: string;
  id: string;
  callId: string;
  timeMs: string;
  action: Action;
};
export type IdempotencyForm = {
  mode: IdempotencyInput["mode"];
  retentionMs: string;
  calls: CallDraft[];
  schedule: StepDraft[];
};
export const modeLabels: Record<IdempotencyInput["mode"], string> = {
  NO_DEDUP: "Unprotected writes",
  SPLIT_EFFECT_RECORD: "Split effect and result writes",
  ATOMIC_EFFECT_RECORD: "Atomic effect and result publication",
};
export const actionLabels: Record<Action, string> = {
  LOOKUP: "Look up the key",
  WRITE_EFFECT: "Write or privately prepare work",
  SAVE_RESULT: "Save result / atomic publication",
  RESPOND: "Receive the response",
  LOSE_RESPONSE: "Lose the response",
  CRASH_HANDLER: "Crash this handler",
};
export const actions = Object.keys(actionLabels) as Action[];
export function toIdempotencyForm(input: IdempotencyInput): IdempotencyForm {
  const calls = input.calls.map((call, i) => ({
    ...call,
    uiKey: `call-${i}`,
    units: String(call.units),
  }));
  return {
    mode: input.mode,
    retentionMs: String(input.retentionMs),
    calls,
    schedule: input.schedule.map((step, i) => ({
      ...step,
      uiKey: `step-${i}`,
      timeMs: String(step.timeMs),
    })),
  };
}
/** Checks the authored input grammar only. Java executes publication and reports every outcome. */
export function parseIdempotencyForm(
  form: IdempotencyForm,
  limits: IdempotencyLimits,
): {
  input?: IdempotencyInput;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  function integer(value: string, path: string, min: number, max: number) {
    const n = /^[0-9]+$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(n) || n < min || n > max)
      errors[path] = `Enter a whole number from ${min} to ${max}.`;
    return n;
  }
  function identifier(value: string, path: string) {
    if (
      !/^[a-z][a-z0-9-]*$/.test(value) ||
      /\s/.test(value) ||
      value.length > limits.maxIdLength
    )
      errors[path] =
        `Use 1–${limits.maxIdLength} lowercase letters, digits or hyphens, starting with a letter.`;
    return value;
  }
  if (!Object.hasOwn(modeLabels, form.mode))
    errors.mode = "Choose a supported protection mode.";
  const retentionMs = integer(
    form.retentionMs,
    "retentionMs",
    1,
    limits.maxRetentionMs,
  );
  if (
    form.calls.length < limits.minCalls ||
    form.calls.length > limits.maxCalls
  )
    errors.calls = `Use ${limits.minCalls}–${limits.maxCalls} calls.`;
  const unitsByOperation = new Map<string, number>();
  const calls = form.calls.map((call, i) => {
    const prefix = `call-${i}`;
    const result = {
      id: identifier(call.id, `${prefix}-id`),
      operationId: identifier(call.operationId, `${prefix}-operationId`),
      tenantId: identifier(call.tenantId, `${prefix}-tenantId`),
      key: identifier(call.key, `${prefix}-key`),
      units: integer(call.units, `${prefix}-units`, 1, limits.maxUnits),
    };
    const auditId = JSON.stringify([result.tenantId, result.operationId]);
    if (
      unitsByOperation.has(auditId) &&
      unitsByOperation.get(auditId) !== result.units
    )
      errors[`${prefix}-units`] =
        "Calls for the same tenant and operation must describe the same units. Use another operation ID to model different intended work.";
    unitsByOperation.set(auditId, result.units);
    return result;
  });
  if (new Set(calls.map((call) => call.id)).size !== calls.length)
    errors.calls = "Give each call a different ID.";
  if (
    form.schedule.length < limits.minSteps ||
    form.schedule.length > limits.maxSteps
  )
    errors.schedule = `Use ${limits.minSteps}–${limits.maxSteps} steps, ending every call.`;
  const phases = new Map<string, "lookup" | "work" | "ready" | "terminal">();
  let previousTime = -1;
  const schedule = form.schedule.map((step, i) => {
    const prefix = `step-${i}`;
    identifier(step.id, `${prefix}-id`);
    identifier(step.callId, `${prefix}-callId`);
    if (!calls.some((call) => call.id === step.callId))
      errors[`${prefix}-callId`] =
        "Reference a configured call ID. Editing a call ID does not rewrite step references.";
    const timeMs = integer(
      step.timeMs,
      `${prefix}-timeMs`,
      0,
      limits.maxTimeMs,
    );
    if (timeMs < previousTime)
      errors[`${prefix}-timeMs`] =
        "Keep virtual times in nondecreasing order. Equal times execute in the authored step order.";
    previousTime = timeMs;
    const phase = phases.get(step.callId);
    const valid =
      step.action === "LOOKUP"
        ? phase === undefined
        : step.action === "WRITE_EFFECT"
          ? phase === "lookup"
          : step.action === "SAVE_RESULT"
            ? phase === "work"
            : step.action === "RESPOND" || step.action === "LOSE_RESPONSE"
              ? phase === "ready"
              : step.action === "CRASH_HANDLER"
                ? phase === "lookup" || phase === "work" || phase === "ready"
                : false;
    if (!valid)
      errors[`${prefix}-action`] =
        "Look up once, write/prepare, save, then receive or lose the response; or crash after a valid prefix. No action may follow the end of a call.";
    else
      phases.set(
        step.callId,
        step.action === "LOOKUP"
          ? "lookup"
          : step.action === "WRITE_EFFECT"
            ? "work"
            : step.action === "SAVE_RESULT"
              ? "ready"
              : "terminal",
      );
    return { id: step.id, callId: step.callId, timeMs, action: step.action };
  });
  if (new Set(schedule.map((step) => step.id)).size !== schedule.length)
    errors.schedule = "Give each step a different ID.";
  if (calls.some((call) => phases.get(call.id) !== "terminal"))
    errors.schedule =
      "Every call needs a complete program ending with a received response, lost response or handler crash.";
  return Object.keys(errors).length
    ? { errors }
    : {
        errors,
        input: {
          schemaVersion: "1.0",
          modelVersion: "1.0.0",
          mode: form.mode,
          retentionMs,
          calls,
          schedule,
        },
      };
}
function unused(form: IdempotencyForm) {
  const occupied = new Set([
    ...form.calls.flatMap((call) => [call.id, call.uiKey]),
    ...form.schedule.flatMap((step) => [step.id, step.uiKey]),
  ]);
  let n = 1;
  while (
    [
      `new-call-${n}`,
      `c${n}`,
      `lookup-c${n}`,
      `write-c${n}`,
      `save-c${n}`,
      `respond-c${n}`,
      `new-step-${n}`,
      `extra-${n}`,
    ].some((id) => occupied.has(id))
  )
    n++;
  return n;
}
export function addIdempotencyCall(
  form: IdempotencyForm,
  limits: IdempotencyLimits,
): IdempotencyForm {
  if (
    form.calls.length >= limits.maxCalls ||
    form.schedule.length + 4 > limits.maxSteps
  )
    return form;
  const n = unused(form);
  const call = {
    uiKey: `new-call-${n}`,
    id: `c${n}`,
    operationId: `op${n}`,
    tenantId: "t",
    key: `k${n}`,
    units: "1",
  };
  const timeMs = form.schedule.at(-1)?.timeMs ?? "0";
  return {
    ...form,
    calls: [...form.calls, call],
    schedule: [
      ...form.schedule,
      ...(["LOOKUP", "WRITE_EFFECT", "SAVE_RESULT", "RESPOND"] as const).map(
        (action, i) => ({
          uiKey: `${["lookup", "write", "save", "respond"][i]}-c${n}`,
          id: `${["lookup", "write", "save", "respond"][i]}-c${n}`,
          callId: call.id,
          timeMs,
          action,
        }),
      ),
    ],
  };
}
export function removeIdempotencyCall(
  form: IdempotencyForm,
  uiKey: string,
  limits: IdempotencyLimits,
): IdempotencyForm {
  if (form.calls.length <= limits.minCalls) return form;
  const call = form.calls.find((item) => item.uiKey === uiKey);
  if (!call) return form;
  const sameIdRemains = form.calls.some(
    (item) => item.uiKey !== uiKey && item.id === call.id,
  );
  return {
    ...form,
    calls: form.calls.filter((item) => item.uiKey !== uiKey),
    schedule: sameIdRemains
      ? form.schedule
      : form.schedule.filter((step) => step.callId !== call.id),
  };
}
export function addIdempotencyStep(
  form: IdempotencyForm,
  limits: IdempotencyLimits,
): IdempotencyForm {
  if (form.schedule.length >= limits.maxSteps) return form;
  const n = unused(form),
    call = form.calls[0];
  return {
    ...form,
    schedule: [
      ...form.schedule,
      {
        uiKey: `new-step-${n}`,
        id: `extra-${n}`,
        callId: call?.id ?? "",
        timeMs: form.schedule.at(-1)?.timeMs ?? "0",
        action: "LOOKUP",
      },
    ],
  };
}
export function removeIdempotencyStep(
  form: IdempotencyForm,
  uiKey: string,
): IdempotencyForm {
  return {
    ...form,
    schedule: form.schedule.filter((step) => step.uiKey !== uiKey),
  };
}
export function moveIdempotencyStep(
  form: IdempotencyForm,
  index: number,
  direction: -1 | 1,
): IdempotencyForm {
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
