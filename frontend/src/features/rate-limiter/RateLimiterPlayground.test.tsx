import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RateLimiterDescriptor, RateLimiterResult } from "../../api/types";
import { RateLimiterPlayground } from "./RateLimiterPlayground";

const input = {
  schemaVersion: "1.0" as const,
  modelVersion: "1.0.0" as const,
  algorithm: "FIXED_WINDOW" as const,
  counterScope: "SHARED" as const,
  nodeCount: 3,
  limit: 5,
  windowMs: 1000,
  refillTokensPerSecond: 2,
  counterBackendAvailable: true,
  backendFailurePolicy: "FAIL_CLOSED" as const,
  arrivalTimesMs: [0, 0],
  seed: 42,
};
const descriptor: RateLimiterDescriptor = {
  id: "distributed-rate-limiter",
  title: "Distributed Rate Limiter",
  kind: "simulation",
  modelVersion: "1.0.0",
  description: "A model",
  limits: { maxRequests: 500 },
  presets: [
    { id: "baseline", title: "Baseline", question: "What passes?", input },
  ],
  assumptions: ["One identity."],
};
const result: RateLimiterResult = {
  schemaVersion: "1.0",
  simulationId: "distributed-rate-limiter",
  modelVersion: "1.0.0",
  seed: 42,
  status: "completed",
  assumptions: ["One identity."],
  events: [
    {
      sequence: 1,
      timeMs: 0,
      kind: "request.arrived",
      requestId: "Request 1",
      nodeId: "Node A",
      message: "Arrived.",
    },
    {
      sequence: 2,
      timeMs: 0,
      kind: "request.allowed",
      requestId: "Request 1",
      nodeId: "Node A",
      message: "Allowed.",
    },
  ],
  outcomes: [
    {
      requestId: "Request 1",
      nodeId: "Node A",
      timeMs: 0,
      decision: "ALLOWED",
      remaining: 4,
      reason: "Shared counter allowed it.",
    },
    {
      requestId: "Request 2",
      nodeId: "Node B",
      timeMs: 0,
      decision: "REJECTED",
      remaining: 0,
      retryAfterMs: 1000,
      reason: "No allowance remained.",
    },
  ],
  metrics: {
    total: 2,
    allowed: 1,
    rejected: 1,
    bypassed: 0,
    configuredLimit: 5,
    counters: 1,
    maximumAggregateAllowance: 5,
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("Rate limiter playground", () => {
  it("runs the Java model and explains enforcement scope", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => result });
    vi.stubGlobal("fetch", fetchMock);
    render(<RateLimiterPlayground descriptor={descriptor} />);

    fireEvent.click(screen.getByRole("button", { name: "Run request burst" }));

    expect(
      await screen.findByText("Shared counter allowed it."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Rate limiter metrics")).toHaveTextContent(
      "REJECTED1",
    );
    expect(screen.getByText(/5 × 1 counter = 5/)).toBeInTheDocument();
    const [, options] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(options.body)).toMatchObject({
      algorithm: "FIXED_WINDOW",
      counterScope: "SHARED",
      limit: 5,
    });
  });

  it("shows local aggregate allowance and stale-result state", async () => {
    const localResult: RateLimiterResult = {
      ...result,
      metrics: {
        ...result.metrics,
        allowed: 2,
        rejected: 0,
        counters: 3,
        maximumAggregateAllowance: 15,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => localResult }),
    );
    render(<RateLimiterPlayground descriptor={descriptor} />);
    fireEvent.change(screen.getByLabelText("Counter placement"), {
      target: { value: "LOCAL_PER_NODE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run request burst" }));

    expect(
      await screen.findByText("Distributed overshoot is possible"),
    ).toBeInTheDocument();
    expect(screen.getByText(/5 × 3 counters = 15/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Limit / capacity"), {
      target: { value: "6" },
    });
    expect(screen.getByRole("status")).toHaveTextContent("Inputs changed");
  });

  it("rejects malformed arrival schedules before calling the API", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<RateLimiterPlayground descriptor={descriptor} />);
    fireEvent.change(screen.getByLabelText(/^Arrival times/), {
      target: { value: "100, 20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run request burst" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Arrival times must be ordered",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
