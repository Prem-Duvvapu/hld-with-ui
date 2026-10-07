import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CacheAsideDescriptor, GuidedCheckpoint } from "../../api/types";
import { baseline } from "./fixtures";
import { GuidedCheckpoints } from "./GuidedCheckpoints";
import { createPracticeStore } from "../learning/practiceStorage";

let store: ReturnType<typeof createPracticeStore>;
vi.mock("../learning/practiceStorage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../learning/practiceStorage")>()),
  getPracticeStore: () => store,
}));
beforeEach(() => {
  let raw: string | null = null;
  store = createPracticeStore(() => ({
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
    },
  }));
});

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
  it("restores predictions and tradeoff choices without auto-running or inventing a trace", async () => {
    const fetchMock = mockRun();
    const rendered = render(
      <GuidedCheckpoints checkpoints={checkpoints} descriptor={descriptor} />,
    );
    fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
      target: { value: "The cache can still return v1." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
    fireEvent.click(await screen.findByLabelText("Weak option"));
    rendered.unmount();
    render(
      <GuidedCheckpoints checkpoints={checkpoints} descriptor={descriptor} />,
    );
    expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
      "The cache can still return v1.",
    );
    expect(screen.queryByText("Explanation for Stale hit.")).toBeNull();
    expect(document.querySelector(".cache-inspector")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
    expect(await screen.findByLabelText("Weak option")).toBeChecked();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves a prediction revised while the Java run is pending", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((finish) => {
            resolve = finish;
          }),
      ),
    );
    render(
      <GuidedCheckpoints checkpoints={checkpoints} descriptor={descriptor} />,
    );
    fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
      target: { value: "Original prediction" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
    fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
      target: { value: "Revised during the run" },
    });
    await act(async () =>
      resolve({ ok: true, status: 200, json: async () => baseline.result }),
    );
    expect(
      await screen.findByLabelText(
        "Your prediction (revise it after seeing the evidence)",
      ),
    ).toHaveValue("Revised during the run");
  });

  it("does not recreate reset answers when an earlier Java response arrives", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((finish) => {
            resolve = finish;
          }),
      ),
    );
    render(
      <GuidedCheckpoints checkpoints={checkpoints} descriptor={descriptor} />,
    );
    fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
      target: { value: "Delete this prediction" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
    act(() => {
      expect(store.resetTopic("cache-aside").ok).toBe(true);
    });
    await act(async () =>
      resolve({ ok: true, status: 200, json: async () => baseline.result }),
    );
    expect(store.getSnapshot().answers).toHaveLength(0);
    expect(screen.queryByText("Explanation for Stale hit.")).toBeNull();
    expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue("");
  });

  it("keeps older predictions visible without treating previous review as current evidence", () => {
    const fetchMock = mockRun();
    store.save({
      topicId: "cache-aside",
      activityId: "stale-hit-prediction",
      contentVersion: "0.9.0",
      answer: { kind: "text", text: "Previous version explanation" },
      referenceViewed: true,
    });
    render(
      <GuidedCheckpoints checkpoints={checkpoints} descriptor={descriptor} />,
    );
    expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
      "Previous version explanation",
    );
    expect(screen.getByRole("note")).toHaveTextContent("content v0.9.0");
    expect(screen.queryByText("Explanation for Stale hit.")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
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

    const feedback = screen
      .getAllByRole("status")
      .find((node) => node.classList.contains("guided-feedback"))!;
    expect(feedback).toHaveTextContent("Recommended: Good option.");
    expect(feedback).toHaveTextContent("Weak feedback.");
    expect(feedback).toHaveTextContent("Good feedback.");

    fireEvent.click(screen.getByLabelText("Good option"));
    expect(
      screen
        .getAllByRole("status")
        .find((node) => node.classList.contains("guided-feedback"))!,
    ).toHaveTextContent("Recommended choice.");
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
