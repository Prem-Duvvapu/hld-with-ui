import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RequestFlowResult, SimulationDescriptor } from "../../api/types";
import { Playground } from "./Playground";

const descriptor: SimulationDescriptor = {
  id: "request-flow",
  title: "Request flow",
  kind: "simulation",
  modelVersion: "1.0.0",
  description: "A model",
  limits: {},
  assumptions: ["Nodes stay healthy."],
  presets: [
    {
      id: "baseline",
      title: "Balanced burst",
      question: "What happens?",
      input: {
        policy: "ROUND_ROBIN",
        arrivalTimesMs: [0, 0],
        nodeServiceTimesMs: [100, 100],
        workersPerNode: 1,
        queueCapacity: 1,
        seed: 42,
      },
    },
  ],
};
const result: RequestFlowResult = {
  simulationId: "request-flow",
  modelVersion: "1.0.0",
  seed: 42,
  status: "completed",
  assumptions: ["Nodes stay healthy."],
  events: [
    {
      sequence: 1,
      timeMs: 0,
      kind: "request.arrived",
      requestId: "Request 1",
      nodeId: null,
      message: "Request 1 arrived.",
    },
  ],
  outcomes: [
    {
      requestId: "Request 1",
      nodeId: "Node A",
      status: "COMPLETED",
      arrivalMs: 0,
      startMs: 0,
      completionMs: 100,
      queueMs: 0,
      serviceMs: 100,
      latencyMs: 100,
    },
  ],
  metrics: {
    completed: 1,
    rejected: 0,
    meanLatencyMs: 100,
    p95LatencyMs: 100,
    throughputPerSecond: 10,
    observationWindowMs: 100,
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("Request flow playground", () => {
  it("sends controls to Java and renders its trace and metrics", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => result });
    vi.stubGlobal("fetch", fetchMock);
    render(<Playground descriptor={descriptor} />);

    fireEvent.click(screen.getByRole("button", { name: /Run experiment/ }));

    expect(await screen.findByText("Request 1 arrived.")).toBeInTheDocument();
    expect(screen.getByText("10.0")).toBeInTheDocument();
    const [, options] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(options.body)).toMatchObject({
      policy: "ROUND_ROBIN",
      arrivalTimesMs: [0, 0],
      nodeServiceTimesMs: [100, 100],
    });
  });

  it("rejects invalid input before calling the backend", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<Playground descriptor={descriptor} />);
    fireEvent.change(screen.getByLabelText("Workers / node"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Run experiment/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Workers per node must be from 1 to 8",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
