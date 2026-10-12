import input from "../../../contracts/examples/queue-delivery-baseline-input.json";
import result from "../../../contracts/examples/queue-delivery-baseline-result.json";
import descriptorSchema from "./schemas/delivery-descriptor.schema.json";
import type {
  DeliveryDescriptor,
  DeliveryInput,
  DeliveryLimits,
  DeliveryResult,
} from "./types";

// The baseline artifact is compared with real application Jackson output in Java tests.
export const baselineInput = input as DeliveryInput;
export const baselineResult = result as DeliveryResult;
export const descriptor: DeliveryDescriptor = {
  id: "queues-delivery",
  title: "Delivery, ACKs & Duplicate Work",
  kind: "simulation",
  modelVersion: "1.0.0",
  description:
    "Illustrative independent broker acknowledgment and ledger effect boundaries.",
  limits: Object.fromEntries(
    Object.entries(descriptorSchema.$defs.DeliveryLimits.properties).map(
      ([key, schema]) => [key, schema.const],
    ),
  ) as DeliveryLimits,
  presets: [
    {
      id: "baseline",
      title: "ACK after effect",
      question: "Does ACK alone prevent duplicate work?",
      input: baselineInput,
    },
  ],
  assumptions: baselineResult.assumptions,
};

// Structural empty-prefix fixture only; integration tests separately execute genuine Java limits.
export const beforeFirstEvent: DeliveryResult = {
  ...baselineResult,
  status: "limited",
  truncationReason: "event_limit",
  lastVirtualTimeMs: 0,
  events: [],
  finalState: baselineResult.initialState,
  attemptOutcomes: [],
  ledger: [],
  messageOutcomes: [
    {
      messageId: "m1",
      status: "NOT_ENQUEUED",
      deliveries: 0,
      committedEffects: 0,
    },
  ],
  metrics: {
    deliveryAttempts: 0,
    redeliveries: 0,
    committedEffects: 0,
    messagesWithEffect: 0,
    extraEffects: 0,
    acknowledgedMessages: 0,
    deadLetteredMessages: 0,
    notEnqueued: 1,
    ready: 0,
    leased: 0,
    runningEffects: 0,
    pendingAcknowledgments: 0,
    pendingFailureActions: 0,
    pendingEnqueues: 1,
    ackLatencySamples: 0,
    effectLatencySamples: 0,
  },
};
