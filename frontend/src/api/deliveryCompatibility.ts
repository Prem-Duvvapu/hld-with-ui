import Ajv2020 from "ajv/dist/2020.js";
import inputSchema from "../../../contracts/queue-delivery.input.schema.json";
import resultSchema from "../../../contracts/queue-delivery.result.schema.json";
import descriptorSchema from "./schemas/delivery-descriptor.schema.json";
import type {
  DeliveryDescriptor,
  DeliveryInput,
  DeliveryResult,
} from "./types";

/** Loaded only by delivery API methods; closed shapes come from canonical contracts. */
const ajv = new Ajv2020({
  allErrors: false,
  strict: true,
  strictRequired: false,
});
const validInput = ajv.compile(inputSchema);
const validDescriptor = ajv.compile(descriptorSchema);
const validResult = ajv.compile(resultSchema);

export class DeliveryCompatibilityError extends Error {
  constructor() {
    super(
      "This delivery response is incompatible with this app. Refresh and try again. If this continues, update the frontend and backend together.",
    );
    this.name = "DeliveryCompatibilityError";
  }
}

function unique(values: readonly string[]) {
  return new Set(values).size === values.length;
}

function descriptorMatches(body: DeliveryDescriptor) {
  return (
    unique(body.presets.map((preset) => preset.id)) &&
    body.presets.some((preset) => preset.id === "baseline")
  );
}

function resultMatches(body: DeliveryResult) {
  const messages = new Map(
    body.initialState.messages.map((message) => [message.id, message]),
  );
  const consumers = new Set(
    body.initialState.consumers.map((consumer) => consumer.id),
  );
  const attempts = new Map(
    body.finalState.attempts.map((attempt) => [attempt.id, attempt]),
  );
  if (
    messages.size !== body.initialState.messages.length ||
    consumers.size !== body.initialState.consumers.length ||
    attempts.size !== body.finalState.attempts.length ||
    body.initialState.attempts.length !== 0 ||
    body.initialState.messages.some(
      (message) =>
        message.status !== "NOT_ENQUEUED" ||
        message.deliveryCount !== 0 ||
        message.availableSinceMs != null ||
        message.currentAttemptId != null ||
        message.acknowledgedAtMs != null,
    ) ||
    body.initialState.consumers.some(
      (consumer) =>
        consumer.status !== "READY" || consumer.currentAttemptId != null,
    ) ||
    body.messageOutcomes.length !== messages.size ||
    body.finalState.messages.length !== messages.size ||
    body.finalState.consumers.length !== consumers.size ||
    body.attemptOutcomes.length !== attempts.size ||
    !unique(body.messageOutcomes.map((outcome) => outcome.messageId)) ||
    !unique(body.finalState.messages.map((message) => message.id)) ||
    !unique(body.finalState.consumers.map((consumer) => consumer.id)) ||
    !unique(body.attemptOutcomes.map((attempt) => attempt.id))
  )
    return false;
  const knownMessage = (
    message: DeliveryResult["finalState"]["messages"][number],
  ) =>
    messages.get(message.id)?.enqueueTimeMs === message.enqueueTimeMs &&
    (message.currentAttemptId == null ||
      attempts.get(message.currentAttemptId)?.messageId === message.id);
  const knownConsumer = (
    consumer: DeliveryResult["finalState"]["consumers"][number],
  ) =>
    consumers.has(consumer.id) &&
    (consumer.currentAttemptId == null ||
      attempts.get(consumer.currentAttemptId)?.consumerId === consumer.id);
  const knownAttempt = (
    attempt: DeliveryResult["finalState"]["attempts"][number],
  ) =>
    messages.has(attempt.messageId) &&
    consumers.has(attempt.consumerId) &&
    attempt.id === `${attempt.messageId}-a${attempt.attempt}` &&
    attempt.leaseToken === `${attempt.id}-lease` &&
    attempts.get(attempt.id)?.consumerId === attempt.consumerId;
  if (
    !body.finalState.messages.every(knownMessage) ||
    !body.finalState.consumers.every(knownConsumer) ||
    !body.finalState.attempts.every(knownAttempt) ||
    !body.attemptOutcomes.every(knownAttempt) ||
    !body.messageOutcomes.every((outcome) => messages.has(outcome.messageId)) ||
    !unique(body.ledger.map((entry) => entry.id)) ||
    !body.ledger.every((entry) => {
      const attempt = attempts.get(entry.attemptId);
      return (
        attempt?.messageId === entry.messageId &&
        attempt.consumerId === entry.consumerId &&
        entry.id === `${entry.attemptId}-effect`
      );
    }) ||
    !body.failureOutcomes.every(
      (failure, index) =>
        failure.index === index && consumers.has(failure.consumerId),
    ) ||
    !body.lostAcknowledgmentOutcomes.every((loss) =>
      messages.has(loss.messageId),
    )
  )
    return false;
  let previousTime = 0;
  for (let index = 0; index < body.events.length; index++) {
    const event = body.events[index]!;
    const attempt =
      event.attemptId == null ? undefined : attempts.get(event.attemptId);
    if (
      event.sequence !== index + 1 ||
      event.timeMs < previousTime ||
      event.timeMs > body.lastVirtualTimeMs ||
      (event.messageId != null && !messages.has(event.messageId)) ||
      (event.consumerId != null && !consumers.has(event.consumerId)) ||
      (event.attemptId != null &&
        (!attempt ||
          attempt.messageId !== event.messageId ||
          attempt.consumerId !== event.consumerId)) ||
      !unique(event.changes.messages.map((message) => message.id)) ||
      !unique(event.changes.consumers.map((consumer) => consumer.id)) ||
      !unique(event.changes.attempts.map((changed) => changed.id)) ||
      !event.changes.messages.every(knownMessage) ||
      !event.changes.consumers.every(knownConsumer) ||
      !event.changes.attempts.every(knownAttempt) ||
      (event.ledgerEntry != null &&
        (event.ledgerEntry.messageId !== event.messageId ||
          event.ledgerEntry.attemptId !== event.attemptId ||
          event.ledgerEntry.consumerId !== event.consumerId ||
          event.ledgerEntry.committedAtMs !== event.timeMs ||
          event.ledgerEntry.id !== `${event.attemptId}-effect`))
    )
      return false;
    previousTime = event.timeMs;
  }
  return body.lastVirtualTimeMs === previousTime;
}

