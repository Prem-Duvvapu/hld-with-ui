import { describe, expect, it } from "vitest";
import {
  assertDeliveryCompatibility,
  assertDeliveryRunInput,
  DeliveryCompatibilityError,
} from "./deliveryCompatibility";
import {
  baselineInput,
  baselineResult,
  beforeFirstEvent,
  descriptor,
} from "./deliveryTestFixtures";

describe("canonical delivery response validation", () => {
  it("accepts actual Java baseline output, omitted nullable pointers and a valid empty guarded prefix", () => {
    const original = JSON.stringify(baselineResult);
    expect(() =>
      assertDeliveryCompatibility(baselineResult, "result"),
    ).not.toThrow();
    expect(() =>
      assertDeliveryCompatibility(beforeFirstEvent, "result"),
    ).not.toThrow();
    expect(() =>
      assertDeliveryCompatibility(descriptor, "descriptor"),
    ).not.toThrow();
    const committed = baselineResult.events.find(
      (event) => event.kind === "effect.committed",
    )!;
    expect(committed.changes.consumers[0]).not.toHaveProperty(
      "currentAttemptId",
    );
    expect(
      baselineResult.events.find((event) => event.kind === "delivery.started")!
        .changes.consumers[0],
    ).toHaveProperty("currentAttemptId", "m1-a1");
    expect(JSON.stringify(baselineResult)).toBe(original);
  });

  it.each([
    [
      "wrong model",
      (body: Record<string, unknown>) => {
        body.modelVersion = "2.0.0";
      },
    ],
    [
      "unknown root field",
      (body: Record<string, unknown>) => {
        body.exactlyOnce = true;
      },
    ],
    [
      "unknown wire kind",
      (body: Record<string, unknown>) => {
        (body.events as typeof baselineResult.events)[0]!.kind =
          "toString" as never;
      },
    ],
    [
      "wrong event identity",
      (body: Record<string, unknown>) => {
        (body.events as typeof baselineResult.events)[0]!.attemptId = "m1-a1";
      },
    ],
    [
      "unknown message reference",
      (body: Record<string, unknown>) => {
        (body.events as typeof baselineResult.events)[0]!.messageId = "missing";
      },
    ],
    [
      "missing ledger append",
      (body: Record<string, unknown>) => {
        delete (body.events as typeof baselineResult.events).find(
          (event) => event.kind === "effect.committed",
        )!.ledgerEntry;
      },
    ],
    [
      "noncontiguous sequence",
      (body: Record<string, unknown>) => {
        (body.events as typeof baselineResult.events)[1]!.sequence = 99;
      },
    ],
    [
      "time goes backwards",
      (body: Record<string, unknown>) => {
        (body.events as typeof baselineResult.events).find(
          (event) => event.kind === "ack.sent",
        )!.timeMs = 49;
      },
    ],
    [
      "time beyond emitted prefix",
      (body: Record<string, unknown>) => {
        body.lastVirtualTimeMs = 56;
      },
    ],
    [
      "duplicate initial IDs",
      (body: Record<string, unknown>) => {
        (body.initialState as typeof baselineResult.initialState).messages.push(
          (body.initialState as typeof baselineResult.initialState)
            .messages[0]!,
        );
      },
    ],
    [
      "unknown delta field",
      (body: Record<string, unknown>) => {
        Object.assign(
          (body.events as typeof baselineResult.events)[0]!.changes,
          { deletes: ["m1"] },
        );
      },
    ],
    [
      "future attempt identity",
      (body: Record<string, unknown>) => {
        (body.events as typeof baselineResult.events)[1]!.attemptId = "m1-a2";
      },
    ],
    [
      "unsupported lease token",
      (body: Record<string, unknown>) => {
        (
          body.finalState as typeof baselineResult.finalState
        ).attempts[0]!.leaseToken = "m1-a2-lease";
      },
    ],
  ])("rejects %s before projection", (_, mutate) => {
    const body = structuredClone(baselineResult);
    mutate(body as unknown as Record<string, unknown>);
    expect(() => assertDeliveryCompatibility(body, "result")).toThrow(
      DeliveryCompatibilityError,
    );
  });

  it("rejects a limited prefix that reports settled ACK-without-effect as zero", () => {
    expect(() =>
      assertDeliveryCompatibility(
        {
          ...beforeFirstEvent,
          metrics: {
            ...beforeFirstEvent.metrics,
            acknowledgedWithoutEffect: 0,
          },
        },
        "result",
      ),
    ).toThrow(DeliveryCompatibilityError);
  });

  it("rejects malformed or unsupported descriptors without coercing preset inputs", () => {
    for (const body of [
      { ...descriptor, limits: { ...descriptor.limits, maxMessages: 999 } },
      {
        ...descriptor,
        presets: [...descriptor.presets, ...descriptor.presets],
      },
      {
        ...descriptor,
        presets: [{ ...descriptor.presets[0], id: "missing-baseline" }],
      },
      {
        ...descriptor,
        presets: [
          {
            ...descriptor.presets[0],
            input: { ...baselineInput, processingTimeMs: "50" },
          },
        ],
      },
    ])
      expect(() => assertDeliveryCompatibility(body, "descriptor")).toThrow(
        DeliveryCompatibilityError,
      );
  });

  it("correlates the response with submitted seed, input order, enqueue times and fault selectors", () => {
    expect(() =>
      assertDeliveryRunInput(baselineResult, baselineInput),
    ).not.toThrow();
    for (const input of [
      { ...baselineInput, seed: 43 },
      { ...baselineInput, processingTimeMs: 80 },
      { ...baselineInput, acknowledgmentDelayMs: 6 },
      { ...baselineInput, visibilityTimeoutMs: 101 },
      { ...baselineInput, acknowledgmentPolicy: "ACK_BEFORE_EFFECT" as const },
      { ...baselineInput, messages: [{ id: "other", enqueueTimeMs: 0 }] },
      { ...baselineInput, messages: [{ id: "m1", enqueueTimeMs: 1 }] },
      { ...baselineInput, consumers: [{ id: "other" }] },
      {
        ...baselineInput,
        failures: [{ consumerId: "c1", action: "CRASH" as const, timeMs: 25 }],
      },
      {
        ...baselineInput,
        lostAcknowledgments: [{ messageId: "m1", attempt: 1 }],
      },
    ])
      expect(() => assertDeliveryRunInput(baselineResult, input)).toThrow(
        DeliveryCompatibilityError,
      );
  });

  it("checks intermediate schedules and the submitted attempt ceiling", () => {
    const changed = structuredClone(baselineResult);
    changed.events.find(
      (event) => event.kind === "delivery.started",
    )!.changes.attempts[0]!.scheduledEffectAtMs = 80;
    expect(() => assertDeliveryRunInput(changed, baselineInput)).toThrow(
      DeliveryCompatibilityError,
    );
    const tooMany = structuredClone(baselineResult);
    tooMany.attemptOutcomes[0]!.attempt = 2;
    expect(() =>
      assertDeliveryRunInput(tooMany, {
        ...baselineInput,
        maxDeliveryAttempts: 1,
      }),
    ).toThrow(DeliveryCompatibilityError);
    // An empty prefix exposes no schedule to correlate; no completion is invented.
    expect(() =>
      assertDeliveryRunInput(beforeFirstEvent, baselineInput),
    ).not.toThrow();
  });
});
