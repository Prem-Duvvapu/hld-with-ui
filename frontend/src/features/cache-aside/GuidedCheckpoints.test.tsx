import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CacheAsideDescriptor, GuidedCheckpoint } from "../../api/types";
import { baseline } from "./fixtures";
import { GuidedCheckpoints } from "./GuidedCheckpoints";

const descriptor: CacheAsideDescriptor = {
  id: "cache-aside",
  title: "Cache-Aside",
  kind: "simulation",
  modelVersion: "1.0.1",
  description: "A deterministic cache-aside model.",
  limits: {
    maxLatencyMs: 10_000,
    maxTtlMs: 60_000,
    maxOperations: 100,
    maxOperationTimeMs: 60_000,
    maxKeyLength: 64,
    maxValueLength: 256,
  },
  presets: [
    {
      id: "baseline",
      title: "Baseline: hit, miss, and stale read",
      question: "Why did the GET at 70 ms return v1?",
      input: baseline.input,
    },
  ],
  assumptions: [],
};

const checkpoint = (
  id: string,
  title: string,
  target: GuidedCheckpoint["target"],
): GuidedCheckpoint => ({
  id,
  title,
  simulationId: "cache-aside",
  presetId: "baseline",
  target,
  prompt: `Prompt for ${title}.`,
  lookFor: `Look for ${title}.`,
  explanation: `Explanation for ${title}.`,
  tradeoff: {
    prompt: "Which option fits?",
    options: [
      { id: "good", label: "Good option", feedback: "Good feedback." },
      { id: "weak", label: "Weak option", feedback: "Weak feedback." },
    ],
    recommendedOptionId: "good",
  },
});

const checkpoints = [
  checkpoint("stale-hit", "Stale hit", {
    operation: 4,
    kind: "cache.hit",
    occurrence: 1,
  }),
  checkpoint("expiry-miss", "Expiry miss", {
    operation: 5,
    kind: "cache.miss",
    occurrence: 1,
  }),
];

function mockRun() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => baseline.result,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const inspector = () =>
  document.querySelector<HTMLElement>(".cache-inspector")!;

afterEach(() => vi.unstubAllGlobals());

describe("GuidedCheckpoints", () => {
  it("runs the preset in Java and reveals the trace at the checkpoint's event", async () => {
    const fetchMock = mockRun();
    render(
      <GuidedCheckpoints checkpoints={checkpoints} descriptor={descriptor} />,
    );
    expect(screen.queryByText("Explanation for Stale hit.")).toBeNull();

    fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
      target: { value: "v2, because the origin changed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));

    expect(
      await screen.findByText("Explanation for Stale hit."),
    ).toBeInTheDocument();
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/simulations/cache-aside/runs");
    expect(JSON.parse(options.body)).toEqual(baseline.input);
    expect(inspector()).toHaveTextContent("event 6 at 72 ms");
    expect(inspector()).toHaveTextContent("a hit returns stale data");
    // The prediction stays editable so the learner can revise it.
    expect(
      screen.getByLabelText(
        "Your prediction (revise it after seeing the evidence)",
      ),
    ).toHaveValue("v2, because the origin changed");
    expect(
      screen.queryByRole("table", { name: "Simulation event trace" }),
    ).toBeNull();
  });

  it("explains a weaker tradeoff choice next to the recommended one", async () => {
    mockRun();
    render(
      <GuidedCheckpoints checkpoints={checkpoints} descriptor={descriptor} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
    fireEvent.click(await screen.findByLabelText("Weak option"));

    const feedback = screen.getByRole("status");
    expect(feedback).toHaveTextContent("Recommended: Good option.");
    expect(feedback).toHaveTextContent("Weak feedback.");
    expect(feedback).toHaveTextContent("Good feedback.");

    fireEvent.click(screen.getByLabelText("Good option"));
    expect(screen.getByRole("status")).toHaveTextContent("Recommended choice.");
  });

  it("reuses one run for checkpoints that share a preset and keeps each checkpoint's answers", async () => {
    const fetchMock = mockRun();
    render(
      <GuidedCheckpoints checkpoints={checkpoints} descriptor={descriptor} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
    await screen.findByText("Explanation for Stale hit.");

    fireEvent.click(screen.getByRole("button", { name: "Next checkpoint →" }));
    expect(screen.queryByText("Explanation for Expiry miss.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
    expect(
      await screen.findByText("Explanation for Expiry miss."),
    ).toBeInTheDocument();
    expect(inspector()).toHaveTextContent("expired at 122 ms");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Stale hit/ }));
    expect(screen.getByText("Explanation for Stale hit.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Stale hit/ })).toHaveTextContent(
      "✓",
    );
  });

  it("shows a backend failure and recovers on retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ code: "unavailable", message: "Try again." }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => baseline.result,
      });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <GuidedCheckpoints checkpoints={checkpoints} descriptor={descriptor} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Select “Run and reveal” to try again.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
    expect(
      await screen.findByText("Explanation for Stale hit."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so instead of guessing when the trace has no matching event", async () => {
    mockRun();
    render(
      <GuidedCheckpoints
        checkpoints={[
          checkpoint("missing", "Missing", {
            operation: 3,
            kind: "cache.hit",
            occurrence: 1,
          }),
        ]}
        descriptor={descriptor}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This checkpoint no longer matches the Java trace",
    );
  });
});
