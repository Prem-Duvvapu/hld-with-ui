import { describe, expect, it } from "vitest";
import {
  assertAtomicityDescriptor,
  assertAtomicityInput,
  assertAtomicityResult,
  AtomicityCompatibilityError,
} from "./atomicityCompatibility";
import {
  input,
  result,
  protectedInput,
  protectedResult,
  conflictInput,
  conflictResult,
  descriptor,
} from "../features/atomicity/atomicityTestFixtures";
import maximumInput from "../../../contracts/examples/transaction-atomicity-max-boundary-input.json";
import maximumResult from "../../../contracts/examples/transaction-atomicity-max-boundary-result.json";
import type { AtomicityInput, AtomicityResult } from "./types";

function rejects(mutate: (body: AtomicityResult) => void, base = result) {
  const submitted = structuredClone(base.input),
    body = structuredClone(base);
  mutate(body);
  expect(() => assertAtomicityResult(body, submitted)).toThrow(
    AtomicityCompatibilityError,
  );
}
describe("atomicity wire compatibility", () => {
  it("accepts all four actual complete Java goldens including split leak and protected conflict without mutation", () => {
    const pairs = [
      [input, result],
      [protectedInput, protectedResult],
      [conflictInput, conflictResult],
      [maximumInput as AtomicityInput, maximumResult as AtomicityResult],
    ] as const;
    const original = JSON.stringify(pairs);
    for (const [captured, evidence] of pairs) {
      expect(() => assertAtomicityInput(captured)).not.toThrow();
      expect(() => assertAtomicityResult(evidence, captured)).not.toThrow();
    }
    expect(() => assertAtomicityDescriptor(descriptor)).not.toThrow();
    expect(result.finalState.invariants.abortedEffectsAbsent).toBe(false);
    expect(conflictResult.outcomes.at(-1)!.reason).toBe("REVISION_CONFLICT");
    expect(JSON.stringify(pairs)).toBe(original);
  });
  it("rejects malformed scalar/closed-version input and success envelopes", () => {
    for (const value of [
      null,
      [],
      false,
      "result",
      {},
      { ...result, modelVersion: "2.0.0" },
      { ...result, kind: "benchmark" },
      { ...result, events: [] },
    ])
      expect(() => assertAtomicityResult(value, input)).toThrow(
        AtomicityCompatibilityError,
      );
    for (const value of [
      null,
      [],
      { ...input, initialUnits: "1" },
      { ...input, initialUnits: 1.5 },
      { ...input, seed: 1 },
      { ...input, mode: "SERIALIZABLE" },
    ])
      expect(() => assertAtomicityInput(value)).toThrow(
        "Check the atomicity input",
      );
  });
  it("requires unique known actors and steps with a complete legal program per actor", () => {
    for (const mutate of [
      (v: AtomicityInput) => {
        v.transactions[1]!.id = v.transactions[0]!.id;
      },
      (v: AtomicityInput) => {
        v.schedule[1]!.id = v.schedule[0]!.id;
      },
      (v: AtomicityInput) => {
        v.schedule[0]!.transactionId = "unknown";
      },
      (v: AtomicityInput) => {
        v.schedule.reverse();
      },
      (v: AtomicityInput) => {
        v.schedule[2]!.action = "BEGIN";
      },
      (v: AtomicityInput) => {
        v.schedule[4]!.action = "COMMIT";
      },
      (v: AtomicityInput) => {
        v.schedule.pop();
      },
      (v: AtomicityInput) => {
        v.schedule.push({ id: "after-a", transactionId: "a", action: "ABORT" });
      },
    ]) {
      const body = structuredClone(conflictInput);
      mutate(body);
      expect(() => assertAtomicityInput(body)).toThrow("complete program");
    }
    const early = structuredClone(input);
    early.schedule.splice(1, 1);
    expect(() => assertAtomicityInput(early)).not.toThrow();
    const newline = structuredClone(input);
    newline.transactions[0]!.id += "\n";
    expect(() => assertAtomicityInput(newline)).toThrow(
      "Check the atomicity input",
    );
  });
  it("ignores object key order while preserving captured mode, quantity and array order", () => {
    const body = structuredClone(conflictResult);
    body.input = {
      schedule: body.input.schedule.map(({ action, transactionId, id }) => ({
        action,
        transactionId,
        id,
      })),
      transactions: body.input.transactions.map(({ quantity, id }) => ({
        quantity,
        id,
      })),
      initialUnits: body.input.initialUnits,
      mode: body.input.mode,
      modelVersion: body.input.modelVersion,
      schemaVersion: body.input.schemaVersion,
    };
    expect(() => assertAtomicityResult(body, conflictInput)).not.toThrow();
    for (const submitted of [
      { ...conflictInput, initialUnits: 2 },
      {
        ...conflictInput,
        transactions: [...conflictInput.transactions].reverse(),
      },
      { ...conflictInput, schedule: [...conflictInput.schedule].reverse() },
      input,
    ])
      expect(() => assertAtomicityResult(conflictResult, submitted)).toThrow(
        AtomicityCompatibilityError,
      );
    rejects((v) => {
      v.input.transactions[0]!.quantity = 2;
    });
  });
  it("requires each complete outcome to align with its source step in contiguous order", () => {
    for (const mutate of [
      (v: AtomicityResult) => {
        v.outcomes.pop();
      },
      (v: AtomicityResult) => {
        v.outcomes[1]!.sequence = 3;
      },
      (v: AtomicityResult) => {
        v.outcomes[1]!.stepId = "other-step";
      },
      (v: AtomicityResult) => {
        v.outcomes[1]!.transactionId = "other";
      },
      (v: AtomicityResult) => {
        v.outcomes[0]!.action = "COMMIT";
      },
    ])
      rejects(mutate);
  });
  it("rejects missing, foreign, duplicate, reordered or re-quantified snapshot actors", () => {
    for (const mutate of [
      (v: AtomicityResult) => {
        v.outcomes[0]!.postState.transactions.pop();
      },
      (v: AtomicityResult) => {
        v.outcomes[0]!.postState.transactions[1]!.id = "foreign";
      },
      (v: AtomicityResult) => {
        v.outcomes[0]!.postState.transactions[1]!.id = "a";
      },
      (v: AtomicityResult) => {
        v.outcomes[0]!.postState.transactions.reverse();
      },
      (v: AtomicityResult) => {
        v.outcomes[0]!.postState.transactions[0]!.quantity = 2;
      },
      (v: AtomicityResult) => {
        v.initialState.remainingUnits = 2;
      },
    ])
      rejects(mutate, conflictResult);
  });
  it("retains each actor's reported base history independently of mutable private preparation", () => {
    rejects((v) => {
      v.outcomes[2]!.postState.transactions[0]!.baseRemaining = 0;
    }, conflictResult);
    rejects((v) => {
      v.outcomes[2]!.postState.transactions[0]!.baseRevision = 1;
    }, conflictResult);
    rejects((v) => {
      delete v.outcomes[2]!.postState.transactions[0]!.baseRevision;
    }, conflictResult);
  });
  it("binds pending allocation to its actor, quantity and already-declared record step", () => {
    for (const mutate of [
      (v: AtomicityResult) => {
        v.outcomes[4]!.postState.transactions[0]!.pendingAllocation!.transactionId =
          "b";
      },
      (v: AtomicityResult) => {
        v.outcomes[4]!.postState.transactions[0]!.pendingAllocation!.quantity = 2;
      },
      (v: AtomicityResult) => {
        v.outcomes[4]!.postState.transactions[0]!.pendingAllocation!.stepId =
          "begin-a";
      },
      (v: AtomicityResult) => {
        v.outcomes[4]!.postState.transactions[0]!.pendingAllocation!.stepId =
          "record-b";
      },
    ])
      rejects(mutate, conflictResult);
  });
  it("binds visible allocation to known unique actor and correct prepared/published source steps", () => {
    for (const mutate of [
      (v: AtomicityResult) => {
        v.outcomes[6]!.postState.allocations[0]!.transactionId = "foreign";
      },
      (v: AtomicityResult) => {
        v.outcomes[6]!.postState.allocations[0]!.quantity = 2;
      },
      (v: AtomicityResult) => {
        v.outcomes[6]!.postState.allocations[0]!.preparedAtStepId = "begin-a";
      },
      (v: AtomicityResult) => {
        v.outcomes[6]!.postState.allocations[0]!.preparedAtStepId = "record-b";
      },
      (v: AtomicityResult) => {
        v.outcomes[6]!.postState.allocations[0]!.publishedAtStepId = "record-a";
      },
      (v: AtomicityResult) => {
        v.outcomes[6]!.postState.allocations[0]!.publishedAtStepId = "commit-b";
      },
      (v: AtomicityResult) => {
        v.outcomes[6]!.postState.allocations.push(
          structuredClone(v.outcomes[6]!.postState.allocations[0]!),
        );
      },
    ])
      rejects(mutate, conflictResult);
  });
  it("rejects mode-incompatible private fields and stock/publication evidence categories", () => {
    rejects((v) => {
      v.outcomes[0]!.postState.transactions[0]!.workingRemaining = 1;
    });
    rejects((v) => {
      delete v.outcomes[0]!.postState.transactions[0]!.workingRemaining;
    }, protectedResult);
    rejects((v) => {
      v.outcomes[1]!.kind = "STOCK_STAGED";
      v.outcomes[1]!.checkSource = "WORKING_COPY";
    });
    rejects((v) => {
      v.outcomes[2]!.kind = "STOCK_APPLIED";
      v.outcomes[2]!.checkSource = "CURRENT";
    }, conflictResult);
    rejects((v) => {
      delete v.outcomes[6]!.expectedRevision;
      delete v.outcomes[6]!.actualRevision;
    }, conflictResult);
  });
  it("rejects missing, mixed and null outcome evidence and uncleared terminal workspace", () => {
    rejects((v) => {
      delete v.outcomes[1]!.checkedRemaining;
    });
    rejects((v) => {
      Object.assign(v.outcomes[1]!, { checkedRemaining: null });
    });
    rejects((v) => {
      v.outcomes[0]!.checkedRemaining = 1;
    });
    rejects((v) => {
      delete v.outcomes.at(-1)!.actualRevision;
    }, conflictResult);
    rejects((v) => {
      v.outcomes.at(-1)!.postState.transactions[0]!.workingRemaining = 0;
    }, protectedResult);
  });
  it("requires final snapshot equality and reported final metric scalars without recomputing stock or counts", () => {
    rejects((v) => {
      v.finalState.remainingUnits = 1;
    });
    rejects((v) => {
      v.finalState.transactions[0]!.baseRemaining = 0;
    });
    rejects((v) => {
      v.metrics.finalRemainingUnits = 1;
    });
    rejects((v) => {
      v.metrics.finalAllocatedUnits = 1;
    });
    rejects((v) => {
      v.metrics.abortedTransactions = 2;
    });
    rejects((v) => {
      v.metrics.firstViolationStepId = "foreign-step";
    });
  });
  it("rejects incompatible descriptors, changed limits, missing comparisons and illegal preset programs", () => {
    for (const body of [
      null,
      { ...descriptor, defaultInput: input },
      { ...descriptor, limits: { ...descriptor.limits, minSteps: 1 } },
      {
        ...descriptor,
        presets: [...descriptor.presets, descriptor.presets[0]],
      },
      {
        ...descriptor,
        presets: descriptor.presets.filter(
          (preset) => preset.id !== "protected-conflict",
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
      {
        ...descriptor,
        presets: descriptor.presets.map((preset) =>
          preset.id === "baseline"
            ? { ...preset, input: protectedInput }
            : preset,
        ),
      },
    ])
      expect(() => assertAtomicityDescriptor(body)).toThrow(
        AtomicityCompatibilityError,
      );
  });
});
