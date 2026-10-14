import { describe, expect, it } from "vitest";
import {
  assertReservationDescriptor,
  assertReservationInput,
  assertReservationResult,
  ReservationCompatibilityError,
} from "./reservationCompatibility";
import {
  descriptor,
  input,
  result,
  protectedInput,
  protectedResult,
} from "../features/reservations/reservationTestFixtures";
import type { ReservationResult } from "./types";

function rejects(mutator: (body: ReservationResult) => void, base = result) {
  const body = structuredClone(base);
  mutator(body);
  expect(() => assertReservationResult(body, body.input)).toThrow(
    ReservationCompatibilityError,
  );
}
describe("reservation wire compatibility", () => {
  it("accepts both actual Java goldens including completed unsafe false flags without mutating evidence", () => {
    const original = JSON.stringify({
      descriptor,
      input,
      result,
      protectedInput,
      protectedResult,
    });
    expect(() => assertReservationInput(input)).not.toThrow();
    expect(() => assertReservationDescriptor(descriptor)).not.toThrow();
    expect(() => assertReservationResult(result, input)).not.toThrow();
    expect(() =>
      assertReservationResult(protectedResult, protectedInput),
    ).not.toThrow();
    expect(result.finalState.allocatedUnits).toBeGreaterThan(
      input.initialUnits,
    );
    expect(protectedResult.finalState.reservations[1]!.observedRemaining).toBe(
      1,
    );
    expect(protectedResult.outcomes[3]!.checkedRemaining).toBe(0);
    expect(
      JSON.stringify({
        descriptor,
        input,
        result,
        protectedInput,
        protectedResult,
      }),
    ).toBe(original);
  });
  it("rejects closed-shape/coerced input and malformed success before projection", () => {
    for (const value of [
      null,
      [],
      false,
      1,
      "result",
      {},
      { ...result, modelVersion: "2.0.0" },
      { ...result, schemaVersion: "2.0" },
      { ...result, kind: "benchmark" },
      { ...result, latencyMs: 4 },
    ])
      expect(() => assertReservationResult(value, input)).toThrow(
        ReservationCompatibilityError,
      );
    for (const value of [
      null,
      [],
      { ...input, initialUnits: "1" },
      { ...input, seed: 42 },
    ])
      expect(() => assertReservationInput(value)).toThrow(
        "Check the reservation input",
      );
  });
  it("checks known IDs, uniqueness and exactly one READ before ATTEMPT for every actor", () => {
    for (const mutate of [
      (body: typeof input) => {
        body.reservations[1]!.id = "a";
      },
      (body: typeof input) => {
        body.schedule[1]!.id = body.schedule[0]!.id;
      },
      (body: typeof input) => {
        body.schedule[0]!.reservationId = "missing";
      },
      (body: typeof input) => {
        body.schedule.reverse();
      },
      (body: typeof input) => {
        body.schedule[2]!.action = "READ";
      },
      (body: typeof input) => {
        body.reservations.push({ id: "c", quantity: 1 });
      },
    ]) {
      const body = structuredClone(input);
      mutate(body);
      expect(() => assertReservationInput(body)).toThrow(
        "exactly one READ followed by one ATTEMPT_RESERVE",
      );
    }
  });
  it("allows reordered object keys while retaining captured quantities, strategy and schedule array order", () => {
    const body = structuredClone(result);
    body.input = {
      schedule: body.input.schedule.map(({ action, reservationId, id }) => ({
        action,
        reservationId,
        id,
      })),
      reservations: body.input.reservations.map(({ quantity, id }) => ({
        quantity,
        id,
      })),
      initialUnits: body.input.initialUnits,
      strategy: body.input.strategy,
      modelVersion: body.input.modelVersion,
      schemaVersion: body.input.schemaVersion,
    };
    expect(() => assertReservationResult(body, input)).not.toThrow();
    for (const submitted of [
      protectedInput,
      { ...input, initialUnits: 2 },
      { ...input, reservations: [...input.reservations].reverse() },
      {
        ...input,
        schedule: [
          input.schedule[1]!,
          input.schedule[0]!,
          ...input.schedule.slice(2),
        ],
      },
    ])
      expect(() => assertReservationResult(result, submitted)).toThrow(
        ReservationCompatibilityError,
      );
  });
  it("requires complete outcomes in original scheduled identity/action and contiguous order", () => {
    for (const mutate of [
      (body: ReservationResult) => {
        body.outcomes.pop();
      },
      (body: ReservationResult) => {
        body.outcomes[1]!.sequence = 3;
      },
      (body: ReservationResult) => {
        body.outcomes[1]!.stepId = "read-a";
      },
      (body: ReservationResult) => {
        body.outcomes[1]!.reservationId = "a";
      },
      (body: ReservationResult) => {
        body.outcomes[0]!.action = "ATTEMPT_RESERVE";
      },
    ])
      rejects(mutate);
  });
  it("rejects missing/unknown/duplicate/reordered actors and changed captured quantities in snapshots", () => {
    for (const mutate of [
      (body: ReservationResult) => {
        body.outcomes[0]!.postState.reservations[1]!.id = "missing";
      },
      (body: ReservationResult) => {
        body.outcomes[0]!.postState.reservations[1]!.id = "a";
      },
      (body: ReservationResult) => {
        body.outcomes[0]!.postState.reservations.pop();
      },
      (body: ReservationResult) => {
        body.outcomes[0]!.postState.reservations.reverse();
      },
      (body: ReservationResult) => {
        body.outcomes[0]!.postState.reservations[0]!.quantity = 2;
      },
      (body: ReservationResult) => {
        body.initialState.remainingUnits = 2;
      },
    ])
      rejects(mutate);
  });
  it("requires READ evidence to change only the named actor's reported observation", () => {
    rejects((body) => {
      body.outcomes[0]!.postState.remainingUnits = 0;
    });
    rejects((body) => {
      body.outcomes[0]!.postState.invariants.accountedUnits = 2;
    });
    rejects((body) => {
      body.outcomes[0]!.observedRemaining = 0;
      body.outcomes[0]!.postState.reservations[0]!.observedRemaining = 0;
    });
    rejects((body) => {
      body.outcomes[1]!.postState.reservations[0]!.observedRemaining = 0;
    });
  });
  it("binds attempts to retained observations/current state and captured strategy without deciding acceptance", () => {
    rejects((body) => {
      body.outcomes[2]!.checkSource = "CURRENT";
    });
    rejects((body) => {
      body.outcomes[3]!.checkedRemaining = 0;
    });
    rejects((body) => {
      body.outcomes[2]!.quantity = 2;
    });
    rejects((body) => {
      body.outcomes[2]!.postState.reservations[0]!.observedRemaining = 0;
    });
    rejects((body) => {
      body.outcomes[3]!.checkedRemaining = 1;
    }, protectedResult);
  });
  it("binds accepted allocation identities/quantity/origin step and preserves the existing ledger prefix", () => {
    for (const mutate of [
      (body: ReservationResult) => {
        body.outcomes[2]!.postState.allocations[0]!.reservationId = "missing";
      },
      (body: ReservationResult) => {
        body.outcomes[2]!.postState.allocations[0]!.quantity = 2;
      },
      (body: ReservationResult) => {
        body.outcomes[2]!.postState.allocations[0]!.stepId = "read-a";
      },
      (body: ReservationResult) => {
        body.outcomes[2]!.postState.allocations[0]!.stepId = "attempt-b";
      },
      (body: ReservationResult) => {
        body.outcomes[3]!.postState.allocations[1]!.reservationId = "a";
      },
      (body: ReservationResult) => {
        body.outcomes[3]!.postState.allocations.reverse();
      },
      (body: ReservationResult) => {
        body.outcomes[3]!.postState.allocations.shift();
      },
    ])
      rejects(mutate);
  });
  it("requires rejection to keep shared quantities/ledger unchanged while retaining the actor's read", () => {
    rejects((body) => {
      body.outcomes[3]!.postState.remainingUnits = 1;
    }, protectedResult);
    rejects((body) => {
      body.outcomes[3]!.postState.allocatedUnits = 0;
    }, protectedResult);
    rejects((body) => {
      body.outcomes[3]!.postState.allocations = [];
    }, protectedResult);
    rejects((body) => {
      body.outcomes[3]!.postState.reservations[1]!.observedRemaining = 0;
    }, protectedResult);
  });
  it("requires final state to equal the last returned snapshot and metric final values to match it", () => {
    rejects((body) => {
      body.finalState.remainingUnits = 1;
    });
    rejects((body) => {
      body.finalState.reservations.reverse();
    });
    rejects((body) => {
      body.metrics.finalRemainingUnits = 1;
    });
    rejects((body) => {
      body.metrics.finalAllocatedUnits = 1;
    });
    rejects((body) => {
      body.metrics.acceptedReservations = 3;
    });
  });
  it("correlates first violation with actual reported flags without recomputing invariant arithmetic", () => {
    rejects((body) => {
      body.metrics.firstViolationStepId = "attempt-a";
    });
    rejects((body) => {
      body.metrics.invariantStatus = "PRESERVED";
      delete body.metrics.firstViolationStepId;
    });
    rejects((body) => {
      body.outcomes[2]!.postState.invariants.unitsConserved = false;
    });
    rejects((body) => {
      body.metrics.invariantStatus = "VIOLATED";
      body.metrics.firstViolationStepId = "attempt-b";
    }, protectedResult);
  });
  it("rejects descriptors with unsupported limits/defaults, missing baselines and illegal preset schedules", () => {
    for (const body of [
      null,
      { ...descriptor, limits: { ...descriptor.limits, maxSteps: 9 } },
      { ...descriptor, defaultInput: input },
      {
        ...descriptor,
        presets: [...descriptor.presets, descriptor.presets[0]],
      },
      {
        ...descriptor,
        presets: descriptor.presets.filter(
          (preset) => preset.id !== "unsafe-baseline",
        ),
      },
      {
        ...descriptor,
        presets: descriptor.presets.map((preset) => ({
          ...preset,
          input: {
            ...preset.input,
            schedule: [...preset.input.schedule].reverse(),
          },
        })),
      },
    ])
      expect(() => assertReservationDescriptor(body)).toThrow(
        ReservationCompatibilityError,
      );
  });
});
