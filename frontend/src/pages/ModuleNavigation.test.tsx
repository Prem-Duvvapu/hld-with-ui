import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createMemoryRouter, Link, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CacheAsideDescriptor,
  CacheAsideInput,
  CacheAsideResult,
  CatalogEntry,
  TopicDetail,
} from "../api/types";
import { CacheAsidePage } from "./CacheAsidePage";

const input: CacheAsideInput = {
  schemaVersion: "1.0",
  modelVersion: "1.0.1",
  cacheLookupLatencyMs: 2,
  originReadLatencyMs: 20,
  ttlMs: 100,
  initialOriginValue: "v1",
  operations: [{ kind: "GET", key: "k", timeMs: 0 }],
  cacheAvailable: true,
  originAvailable: true,
  seed: 7,
};

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
      title: "Baseline",
      question: "Will the first read hit?",
      input,
    },
  ],
  assumptions: ["Every run starts cold."],
};

const entry: CatalogEntry = {
  id: "cache-aside",
  kind: "topic",
  title: "Cache-Aside",
  summary: "Trace reads through a cache.",
  category: "Caching",
  level: "Beginner",
  order: 4,
  status: "published",
  prerequisites: [],
  outcomes: ["Explain a stale read."],
  capabilities: ["study", "simulation", "practice"],
  lessonPath: "topics/cache-aside/lesson.md",
  questionsPath: "topics/cache-aside/questions.json",
  resourcesPath: "topics/cache-aside/resources.json",
  simulationIds: ["cache-aside"],
  estimatorIds: [],
  contentVersion: "1.0.0",
  reviewedAt: "2026-09-29",
  sourceIds: ["source"],
};

const topic: TopicDetail = {
  topic: entry,
  lessonMarkdown: "# Cache-aside\n\nRead the cache first.",
  questions: [
    {
      id: "cache-aside-origin-down",
      topicId: "cache-aside",
      level: "intermediate",
      kind: "design-decision",
      prompt: "Explain what happens when the origin is down.",
      rubric: ["Names the failed read."],
      modelAnswer: "A miss cannot be filled.",
    },
  ],
};

const result: CacheAsideResult = {
  schemaVersion: "1.0",
  simulationId: "cache-aside",
  modelVersion: "1.0.1",
  seed: 7,
  status: "completed",
  lastVirtualTimeMs: 22,
  incompleteGets: 0,
  assumptions: ["Every run starts cold."],
  initialState: {
    cacheAvailable: true,
    originAvailable: true,
    origin: [{ key: "k", value: "v1", version: 1 }],
  },
  events: [
    {
      sequence: 1,
      timeMs: 2,
      kind: "cache.miss",
      requestId: "Operation 1",
      nodeId: "cache",
      message: "Cache miss (no entry).",
      operation: 1,
      key: "k",
    },
  ],
  outcomes: [
    {
      key: "k",
      returnedValue: "v1",
      hitOrMiss: "MISS",
      stale: false,
      requestTimeMs: 0,
      responseTimeMs: 22,
      latencyMs: 22,
    },
  ],
  metrics: {
    totalGets: 1,
    cacheBypasses: 0,
    failedGets: 0,
    cacheHits: 0,
    cacheMisses: 1,
    staleReads: 0,
    originReads: 1,
    hitRatio: 0,
    observationWindowMs: 22,
  },
};

function stubApi() {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const body =
      init?.method === "POST"
        ? result
        : path.startsWith("/api/v1/topics/")
          ? topic
          : descriptor;
    return { ok: true, status: 200, json: async () => body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    runs: () =>
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").length,
    loads: () =>
      fetchMock.mock.calls.filter(([, init]) => init?.method !== "POST").length,
  };
}

function renderModule(url = "/topics/cache-aside") {
  const router = createMemoryRouter(
    [
      { path: "/topics/cache-aside", element: <CacheAsidePage /> },
      {
        path: "/elsewhere",
        element: <Link to="/topics/cache-aside">Back to cache</Link>,
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const tab = (name: RegExp) => screen.getByRole("tab", { name });

afterEach(() => vi.unstubAllGlobals());

describe("Module navigation", () => {
  it("keeps edited inputs and the run result across a tab round trip without rerunning", async () => {
    const api = stubApi();
    renderModule();
    fireEvent.change(await screen.findByLabelText("TTL (ms)"), {
      target: { value: "250" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    await screen.findByRole("table", { name: "Cache GET outcomes" });

    fireEvent.click(tab(/Study/));
    expect(
      await screen.findByRole("heading", { name: "Cache-aside" }),
    ).toBeVisible();
    fireEvent.click(tab(/Playground/));

    expect(screen.getByLabelText("TTL (ms)")).toHaveValue(250);
    expect(
      screen.getByRole("table", { name: "Cache GET outcomes" }),
    ).toBeVisible();
    expect(api.runs()).toBe(1);
    expect(api.loads()).toBe(2);
  });

  it("keeps a drafted practice answer across a tab round trip", async () => {
    stubApi();
    renderModule("/topics/cache-aside?view=practice");
    fireEvent.change(await screen.findByLabelText("Your explanation"), {
      target: { value: "The miss cannot be filled." },
    });

    fireEvent.click(tab(/Study/));
    fireEvent.click(tab(/Practice/));

    expect(screen.getByLabelText("Your explanation")).toHaveValue(
      "The miss cannot be filled.",
    );
  });

  it("records tab changes in history so Back and Forward restore the view and its state", async () => {
    stubApi();
    const router = renderModule();
    fireEvent.change(await screen.findByLabelText("TTL (ms)"), {
      target: { value: "250" },
    });

    fireEvent.click(tab(/Study/));
    expect(router.state.location.search).toBe("?view=study");
    await act(() => router.navigate(-1));
    expect(tab(/Playground/)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("TTL (ms)")).toHaveValue(250);

    await act(() => router.navigate(1));
    expect(tab(/Study/)).toHaveAttribute("aria-selected", "true");
    expect(document.title).toBe("Study · Cache-Aside | HLD with UI");
  });

  it("replaces an unsupported view with the default tab without adding history", async () => {
    stubApi();
    const router = renderModule("/topics/cache-aside?view=bogus");

    expect(await screen.findByLabelText("TTL (ms)")).toBeVisible();
    expect(tab(/Playground/)).toHaveAttribute("aria-selected", "true");
    // Normalization commits after the first render, inside a router transition.
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("labels the content version and the Java model version separately", async () => {
    stubApi();
    renderModule();

    expect(await screen.findByText(/^CONTENT/)).toHaveTextContent(
      "CONTENT v1.0.0",
    );
    expect(screen.queryByText(/^MODEL/)).not.toBeInTheDocument();
    expect(screen.getByText("Java model · v1.0.1")).toBeInTheDocument();
  });

  it("starts a module fresh after leaving it for another route", async () => {
    stubApi();
    const router = renderModule();
    fireEvent.change(await screen.findByLabelText("TTL (ms)"), {
      target: { value: "250" },
    });

    await act(() => router.navigate("/elsewhere"));
    fireEvent.click(screen.getByRole("link", { name: "Back to cache" }));

    expect(await screen.findByLabelText("TTL (ms)")).toHaveValue(100);
  });
});
