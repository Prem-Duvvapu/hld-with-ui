import type { DeliveryEvent, DeliveryResult } from "../../api/types";
export const deliveryEventLabels: Record<DeliveryEvent["kind"], string> = {
  "message.enqueued": "The broker makes the message ready",
  "delivery.started": "A consumer receives a new attempt",
  "effect.committed": "The ledger records the effect",
  "ack.sent": "The consumer sends an ACK",
  "ack.accepted": "The broker accepts the ACK",
  "ack.lost": "The ACK never reaches the broker",
  "ack.stale": "The broker rejects this attempt's ACK",
  "lease.expired": "This attempt's lease expires",
  "message.requeued": "The broker makes the message eligible again",
  "message.dead-lettered":
    "The delivery limit sends the message to dead letter",
  "consumer.crashed": "The consumer goes down",
  "consumer.recovered": "The consumer becomes available",
  "attempt.cancelled": "The crash cancels remaining local work",
};
export const deliveryLimitLabels: Record<
  NonNullable<DeliveryResult["truncationReason"]>,
  string
> = {
  event_limit: "Event limit reached",
  trace_size_limit: "Trace size limit reached",
  virtual_time_limit: "Virtual time limit reached",
  wall_time_limit: "Elapsed run time limit reached",
  no_future_progress:
    "No available consumer or future recovery can make progress",
};
const format = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
export const deliveryNumber = (value: number | null | undefined) =>
  value == null ? "Unavailable" : format.format(value);
export const observedTime = (value: number | null | undefined) =>
  value == null ? "Not observed" : `${deliveryNumber(value)} ms`;
