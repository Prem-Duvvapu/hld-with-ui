import authoredCheckpoints from "../../../content/topics/idempotency/checkpoints.json";
import { describe, expect, it } from "vitest";
import {
  assertIdempotencyDescriptor,
  assertIdempotencyCheckpoints,
  assertIdempotencyInput,
  assertIdempotencyResult,
  IdempotencyCompatibilityError,
} from "./idempotencyCompatibility";
import {
  descriptor,
  pairs,
  input,
  result,
  atomicInput,
  atomicResult,
  splitResult,
} from "./idempotencyTestFixtures";
import type { IdempotencyInput, IdempotencyResult } from "./types";

function rejects(
  mutate: (value: IdempotencyResult) => void,
  base = atomicResult,
) {
  const value = structuredClone(base);
  mutate(value);
  expect(() => assertIdempotencyResult(value, base.input)).toThrow(
    IdempotencyCompatibilityError,
  );
}
describe("idempotency evidence compatibility", () => {
  it("accepts all nine complete Java examples and the actual GET descriptor without mutation", () => {
    const before = JSON.stringify({ descriptor, pairs });
    expect(() => assertIdempotencyDescriptor(descriptor)).not.toThrow();
    for (const pair of pairs) {
      expect(() => assertIdempotencyInput(pair.input)).not.toThrow();
      expect(() =>
        assertIdempotencyResult(pair.result, pair.input),
      ).not.toThrow();
    }
    expect(JSON.stringify({ descriptor, pairs })).toBe(before);
  });
  it("retains actual split-crash public effects, atomic replay receipts and expiry history", () => {
    const crashed = splitResult.finalState.calls.find(
      (call) => call.phase === "CRASHED",
    )!;
    expect(crashed.publishedEffectId).toBeDefined();
    expect(crashed.resolvedRecordId).toBeUndefined();
    expect(crashed.receipt).toBeUndefined();
    expect(atomicResult.finalState.calls[1]!.receipt).toEqual(
      atomicResult.finalState.calls[0]!.receipt,
    );
    const expired = pairs.find((pair) => pair.id === "retention-boundary")!;
    expect(
      expired.result.finalState.keyRecords.some(
        (record) => record.status === "EXPIRED",
      ),
    ).toBe(true);
    expect(() =>
      assertIdempotencyResult(expired.result, expired.input),
    ).not.toThrow();
  });
  it("rejects closed schema, version, type, null and unsupported capability changes", () => {
    for (const value of [
      null,
      [],
      {},
      { ...result, modelVersion: "2.0.0" },
      { ...result, seed: 1 },
      { ...result, outcomes: [] },
    ])
      expect(() => assertIdempotencyResult(value, input)).toThrow(
        IdempotencyCompatibilityError,
      );
    for (const value of [
      null,
      { ...input, retentionMs: "1" },
      { ...input, seed: 1 },
      { ...input, retentionMs: null },
    ])
      expect(() => assertIdempotencyInput(value)).toThrow(
        "Check the idempotency input",
      );
  });
  it("checks unique IDs, call references, chronological steps and tenant-scoped audit payloads", () => {
    const mutations: ((value: IdempotencyInput) => void)[] = [
      (value) => {
        value.calls[1]!.id = value.calls[0]!.id;
      },
      (value) => {
        value.schedule[1]!.id = value.schedule[0]!.id;
      },
      (value) => {
        value.schedule[0]!.callId = "unknown";
      },
      (value) => {
        value.schedule[0]!.timeMs = 1;
      },
      (value) => {
        value.calls[1]!.units += 1;
      },
    ];
    for (const mutate of mutations) {
      const value = structuredClone(input);
      mutate(value);
      expect(() => assertIdempotencyInput(value)).toThrow();
    }
    const separateTenant = structuredClone(input);
    separateTenant.calls[1]!.tenantId = "other-tenant";
    separateTenant.calls[1]!.units += 1;
    expect(() => assertIdempotencyInput(separateTenant)).not.toThrow();
  });
  it("rejects missing or duplicate teaching presets, invalid preset references and incorrect public limits", () => {
    for (const mutate of [
      (value: typeof descriptor) => {
        value.presets.pop();
      },
      (value: typeof descriptor) => {
        value.presets[1]!.id = value.presets[0]!.id;
      },
      (value: typeof descriptor) => {
        value.presets[0]!.input.schedule[0]!.callId = "unknown";
      },
      (value: typeof descriptor) => {
        Object.assign(value.limits, { maxCalls: 13 });
      },
    ]) {
      const value = structuredClone(descriptor);
      mutate(value);
      expect(() => assertIdempotencyDescriptor(value)).toThrow(
        IdempotencyCompatibilityError,
      );
    }
  });
  it("requires the response to describe the captured submitted workload and authored schedule", () => {
    expect(() =>
      assertIdempotencyResult(atomicResult, {
        ...atomicInput,
        retentionMs: 50,
      }),
    ).toThrow(IdempotencyCompatibilityError);
    rejects((value) => {
      value.outcomes.pop();
    });
    rejects((value) => {
      value.outcomes[0]!.sequence = 2;
    });
    rejects((value) => {
      value.outcomes[0]!.stepId = "unknown";
    });
    rejects((value) => {
      value.outcomes[0]!.callId = "unknown";
    });
    rejects((value) => {
      value.outcomes[0]!.timeMs += 1;
    });
    rejects((value) => {
      value.initialState.calls[0]!.id = "unknown";
    });
  });
  it("rejects foreign effects, receipt ownership changes and fabricated scoped record references", () => {
    rejects((value) => {
      value.outcomes.find(
        (outcome) => outcome.kind === "ATOMIC_COMMITTED",
      )!.postState.effects[0]!.callId = "unknown";
    });
    rejects((value) => {
      value.outcomes.find(
        (outcome) => outcome.kind === "ATOMIC_COMMITTED",
      )!.postState.effects[0]!.tenantId = "other";
    });
    rejects((value) => {
      value.outcomes.find(
        (outcome) => outcome.kind === "ATOMIC_COMMITTED",
      )!.postState.keyRecords[0]!.receipt.effectId = "effect-unknown";
    });
    rejects((value) => {
      value.outcomes.find(
        (outcome) => outcome.kind === "LOOKUP_REPLAYED",
      )!.postState.calls[1]!.receipt!.effectId = "effect-b";
    });
    rejects((value) => {
      value.outcomes.find(
        (outcome) => outcome.kind === "LOOKUP_REPLAYED",
      )!.postState.calls[1]!.resolvedRecordId = "record-unknown";
    });
  });
  it("rejects rewritten append-only evidence, expired record resurrection and unrelated call changes", () => {
    rejects((value) => {
      value.outcomes.find(
        (outcome) => outcome.kind === "RESPONSE_LOST",
      )!.postState.effects[0]!.publishedAtMs = 1;
    });
    rejects((value) => {
      value.outcomes.find(
        (outcome) => outcome.kind === "RESPONSE_LOST",
      )!.postState.keyRecords[0]!.expiresAtMs += 1;
    });
    rejects((value) => {
      value.outcomes[0]!.postState.calls[1]!.id = "other";
    });
    const expiry = pairs.find(
      (pair) => pair.id === "retention-boundary",
    )!.result;
    rejects((value) => {
      value.outcomes.at(-1)!.postState.keyRecords[0]!.status = "ACTIVE";
    }, expiry);
  });
  it("requires final reported evidence and its direct headers to agree", () => {
    rejects((value) => {
      value.finalState.publishedUnits += 1;
    });
    rejects((value) => {
      value.metrics.calls -= 1;
    });
    rejects((value) => {
      value.metrics.finalTimeMs += 1;
    });
  });
  it("leaves effect arithmetic, expiry decisions and computed metrics authoritative in Java", () => {
    const evidence = structuredClone(result);
    evidence.metrics.extraEffects = 0;
    evidence.metrics.publishedUnits = 999;
    expect(() => assertIdempotencyResult(evidence, input)).not.toThrow();
    // Compatibility checks reported references; Java semantic tests verify formulas and decisions.
  });
});

