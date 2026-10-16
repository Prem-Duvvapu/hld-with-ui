import { describe, expect, it } from "vitest";
import {
  assertRetryDescriptor,
  assertRetryInput,
  assertRetryResult,
  RetryCompatibilityError,
} from "./retryCompatibility";
import {
  descriptor,
  input,
  result,
  backoffInput,
  backoffResult,
  deadlineInput,
  deadlineResult,
  jitterInput,
  jitterResult,
} from "./retryTestFixtures";
import type { RetryInput, RetryResult } from "./types";

function rejects(mutate: (value: RetryResult) => void, base = result) {
  const value = structuredClone(base);
  mutate(value);
  expect(() => assertRetryResult(value, base.input)).toThrow(
    RetryCompatibilityError,
  );
}
describe("retry evidence compatibility", () => {
  it("accepts all four complete actual Java goldens and the real descriptor without mutation", () => {
    const pairs = [
      [input, result],
      [backoffInput, backoffResult],
      [deadlineInput, deadlineResult],
      [jitterInput, jitterResult],
    ] as const;
    const original = JSON.stringify(pairs);
    for (const [submitted, evidence] of pairs) {
      expect(() => assertRetryInput(submitted)).not.toThrow();
      expect(() => assertRetryResult(evidence, submitted)).not.toThrow();
    }
    expect(() => assertRetryDescriptor(descriptor)).not.toThrow();
    expect(JSON.stringify(pairs)).toBe(original);
  });
  it("accepts intentional admission/completion and retry-decision microsteps", () => {
    expect(
      result.events.some((event) =>
        event.postState.attempts.some(
          (attempt) => attempt.workState === "PENDING_ADMISSION",
        ),
      ),
    ).toBe(true);
    expect(
      backoffResult.events.some((event) =>
        event.postState.attempts.some(
          (attempt) =>
            attempt.workState === "COMPLETED" &&
            attempt.callerState === "WAITING",
        ),
      ),
    ).toBe(true);
    expect(
      deadlineResult.events.some((event) =>
        event.postState.requests.some(
          (request) => request.phase === "AWAITING_DEADLINE",
        ),
      ),
    ).toBe(true);
    expect(() => assertRetryResult(result, input)).not.toThrow();
  });
  it("checks static ID/arrival/backoff relationships before submitting", () => {
    const mutations = [
      (value: RetryInput) => {
        value.requests[1]!.id = value.requests[0]!.id;
      },
      (value: RetryInput) => {
        value.requests[0]!.arrivalTimeMs = 2;
        value.requests[1]!.arrivalTimeMs = 1;
      },
      (value: RetryInput) => {
        value.maxDelayMs = 1;
      },
    ];
    for (const mutate of mutations) {
      const value = structuredClone(jitterInput);
      mutate(value);
      expect(() => assertRetryInput(value)).toThrow();
    }
  });
  it("rejects null, closed-schema, version and scalar mismatches", () => {
    for (const body of [
      null,
      [],
      false,
      {},
      { ...result, modelVersion: "2.0.0" },
      { ...result, status: "limited" },
      { ...result, events: [] },
    ])
      expect(() => assertRetryResult(body, input)).toThrow(
        RetryCompatibilityError,
      );
    for (const body of [
      null,
      [],
      { ...input, workers: "1" },
      { ...input, workers: 1.5 },
      { ...input, seed: null },
      { ...input, backoff: "LINEAR" },
    ])
      expect(() => assertRetryInput(body)).toThrow("Check the retry input");
  });
  it("rejects missing, duplicated and unknown teaching presets and incorrect public limits", () => {
    for (const mutate of [
      (value: typeof descriptor) => {
        value.presets.pop();
      },
      (value: typeof descriptor) => {
        value.presets[1]!.id = value.presets[0]!.id;
      },
      (value: typeof descriptor) => {
        value.presets[0]!.id = "baseline";
      },
      (value: typeof descriptor) => {
        Object.assign(value.limits, { maxAttempts: 6 });
      },
      (value: typeof descriptor) => {
        value.presets[0]!.input.requests.push({
          ...value.presets[0]!.input.requests[0]!,
        });
      },
    ]) {
      const value = structuredClone(descriptor);
      mutate(value);
      expect(() => assertRetryDescriptor(value)).toThrow(
        RetryCompatibilityError,
      );
    }
  });
  it("requires the response to describe the captured submitted workload", () => {
    expect(() =>
      assertRetryResult(result, { ...input, attemptTimeoutMs: 100 }),
    ).toThrow(RetryCompatibilityError);
    rejects((value) => {
      value.input.requests[0]!.id = "other";
    });
  });
  it("rejects unknown event requests, foreign attempts and forged future retry references", () => {
    rejects((value) => {
      value.events[0]!.requestId = "unknown";
    });
    rejects((value) => {
      value.events.find((event) => event.attemptId)!.attemptId = "unknown-a1";
    });
    rejects((value) => {
      value.events.find(
        (event) => event.kind === "RETRY_SCHEDULED",
      )!.attemptId = "a-a2";
    });
  });
  it("rejects missing or shifted request rows and worker pools", () => {
    rejects((value) => {
      value.events[0]!.postState.requests[0]!.id = "other";
    });
    rejects((value) => {
      value.events[0]!.postState.workers = [];
    });
    rejects((value) => {
      value.events[0]!.postState.workers[0]!.id = "worker-2";
    });
  });
  it("rejects queue/worker assignments that do not name their actual work categories", () => {
    rejects((value) => {
      value.events.find(
        (event) => event.kind === "WORK_STARTED",
      )!.postState.workers[0]!.attemptId = "unknown-a1";
    });
    rejects((value) => {
      value.events.find(
        (event) => event.kind === "WORK_QUEUED",
      )!.postState.queue[0] = "unknown-a1";
    });
    rejects((value) => {
      value.events.find(
        (event) => event.kind === "WORK_QUEUED",
      )!.postState.queue = [];
    });
  });
  it("rejects changed attempt identity, duplicate rows and rewritten reported history", () => {
    rejects((value) => {
      value.events.find(
        (event) => event.kind === "WORK_STARTED",
      )!.postState.attempts[0]!.id = "a-a2";
    });
    rejects((value) => {
      const state = value.events.find(
        (event) => event.kind === "WORK_STARTED",
      )!.postState;
      state.attempts.push({ ...state.attempts[0]! });
    });
    rejects((value) => {
      value.events.find(
        (event) => event.kind === "WORK_COMPLETED",
      )!.postState.attempts[0]!.startedAtMs = 1;
    });
    rejects((value) => {
      value.events[1]!.postState.requests[0]!.overallDeadlineAtMs += 1;
    });
  });
  it("rejects noncontiguous events, backwards time and mismatched final reported evidence", () => {
    rejects((value) => {
      value.events[0]!.sequence = 2;
    });
    rejects((value) => {
      value.events[value.events.length - 1]!.timeMs = 0;
    });
    rejects((value) => {
      value.finalState.retryBudgetRemaining -= 1;
    });
    rejects((value) => {
      value.metrics.finalTimeMs += 1;
    });
    rejects((value) => {
      value.metrics.originalRequests = 2;
    });
  });
  it("keeps policy decisions and metrics authoritative instead of simulating them in TypeScript", () => {
    const evidence = structuredClone(result);
    evidence.metrics.attemptAmplification = 1.25;
    expect(() => assertRetryResult(evidence, input)).not.toThrow();
    // This boundary checks reported shape/identities; Java semantic tests verify the ratio formula.
  });
});
