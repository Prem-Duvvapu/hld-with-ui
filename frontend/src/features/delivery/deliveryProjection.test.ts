import { expect, it } from "vitest";
import { deliveryAt } from "./deliveryProjection";
import { baselineResult } from "./deliveryTestFixtures";
it("reconstructs the real Java final state and ledger while clearing omitted consumer/broker pointers", () => {
  const before = structuredClone(baselineResult);
  const assigned = deliveryAt(
    baselineResult.initialState,
    baselineResult.events,
    1,
  );
  expect(assigned.state.messages[0]!.currentAttemptId).toBe("m1-a1");
  expect(assigned.state.consumers[0]!.currentAttemptId).toBe("m1-a1");
  const committed = deliveryAt(
    baselineResult.initialState,
    baselineResult.events,
    2,
  );
  expect(committed.state.consumers[0]!.currentAttemptId).toBeUndefined();
  expect(committed.state.messages[0]!.currentAttemptId).toBe("m1-a1");
  const final = deliveryAt(
    baselineResult.initialState,
    baselineResult.events,
    baselineResult.events.length - 1,
  );
  expect(final.state).toEqual(baselineResult.finalState);
  expect(final.ledger).toEqual(baselineResult.ledger);
  expect(final.state.messages[0]!.currentAttemptId).toBeUndefined();
  expect(baselineResult).toEqual(before);
});
it("backward seeks start from initial state and cannot expose later commits or ACKs", () => {
  deliveryAt(baselineResult.initialState, baselineResult.events, 4);
  const initial = deliveryAt(
    baselineResult.initialState,
    baselineResult.events,
    -1,
  );
  expect(initial.state).toEqual(baselineResult.initialState);
  expect(initial.ledger).toEqual([]);
  const effect = deliveryAt(
    baselineResult.initialState,
    baselineResult.events,
    2,
  );
  expect(effect.state.attempts[0]!.ackStatus).toBe("PENDING");
  expect(effect.ledger).toHaveLength(1);
  expect(
    deliveryAt(baselineResult.initialState, baselineResult.events, 1).ledger,
  ).toEqual([]);
});