describe("idempotency authored checkpoint compatibility", () => {
  it("accepts the actual authored checkpoints against the actual Java descriptor without mutation", () => {
    const before = JSON.stringify({ authoredCheckpoints, descriptor });
    expect(() =>
      assertIdempotencyCheckpoints(authoredCheckpoints, descriptor),
    ).not.toThrow();
    expect(JSON.stringify({ authoredCheckpoints, descriptor })).toBe(before);
  });
  it("rejects absent, empty and non-array checkpoint collections", () => {
    for (const value of [undefined, null, [], {}, true, "checkpoints"])
      expect(() => assertIdempotencyCheckpoints(value, descriptor)).toThrow(
        IdempotencyCompatibilityError,
      );
  });
  it("rejects duplicate IDs, foreign simulations/kinds and missing preset or scheduled step references", () => {
    const mutations: ((value: typeof authoredCheckpoints) => void)[] = [
      (value) => {
        value[1]!.id = value[0]!.id;
      },
      (value) => {
        value[0]!.simulationId = "transaction-atomicity";
      },
      (value) => {
        value[0]!.presetId = "unknown-preset";
      },
      (value) => {
        value[0]!.target.stepId = "unknown-step";
      },
      (value) => {
        value[0]!.target.kind = "TRANSACTION_COMMITTED";
      },
      (value) => {
        value[0]!.target.kind = "READ_OBSERVED";
      },
      (value) => {
        value[0]!.target.kind = "REQUEST_SUCCEEDED";
      },
      (value) => {
        value[0]!.target.kind = "UNKNOWN";
      },
    ];
    for (const mutate of mutations) {
      const value = structuredClone(authoredCheckpoints);
      mutate(value);
      expect(() => assertIdempotencyCheckpoints(value, descriptor)).toThrow(
        IdempotencyCompatibilityError,
      );
    }
  });
  it("rejects malformed, nullable, mixed and extra target fields and non-unique occurrences", () => {
    const checkpoint = authoredCheckpoints[0]!;
    for (const target of [
      null,
      [],
      {},
      { ...checkpoint.target, stepId: null },
      { ...checkpoint.target, stepId: "lost-a\n" },
      { ...checkpoint.target, stepId: "s".repeat(33) },
      { ...checkpoint.target, occurrence: 2 },
      { ...checkpoint.target, occurrence: 0 },
      { ...checkpoint.target, occurrence: 1.5 },
      { ...checkpoint.target, occurrence: "1" },
      ...[
        "operation",
        "jobId",
        "messageId",
        "attemptId",
        "operationId",
        "requestId",
        "callId",
        "eventId",
        "unknown",
      ].map((field) => ({ ...checkpoint.target, [field]: null })),
      { kind: checkpoint.target.kind, occurrence: 1 },
      { stepId: checkpoint.target.stepId, occurrence: 1 },
      { stepId: checkpoint.target.stepId, kind: checkpoint.target.kind },
    ])
      expect(() =>
        assertIdempotencyCheckpoints([{ ...checkpoint, target }], descriptor),
      ).toThrow(IdempotencyCompatibilityError);
    expect(() =>
      assertIdempotencyCheckpoints(
        [{ ...checkpoint, invented: true }],
        descriptor,
      ),
    ).toThrow(IdempotencyCompatibilityError);
    expect(() =>
      assertIdempotencyCheckpoints(
        [{ ...checkpoint, tradeoff: null }],
        descriptor,
      ),
    ).toThrow(IdempotencyCompatibilityError);
  });
  it("checks references without recomputing which outcome an action should produce", () => {
    const value = structuredClone(authoredCheckpoints);
    value[0]!.target.kind = "ATOMIC_COMMITTED";
    expect(() => assertIdempotencyCheckpoints(value, descriptor)).not.toThrow();
    // This static guard cannot prove that kind occurs. Java checkpoint tests and the evidence resolver do.
  });
});