/** Reject unsupported wire shapes and unsafe entity references before trace projection. */
export function assertDeliveryCompatibility(
  body: unknown,
  kind: "descriptor" | "result",
): void {
  if (kind === "descriptor") {
    if (
      !validDescriptor(body) ||
      !descriptorMatches(body as DeliveryDescriptor)
    )
      throw new DeliveryCompatibilityError();
  } else if (!validResult(body) || !resultMatches(body as DeliveryResult))
    throw new DeliveryCompatibilityError();
}

/** The response must belong to the captured seed and initial authored workload identities/times. */
export function assertDeliveryRunInput(
  result: DeliveryResult,
  input: DeliveryInput,
): void {
  if (!validInput(input)) throw new DeliveryCompatibilityError();
  // Correlate recorded input parameters without inferring completions or recomputing metrics.
  const matchesSchedule = (
    attempt: DeliveryResult["attemptOutcomes"][number],
  ) =>
    attempt.attempt <= input.maxDeliveryAttempts &&
    attempt.scheduledEffectAtMs - attempt.startedAtMs ===
      input.processingTimeMs &&
    attempt.leaseDeadlineMs - attempt.startedAtMs ===
      input.visibilityTimeoutMs &&
    attempt.scheduledAckAtMs -
      (input.acknowledgmentPolicy === "ACK_BEFORE_EFFECT"
        ? attempt.startedAtMs
        : attempt.scheduledEffectAtMs) ===
      input.acknowledgmentDelayMs;
  if (
    result.seed !== input.seed ||
    result.initialState.messages.length !== input.messages.length ||
    result.initialState.consumers.length !== input.consumers.length ||
    !result.initialState.messages.every(
      (message, index) =>
        message.id === input.messages[index]!.id &&
        message.enqueueTimeMs === input.messages[index]!.enqueueTimeMs,
    ) ||
    !result.initialState.consumers.every(
      (consumer, index) => consumer.id === input.consumers[index]!.id,
    ) ||
    result.failureOutcomes.length !== input.failures.length ||
    !result.failureOutcomes.every((failure, index) => {
      const submitted = input.failures[index]!;
      return (
        failure.consumerId === submitted.consumerId &&
        failure.action === submitted.action &&
        failure.timeMs === submitted.timeMs
      );
    }) ||
    result.lostAcknowledgmentOutcomes.length !==
      input.lostAcknowledgments.length ||
    !result.lostAcknowledgmentOutcomes.every(
      (loss, index) =>
        loss.messageId === input.lostAcknowledgments[index]!.messageId &&
        loss.attempt === input.lostAcknowledgments[index]!.attempt,
    ) ||
    !result.finalState.attempts.every(matchesSchedule) ||
    !result.attemptOutcomes.every(matchesSchedule) ||
    !result.events.every((event) =>
      event.changes.attempts.every(matchesSchedule),
    ) ||
    !result.messageOutcomes.every(
      (message) => message.deliveries <= input.maxDeliveryAttempts,
    )
  )
    throw new DeliveryCompatibilityError();
}
