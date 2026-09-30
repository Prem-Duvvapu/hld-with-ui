import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CacheAsideDescriptor,
  CacheAsideEvent,
  CacheAsideInput,
  CacheAsideResult,
} from "../../api/types";
import { CacheAsidePlayground } from "./CacheAsidePlayground";

const baseInput: CacheAsideInput = {
  schemaVersion: "1.0",
  modelVersion: "1.0.1",
  cacheLookupLatencyMs: 2,
  originReadLatencyMs: 20,
  ttlMs: 100,
  initialOriginValue: "v1",
  operations: [
    { kind: "GET", key: "k", timeMs: 0 },
    { kind: "GET", key: "k", timeMs: 30 },
    { kind: "UPDATE", key: "k", value: "v2", timeMs: 40 },
    { kind: "GET", key: "k", timeMs: 70 },
    { kind: "GET", key: "k", timeMs: 120 },
  ],
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
      title: "Baseline: hit, miss, and stale read",
      question: "Why does a hit return an old value?",
      input: baseInput,
    },
    {
      id: "cache-unavailable",
      title: "Cache unavailable",
      question: "What happens when every read skips the cache?",
      input: {
        ...baseInput,
        operations: [
          { kind: "GET", key: "k", timeMs: 0 },
          { kind: "GET", key: "k", timeMs: 30 },
          { kind: "GET", key: "k", timeMs: 60 },
        ],
        cacheAvailable: false,
      },
    },
  ],
  assumptions: ["No coalescing of concurrent cache misses."],
};

// Returned by the Java simulator for the baseline preset.
const baselineResult: CacheAsideResult = {
  schemaVersion: "1.0",
  simulationId: "cache-aside",
  modelVersion: "1.0.1",
  seed: 7,
  status: "completed",
  lastVirtualTimeMs: 142,
  incompleteGets: 0,
  assumptions: ["TTL is measured from the fill time."],
  events: (
    [
      [2, "cache.miss", "cache", "Cache miss (no entry)."],
      [22, "origin.read", "origin", "Origin returns 'v1'."],
      [22, "cache.fill", "cache", "Cache filled with 'v1'; expires at 122 ms."],
      [32, "cache.hit", "cache", "Cache hit: 'v1'."],
      [40, "origin.update", "origin", "Origin updated to 'v2'."],
      [72, "cache.hit", "cache", "Cache hit: 'v1' (stale; origin has 'v2')."],
      [122, "cache.miss", "cache", "Cache miss (expired)."],
      [142, "origin.read", "origin", "Origin returns 'v2'."],
      [
        142,
        "cache.fill",
        "cache",
        "Cache filled with 'v2'; expires at 242 ms.",
      ],
    ] as const
  ).map(([timeMs, kind, nodeId, message], sequence): CacheAsideEvent => ({
    sequence: sequence + 1,
    timeMs,
    kind,
    requestId: "k",
    nodeId,
    message,
  })),
  outcomes: [
    [0, 22, "v1", "MISS", false],
    [30, 32, "v1", "HIT", false],
    [70, 72, "v1", "HIT", true],
    [120, 142, "v2", "MISS", false],
  ].map(([requestTimeMs, responseTimeMs, returnedValue, hitOrMiss, stale]) => ({
    key: "k",
    returnedValue: returnedValue as string,
    hitOrMiss: hitOrMiss as "HIT" | "MISS",
    stale: stale as boolean,
    requestTimeMs: requestTimeMs as number,
    responseTimeMs: responseTimeMs as number,
    latencyMs: (responseTimeMs as number) - (requestTimeMs as number),
  })),
  metrics: {
    totalGets: 4,
    cacheBypasses: 0,
    failedGets: 0,
    cacheHits: 2,
    cacheMisses: 2,
    staleReads: 1,
    originReads: 2,
    hitRatio: 0.5,
    observationWindowMs: 142,
  },
};

