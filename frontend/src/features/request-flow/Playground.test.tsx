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
  limits: {
    maxRequests: 100,
    maxNodes: 8,
    maxWorkersPerNode: 8,
    maxQueueCapacity: 100,
    maxArrivalTimeMs: 60_000,
    maxServiceTimeMs: 10_000,
    maxEvents: 10_000,
    maxVirtualTimeMs: 60_000,
  },
  assumptions: ["Nodes stay healthy."],
  presets: [
    {
      id: "baseline",
      title: "Balanced burst",
      question: "What happens?",
      input: {
        schemaVersion: "1.0",
        modelVersion: "1.0.0",
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
  schemaVersion: "1.0",
  simulationId: "request-flow",
  modelVersion: "1.0.0",
  seed: 42,
  status: "completed",
  truncationReason: null,
  lastVirtualTimeMs: 100,
  incompleteRequests: 0,
  limits: {
    maxRequests: 100,
    maxNodes: 8,
    maxWorkersPerNode: 8,
    maxQueueCapacity: 100,
    maxArrivalTimeMs: 60_000,
    maxServiceTimeMs: 10_000,
    maxEvents: 10000,
    maxVirtualTimeMs: 60000,
  },
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
    failed: 0,
    meanLatencyMs: 100,
    p95LatencyMs: 100,
    throughputPerSecond: 10,
    observationWindowMs: 100,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Request flow playground", () => {
  it("sends controls to Java and renders its trace and metrics", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => result });
    vi.stubGlobal("fetch", fetchMock);
    render(<Playground descriptor={descriptor} />);

    fireEvent.click(screen.getByRole("button", { name: /Run experiment/ }));

    expect(
      await screen.findByText("Request 1 arrived.", {
        selector: ".current-event p",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("10.0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play trace" })).toBeDisabled();
    const [, options] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(options.body)).toMatchObject({
      schemaVersion: "1.0",
      modelVersion: "1.0.0",
      policy: "ROUND_ROBIN",
      arrivalTimesMs: [0, 0],
      nodeServiceTimesMs: [100, 100],
    });

    fireEvent.change(screen.getByLabelText(/^Node service times/), {
      target: { value: "100, 100, 100" },
    });
    expect(screen.getByText(/This trace still represents/)).toBeInTheDocument();
    expect(screen.queryByText("Node C")).not.toBeInTheDocument();
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
    expect(screen.getByLabelText("Workers / node")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Workers / node")).toHaveAttribute(
      "aria-describedby",
      "simulation-input-error",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses descriptor limits for control attributes and validation", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const constrained: SimulationDescriptor = {
      ...descriptor,
      limits: { ...descriptor.limits, maxWorkersPerNode: 2 },
    };
    render(<Playground descriptor={constrained} />);

    expect(screen.getByLabelText("Workers / node")).toHaveAttribute("max", "2");
    fireEvent.change(screen.getByLabelText("Workers / node"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Run experiment/ }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Workers per node must be from 1 to 2",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains limited traces and labels their metrics as partial", async () => {
    const limited: RequestFlowResult = {
      ...result,
      status: "limited",
      truncationReason: "virtual_time_limit",
      lastVirtualTimeMs: 60_000,
      incompleteRequests: 2,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => limited }),
    );
    render(<Playground descriptor={descriptor} />);

    fireEvent.click(screen.getByRole("button", { name: /Run experiment/ }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "60,000 ms virtual time limit",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 requests are incomplete",
    );
    expect(screen.getByLabelText("Partial run metrics")).toBeInTheDocument();
  });

  it("changes playback cadence without changing modeled event times", async () => {
    const playable: RequestFlowResult = {
      ...result,
      events: [
        ...result.events,
        {
          sequence: 2,
          timeMs: 100,
          kind: "request.completed",
          requestId: "Request 1",
          nodeId: "Node A",
          message: "Request 1 completed.",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => playable }),
    );
    const timerSpy = vi.spyOn(window, "setTimeout");
    render(<Playground descriptor={descriptor} />);
    fireEvent.click(screen.getByRole("button", { name: /Run experiment/ }));
    await screen.findByText("Request 1 arrived.", {
      selector: ".current-event p",
    });

    fireEvent.change(screen.getByLabelText("Playback speed"), {
      target: { value: "300" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Play trace" }));

    expect(timerSpy).toHaveBeenLastCalledWith(expect.any(Function), 300);
    expect(playable.events[1]?.timeMs).toBe(100);

    fireEvent.click(screen.getByRole("button", { name: "Next event" }));
    expect(
      screen.getByText("Request 1 completed.", {
        selector: ".current-event p",
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset trace" }));
    expect(
      screen.getByText("Request 1 arrived.", {
        selector: ".current-event p",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View event 2" }));
    expect(
      screen.getByRole("button", { name: "View event 2" }),
    ).toHaveAttribute("aria-current", "step");
    expect(
      screen.getByText("Request 1 completed.", {
        selector: ".current-event p",
      }),
    ).toBeInTheDocument();
  });

  it("handles node failure presets, displays scheduled failure, and sends failureSchedule to Java", async () => {
    const failurePresetDescriptor: SimulationDescriptor = {
      ...descriptor,
      modelVersion: "1.1.0",
      presets: [
        ...descriptor.presets,
        {
          id: "node-failure",
          title: "Node failure mid-run",
          question: "What happens to in-flight requests?",
          input: {
            schemaVersion: "1.0",
            modelVersion: "1.1.0",
            policy: "ROUND_ROBIN",
            arrivalTimesMs: [0, 0],
            nodeServiceTimesMs: [100, 100],
            workersPerNode: 1,
            queueCapacity: 10,
            failureSchedule: [
              {
                entityId: "Node B",
                failAtMs: 50,
                recoverAtMs: 250,
                inFlightBehavior: "FAIL",
              },
            ],
            seed: 7,
          },
        },
      ],
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => result });
    vi.stubGlobal("fetch", fetchMock);

    render(<Playground descriptor={failurePresetDescriptor} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Node failure mid-run" }),
    );

    expect(
      screen.getByLabelText("Scheduled node failures"),
    ).toBeInTheDocument();
    expect(screen.getByText("Node B")).toBeInTheDocument();
    expect(
      screen.getByText(/Fails at 50 ms → Recovers at 250 ms/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Run experiment/ }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(options.body)).toMatchObject({
      schemaVersion: "1.0",
      modelVersion: "1.1.0",
      failureSchedule: [
        {
          entityId: "Node B",
          failAtMs: 50,
          recoverAtMs: 250,
          inFlightBehavior: "FAIL",
        },
      ],
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Remove failure schedule" }),
    );
    expect(
      screen.queryByLabelText("Scheduled node failures"),
    ).not.toBeInTheDocument();
  });

  it("renders failed metrics, failed outcome status, and marks failed nodes in the topology", async () => {
    const failureResult: RequestFlowResult = {
      ...result,
      modelVersion: "1.1.0",
      metrics: {
        completed: 1,
        rejected: 0,
        failed: 1,
        meanLatencyMs: 100,
        p95LatencyMs: 100,
        throughputPerSecond: 10,
        observationWindowMs: 100,
      },
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
        {
          requestId: "Request 2",
          nodeId: "Node B",
          status: "FAILED",
          arrivalMs: 0,
          startMs: 0,
          completionMs: 50,
          queueMs: 0,
          serviceMs: 50,
          latencyMs: 50,
        },
      ],
      events: [
        {
          sequence: 1,
          timeMs: 0,
          kind: "request.arrived",
          requestId: "Request 1",
          nodeId: null,
          message: "Request 1 arrived.",
        },
        {
          sequence: 2,
          timeMs: 50,
          kind: "node.failed",
          requestId: null,
          nodeId: "Node B",
          message: "Node B failed at 50 ms.",
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => failureResult }),
    );

    render(
      <Playground descriptor={{ ...descriptor, modelVersion: "1.1.0" }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Run experiment/ }));

    expect(
      await screen.findByText("FAILED", { selector: "small" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("FAILED", { selector: "small" }).closest("article"),
    ).toHaveTextContent("1");
    expect(
      screen.getByText("FAILED", { selector: ".outcome" }),
    ).toBeInTheDocument();

    // Step to the node.failed event and verify Node B is marked as FAILED in topology
    fireEvent.click(screen.getByRole("button", { name: "Next event" }));
    expect(
      screen.getByText("Node B failed at 50 ms.", {
        selector: ".current-event p",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("FAILED", { selector: ".trace-node.danger small" }),
    ).toBeInTheDocument();
  });

  it("explains trace_size_limit and wall_time_limit truncation reasons", async () => {
    const traceSizeLimited: RequestFlowResult = {
      ...result,
      status: "limited",
      truncationReason: "trace_size_limit",
      lastVirtualTimeMs: 100,
      incompleteRequests: 1,
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => traceSizeLimited }),
    );

    const { unmount } = render(<Playground descriptor={descriptor} />);
    fireEvent.click(screen.getByRole("button", { name: /Run experiment/ }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "The trace byte size budget was reached.",
    );
    unmount();

    const wallTimeLimited: RequestFlowResult = {
      ...result,
      status: "limited",
      truncationReason: "wall_time_limit",
      lastVirtualTimeMs: 100,
      incompleteRequests: 1,
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => wallTimeLimited }),
    );

    render(<Playground descriptor={descriptor} />);
    fireEvent.click(screen.getByRole("button", { name: /Run experiment/ }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "The execution wall-time deadline was reached.",
    );
  });
});
