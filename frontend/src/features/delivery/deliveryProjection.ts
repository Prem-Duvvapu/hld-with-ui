import type {
  DeliveryEvent,
  DeliveryLedgerEntry,
  DeliveryState,
} from "../../api/types";
export type DeliverySnapshot = {
  state: DeliveryState;
  ledger: DeliveryLedgerEntry[];
};
/** Apply every preceding Java delta. Each changed entity is a complete replacement, including absent optional fields. */
export function deliveryAt(
  initial: DeliveryState,
  events: readonly DeliveryEvent[],
  position: number,
): DeliverySnapshot {
  const messages = new Map(
    initial.messages.map((message) => [message.id, { ...message }]),
  );
  const consumers = new Map(
    initial.consumers.map((consumer) => [consumer.id, { ...consumer }]),
  );
  const attempts = new Map(
    initial.attempts.map((attempt) => [attempt.id, { ...attempt }]),
  );
  const ledger: DeliveryLedgerEntry[] = [];
  for (let index = 0; index <= Math.min(position, events.length - 1); index++) {
    const event = events[index]!;
    event.changes.messages.forEach((message) =>
      messages.set(message.id, { ...message }),
    );
    event.changes.consumers.forEach((consumer) =>
      consumers.set(consumer.id, { ...consumer }),
    );
    event.changes.attempts.forEach((attempt) =>
      attempts.set(attempt.id, { ...attempt }),
    );
    if (event.ledgerEntry) ledger.push({ ...event.ledgerEntry });
  }
  return {
    state: {
      messages: [...messages.values()],
      consumers: [...consumers.values()],
      attempts: [...attempts.values()],
    },
    ledger,
  };
}
