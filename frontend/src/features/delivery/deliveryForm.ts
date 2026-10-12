import type { DeliveryInput, DeliveryLimits } from "../../api/types";

export type DeliveryForm = {
  acknowledgmentPolicy: DeliveryInput["acknowledgmentPolicy"];
  processingTimeMs: string;
  acknowledgmentDelayMs: string;
  visibilityTimeoutMs: string;
  maxDeliveryAttempts: string;
  seed: string;
  messages: string;
  consumers: string;
  failures: string;
  lostAcknowledgments: string;
};
export type DeliveryErrors = Partial<Record<keyof DeliveryForm, string>>;
export function toDeliveryForm(input: DeliveryInput): DeliveryForm {
  return {
    acknowledgmentPolicy: input.acknowledgmentPolicy,
    processingTimeMs: String(input.processingTimeMs),
    acknowledgmentDelayMs: String(input.acknowledgmentDelayMs),
    visibilityTimeoutMs: String(input.visibilityTimeoutMs),
    maxDeliveryAttempts: String(input.maxDeliveryAttempts),
    seed: String(input.seed),
    messages: input.messages
      .map((message) => `${message.id}, ${message.enqueueTimeMs}`)
      .join("\n"),
    consumers: input.consumers.map((consumer) => consumer.id).join("\n"),
    failures: input.failures
      .map(
        (failure) =>
          `${failure.consumerId}, ${failure.action}, ${failure.timeMs}`,
      )
      .join("\n"),
    lostAcknowledgments: input.lostAcknowledgments
      .map((loss) => `${loss.messageId}, ${loss.attempt}`)
      .join("\n"),
  };
}
const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
const whole = (value: string) =>
  /^-?\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value));