function mockFetch(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentInput(fetchMock: ReturnType<typeof vi.fn>): CacheAsideInput {
  const [, options] = fetchMock.mock.calls[0]!;
  return JSON.parse(options.body) as CacheAsideInput;
}

function metric(label: string) {
  return screen.getByText(label).parentElement!;
}

function run() {
  fireEvent.click(screen.getByRole("button", { name: "Run simulation" }));
}

afterEach(() => vi.unstubAllGlobals());

describe("Cache-aside playground", () => {
  it("sends the preset's operations and shows the stale hit from the Java trace", async () => {
    const fetchMock = mockFetch(baselineResult);
    render(<CacheAsidePlayground descriptor={descriptor} />);

    run();

    const outcomes = await screen.findByRole("table", {
      name: "Cache GET outcomes",
    });
    expect(sentInput(fetchMock)).toMatchObject({
      ttlMs: 100,
      cacheAvailable: true,
      originAvailable: true,
      operations: [
        { kind: "GET", key: "k", value: null, timeMs: 0 },
        { kind: "GET", key: "k", value: null, timeMs: 30 },
        { kind: "UPDATE", key: "k", value: "v2", timeMs: 40 },
        { kind: "GET", key: "k", value: null, timeMs: 70 },
        { kind: "GET", key: "k", value: null, timeMs: 120 },
      ],
    });
    expect(metric("Stale Reads")).toHaveTextContent("1");
    expect(metric("Origin Reads")).toHaveTextContent("2");
    expect(metric("Hit Ratio")).toHaveTextContent("50.0%");

    const rows = within(outcomes).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    expect(rows[2]).toHaveClass("stale-row");
    expect(rows[2]).toHaveTextContent("HITv1⚠ Yes");
    expect(rows[3]).toHaveTextContent("MISSv2No");
    expect(
      screen.getByText("Cache hit: 'v1' (stale; origin has 'v2')."),
    ).toBeInTheDocument();
  });

  it("loads another preset's inputs and clears the previous result", async () => {
    const fetchMock = mockFetch(baselineResult);
    render(<CacheAsidePlayground descriptor={descriptor} />);
    run();
    await screen.findByRole("table", { name: "Cache GET outcomes" });

    fireEvent.click(screen.getByRole("button", { name: "Cache unavailable" }));

    expect(
      screen.queryByRole("table", { name: "Cache GET outcomes" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cache available")).not.toBeChecked();
    expect(screen.getByLabelText(/^Operations/)).toHaveValue(
      "GET k @0\nGET k @30\nGET k @60",
    );

    run();
    await screen.findByRole("table", { name: "Cache GET outcomes" });
    const [, options] = fetchMock.mock.calls[1]!;
    expect(JSON.parse(options.body)).toMatchObject({
      cacheAvailable: false,
      operations: [
        { kind: "GET", timeMs: 0 },
        { kind: "GET", timeMs: 30 },
        { kind: "GET", timeMs: 60 },
      ],
    });
  });

  it("sends edited TTL, availability, and operations to the model", async () => {
    const fetchMock = mockFetch(baselineResult);
    render(<CacheAsidePlayground descriptor={descriptor} />);

    fireEvent.change(screen.getByLabelText("TTL (ms)"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByLabelText("Origin available"));
    fireEvent.change(screen.getByLabelText(/^Operations/), {
      target: { value: "get user:1 @5\n\n  update user:1 v9 @6  " },
    });
    run();

    await screen.findByRole("table", { name: "Cache GET outcomes" });
    expect(sentInput(fetchMock)).toMatchObject({
      ttlMs: 0,
      originAvailable: false,
      operations: [
        { kind: "GET", key: "user:1", value: null, timeMs: 5 },
        { kind: "UPDATE", key: "user:1", value: "v9", timeMs: 6 },
      ],
    });
  });

  it.each([
    ["GET k", 'Line 1: expected "GET key @time" or "UPDATE key value @time".'],
    ["GET k @0\nUPDATE k @5", "Line 2: UPDATE requires a value."],
    ["GET k @300001", "Line 1: time must be 0–60,000."],
    ["   \n", "Operations need 1–100 lines."],
    [
      Array.from({ length: 101 }, (_, index) => `GET k @${index}`).join("\n"),
      "Operations need 1–100 lines.",
    ],
  ])("rejects operations %j before calling the API", (operations, message) => {
    const fetchMock = mockFetch(baselineResult);
    render(<CacheAsidePlayground descriptor={descriptor} />);

    fireEvent.change(screen.getByLabelText(/^Operations/), {
      target: { value: operations },
    });
    run();

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["TTL (ms)", "60001", "TTL must be a whole number from 0 to 60000."],
    [
      "Cache lookup (ms)",
      "1.5",
      "Cache lookup latency must be a whole number from 0 to 10000.",
    ],
    [
      "Origin read (ms)",
      "",
      "Origin read latency must be a whole number from 0 to 10000.",
    ],
  ])("rejects %s = %j before calling the API", (label, value, message) => {
    const fetchMock = mockFetch(baselineResult);
    render(<CacheAsidePlayground descriptor={descriptor} />);

    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    run();

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the Java validation message and no stale result when a run is rejected", async () => {
    const fetchMock = mockFetch(baselineResult);
    render(<CacheAsidePlayground descriptor={descriptor} />);
    run();
    await screen.findByRole("table", { name: "Cache GET outcomes" });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        code: "invalid_input",
        message: "UPDATE operations must have a non-empty value.",
        fieldErrors: {},
      }),
    });
    run();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "UPDATE operations must have a non-empty value.",
    );
    expect(
      screen.queryByRole("table", { name: "Cache GET outcomes" }),
    ).not.toBeInTheDocument();
  });

  it("shows a placeholder when a GET returns no value because the origin is down", async () => {
    mockFetch({
      ...baselineResult,
      events: [
        {
          sequence: 1,
          timeMs: 2,
          kind: "cache.error",
          requestId: "k",
          nodeId: "origin",
          message: "Origin unavailable; GET fails on miss.",
        },
      ],
      outcomes: [
        {
          key: "k",
          hitOrMiss: "ERROR",
          stale: false,
          requestTimeMs: 0,
          responseTimeMs: 2,
          latencyMs: 2,
        },
      ],
      metrics: { ...baselineResult.metrics, originReads: 0, hitRatio: 0 },
    } satisfies CacheAsideResult);
    render(<CacheAsidePlayground descriptor={descriptor} />);
    run();

    const outcomes = await screen.findByRole("table", {
      name: "Cache GET outcomes",
    });
    expect(within(outcomes).getAllByRole("row")[1]).toHaveTextContent(
      "ERRORUnavailableNo",
    );
    expect(metric("Hit Ratio")).toHaveTextContent("0.0%");
    expect(
      screen.getByText("Origin unavailable; GET fails on miss."),
    ).toBeInTheDocument();
  });
  it("clears old outcomes after editing inputs", async () => {
    mockFetch(baselineResult);
    render(<CacheAsidePlayground descriptor={descriptor} />);
    run();
    await screen.findByRole("table", { name: "Cache GET outcomes" });
    fireEvent.change(screen.getByLabelText("TTL (ms)"), {
      target: { value: "500" },
    });
    expect(
      screen.queryByRole("table", { name: "Cache GET outcomes" }),
    ).not.toBeInTheDocument();
  });

  it("shows truncation and incomplete GETs instead of a complete result", async () => {
    mockFetch({
      ...baselineResult,
      status: "limited",
      truncationReason: "virtual_time_limit",
      incompleteGets: 2,
      lastVirtualTimeMs: 60000,
    });
    render(<CacheAsidePlayground descriptor={descriptor} />);
    run();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "2 GET(s) incomplete",
    );
    expect(screen.getByRole("status")).toHaveTextContent("virtual_time_limit");
  });

  it("preserves the descriptor seed and prevents preset changes during a pending run", async () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const seeded = {
      ...descriptor,
      presets: descriptor.presets.map((p) => ({
        ...p,
        input: { ...p.input, seed: 42 },
      })),
    };
    render(<CacheAsidePlayground descriptor={seeded} />);
    run();
    expect(sentInput(fetchMock).seed).toBe(42);
    expect(screen.getByLabelText("TTL (ms)")).toBeDisabled();
    for (const button of within(
      screen.getByRole("group", { name: "Simulation presets" }),
    ).getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
  it("validates against the limits published in the Java descriptor", () => {
    const fetchMock = mockFetch(baselineResult);
    render(
      <CacheAsidePlayground
        descriptor={{
          ...descriptor,
          limits: { ...descriptor.limits, maxTtlMs: 500, maxOperations: 2 },
        }}
      />,
    );
    expect(screen.getByLabelText("TTL (ms)")).toHaveAttribute("max", "500");

    fireEvent.change(screen.getByLabelText("TTL (ms)"), {
      target: { value: "501" },
    });
    run();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "TTL must be a whole number from 0 to 500.",
    );

    fireEvent.change(screen.getByLabelText("TTL (ms)"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText(/^Operations/), {
      target: { value: "GET k @0\nGET k @1\nGET k @2" },
    });
    run();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Operations need 1–2 lines.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