/** Parse human-readable rows only. The returned workload still executes entirely in Java. */
export function parseDeliveryForm(
  form: DeliveryForm,
  limits: DeliveryLimits,
): { errors: DeliveryErrors; input?: DeliveryInput } {
  const errors: DeliveryErrors = {};
  function number(
    value: string,
    field: keyof DeliveryForm,
    min: number,
    max: number,
  ) {
    if (!whole(value) || Number(value) < min || Number(value) > max)
      errors[field] = `Use a whole number from ${min} to ${max}.`;
    return Number(value);
  }
  const processingTimeMs = number(
    form.processingTimeMs,
    "processingTimeMs",
    limits.minProcessingTimeMs,
    limits.maxProcessingTimeMs,
  );
  const acknowledgmentDelayMs = number(
    form.acknowledgmentDelayMs,
    "acknowledgmentDelayMs",
    limits.minAcknowledgmentDelayMs,
    limits.maxAcknowledgmentDelayMs,
  );
  const visibilityTimeoutMs = number(
    form.visibilityTimeoutMs,
    "visibilityTimeoutMs",
    limits.minVisibilityTimeoutMs,
    limits.maxVisibilityTimeoutMs,
  );
  const maxDeliveryAttempts = number(
    form.maxDeliveryAttempts,
    "maxDeliveryAttempts",
    limits.minDeliveryAttempts,
    limits.maxDeliveryAttempts,
  );
  const seed = number(form.seed, "seed", limits.minSeed, limits.maxSeed);
  if (
    !["ACK_AFTER_EFFECT", "ACK_BEFORE_EFFECT"].includes(
      form.acknowledgmentPolicy,
    )
  )
    errors.acknowledgmentPolicy = "Choose when the consumer sends its ACK.";
  if (
    !errors.processingTimeMs &&
    !errors.acknowledgmentDelayMs &&
    form.acknowledgmentPolicy === "ACK_BEFORE_EFFECT" &&
    acknowledgmentDelayMs >= processingTimeMs
  )
    errors.acknowledgmentDelayMs =
      "ACK before effect needs an ACK delay shorter than processing time.";
  const pattern = new RegExp(limits.idPattern);
  const validId = (id: string) => pattern.exec(id)?.[0] === id;
  function rowError(field: keyof DeliveryForm, row: number, message: string) {
    errors[field] ??= `Line ${row + 1}: ${message}`;
  }
  const messages: DeliveryInput["messages"] = [];
  const messageIds = new Set<string>();
  lines(form.messages).forEach((line, index) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const [id = "", time = ""] = cells;
    if (
      cells.length !== 2 ||
      !validId(id) ||
      !whole(time) ||
      Number(time) < limits.minTimeMs ||
      Number(time) > limits.maxTimeMs
    )
      rowError(
        "messages",
        index,
        `use id, enqueue time (${limits.minTimeMs}–${limits.maxTimeMs} ms); IDs are lowercase and at most 32 characters.`,
      );
    else if (messageIds.has(id))
      rowError("messages", index, "message IDs must be unique.");
    else {
      messageIds.add(id);
      messages.push({ id, enqueueTimeMs: Number(time) });
    }
  });
  if (
    lines(form.messages).length < limits.minMessages ||
    lines(form.messages).length > limits.maxMessages
  )
    errors.messages = `Use ${limits.minMessages}–${limits.maxMessages} message rows.`;
  const consumers: DeliveryInput["consumers"] = [];
  const consumerIds = new Set<string>();
  lines(form.consumers).forEach((id, index) => {
    if (!validId(id))
      rowError(
        "consumers",
        index,
        "use one lowercase consumer ID, at most 32 characters.",
      );
    else if (consumerIds.has(id))
      rowError("consumers", index, "consumer IDs must be unique.");
    else {
      consumerIds.add(id);
      consumers.push({ id });
    }
  });
  if (
    lines(form.consumers).length < limits.minConsumers ||
    lines(form.consumers).length > limits.maxConsumers
  )
    errors.consumers = `Use ${limits.minConsumers}–${limits.maxConsumers} consumer rows.`;
  const failures: DeliveryInput["failures"] = [];
  lines(form.failures).forEach((line, index) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const [consumerId = "", action, time = ""] = cells;
    if (
      cells.length !== 3 ||
      !consumerIds.has(consumerId) ||
      !["CRASH", "RECOVER"].includes(action ?? "") ||
      !whole(time) ||
      Number(time) < limits.minTimeMs ||
      Number(time) > limits.maxTimeMs
    )
      rowError(
        "failures",
        index,
        "use an existing consumer ID, CRASH or RECOVER, time in milliseconds.",
      );
    else
      failures.push({
        consumerId,
        action: action as DeliveryInput["failures"][number]["action"],
        timeMs: Number(time),
      });
  });
  if (lines(form.failures).length > limits.maxFailures)
    errors.failures = `Use at most ${limits.maxFailures} total failure actions.`;
  for (const id of consumerIds) {
    const chronological = failures
      .filter((failure) => failure.consumerId === id)
      .sort((a, b) => a.timeMs - b.timeMs);
    let expected: DeliveryInput["failures"][number]["action"] = "CRASH";
    let previous = -1;
    for (const failure of chronological) {
      if (failure.timeMs === previous || failure.action !== expected) {
        errors.failures ??= `For ${id}, actions must alternate CRASH and RECOVER chronologically, starting with CRASH; use distinct times.`;
        break;
      }
      previous = failure.timeMs;
      expected = expected === "CRASH" ? "RECOVER" : "CRASH";
    }
  }
  const lostAcknowledgments: DeliveryInput["lostAcknowledgments"] = [];
  const losses = new Set<string>();
  lines(form.lostAcknowledgments).forEach((line, index) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const [messageId = "", attempt = ""] = cells;
    if (
      cells.length !== 2 ||
      !messageIds.has(messageId) ||
      !whole(attempt) ||
      Number(attempt) < limits.minDeliveryAttempts ||
      Number(attempt) > maxDeliveryAttempts
    )
      rowError(
        "lostAcknowledgments",
        index,
        "use an existing message ID and an attempt number within the selected delivery limit.",
      );
    else if (losses.has(`${messageId}/${Number(attempt)}`))
      rowError(
        "lostAcknowledgments",
        index,
        "each message/attempt pair must be unique.",
      );
    else {
      losses.add(`${messageId}/${Number(attempt)}`);
      lostAcknowledgments.push({ messageId, attempt: Number(attempt) });
    }
  });
  if (lines(form.lostAcknowledgments).length > limits.maxLostAcknowledgments)
    errors.lostAcknowledgments = `Use at most ${limits.maxLostAcknowledgments} lost-ACK selectors.`;
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    input: {
      schemaVersion: "1.0",
      modelVersion: "1.0.0",
      acknowledgmentPolicy: form.acknowledgmentPolicy,
      processingTimeMs,
      acknowledgmentDelayMs,
      visibilityTimeoutMs,
      maxDeliveryAttempts,
      seed,
      messages,
      consumers,
      failures,
      lostAcknowledgments,
    },
  };
}
