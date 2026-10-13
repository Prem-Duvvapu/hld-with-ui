import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import checkpointFixture from "../../../../content/topics/queues-tail-latency/checkpoints.json";
import type { GuidedCheckpoint } from "../../api/types";
import { QueueGuided } from "./QueueGuided";
import { baselineResult, descriptor } from "./queueTestFixtures";
import { createPracticeStore } from "../learning/practiceStorage";
let store: ReturnType<typeof createPracticeStore>;
vi.mock("../learning/practiceStorage", async (original) => ({
  ...(await original<typeof import("../learning/practiceStorage")>()),
  getPracticeStore: () => store,
}));
const checkpoints = (checkpointFixture as GuidedCheckpoint[]).filter(
  (item) => item.presetId === "baseline",
);
beforeEach(() => {
  let raw: string | null = null;
  store = createPracticeStore(() => ({
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
    },
  }));
});
afterEach(() => vi.unstubAllGlobals());
function mockRun() {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => baselineResult,
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
function guided(items = checkpoints, version = "1.1.0") {
  return (
    <QueueGuided
      descriptor={descriptor}
      checkpoints={items}
      contentVersion={version}
    />
  );
}
function reveal() {
  fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
}
it("runs only explicitly and reveals the selected authoritative worker snapshot without a full trace table", async () => {
  const fetch = mockRun();
  render(guided());
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "An idle worker accepts the job." },
  });
  reveal();
  expect(await screen.findByText(checkpoints[0]!.explanation)).toBeVisible();
  expect(
    screen.getByRole("region", { name: "Worker worker-1" }),
  ).toHaveTextContent("job-1");
  expect(screen.getByLabelText("Trace position")).toHaveValue("0");
  expect(
    screen.queryByRole("table", { name: "Queue simulation event trace" }),
  ).toBeNull();
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(
    descriptor.presets[0]!.input,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("memoizes a Java preset across checkpoints while retaining their separate predictions", async () => {
  const fetch = mockRun();
  render(guided());
  reveal();
  await screen.findByText(checkpoints[0]!.explanation);
  fireEvent.click(screen.getByRole("button", { name: "Next checkpoint →" }));
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Job-2 waits behind job-1." },
  });
  reveal();
  expect(await screen.findByText(checkpoints[1]!.explanation)).toBeVisible();
  expect(screen.getByLabelText("Trace position")).toHaveValue("1");
  expect(
    screen.getByRole("region", { name: "Shared waiting queue" }),
  ).toHaveTextContent("job-2");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("restores answers after remount but requires an explicit Java run before revealing evidence", async () => {
  const fetch = mockRun();
  const view = render(guided());
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "My own prediction." },
  });
  reveal();
  const option = checkpoints[0]!.tradeoff.options[0]!;
  fireEvent.click(await screen.findByLabelText(option.label));
  view.unmount();
  render(guided());
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "My own prediction.",
  );
  expect(screen.queryByText(checkpoints[0]!.explanation)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  reveal();
  expect(await screen.findByLabelText(option.label)).toBeChecked();
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("does not recreate reset answers or expose a pending response after a successful reset", async () => {
  let resolve!: (response: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    ),
  );
  render(guided());
  reveal();
  act(() => {
    expect(store.resetTopic(descriptor.id).ok).toBe(true);
  });
  await act(async () =>
    resolve({ ok: true, status: 200, json: async () => baselineResult }),
  );
  expect(store.getSnapshot().answers).toHaveLength(0);
  expect(screen.queryByText(checkpoints[0]!.explanation)).toBeNull();
  expect(screen.getByRole("button", { name: "Run and reveal" })).toBeEnabled();
});
it("hides explanation and tradeoff when the Java result has no matching semantic event", async () => {
  mockRun();
  render(
    guided([
      {
        ...checkpoints[0]!,
        target: { jobId: "missing-job", kind: "job.started", occurrence: 1 },
      },
    ]),
  );
  reveal();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "no longer matches the Java evidence",
  );
  expect(screen.queryByText(checkpoints[0]!.explanation)).toBeNull();
  expect(screen.queryByText("4. Choose a tradeoff")).toBeNull();
  expect(store.getSnapshot().answers).toHaveLength(0);
});
it("clears transient Java runs after a content version change while keeping the older prediction", async () => {
  const fetch = mockRun();
  const view = render(guided());
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Previous reasoning." },
  });
  reveal();
  await screen.findByText(checkpoints[0]!.explanation);
  view.rerender(guided(checkpoints, "1.2.0"));
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Previous reasoning.",
  );
  expect(screen.queryByText(checkpoints[0]!.explanation)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  reveal();
  await screen.findByText(checkpoints[0]!.explanation);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("lets a matched trace remain readable when the answer record limit refuses a save, and reset hides it", async () => {
  for (let index = 0; index < 200; index++)
    expect(
      store.save({
        topicId: index === 0 ? descriptor.id : "retired",
        activityId: `old-${index}`,
        contentVersion: "1.0.0",
        answer: { kind: "text", text: "Keep this answer." },
        referenceViewed: false,
      }).ok,
    ).toBe(true);
  const before = store.getSnapshot().answers;
  mockRun();
  render(guided());
  reveal();
  expect(await screen.findByText(checkpoints[0]!.explanation)).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "answer limit was reached",
  );
  expect(store.getSnapshot().answers).toEqual(before);
  act(() => {
    expect(store.resetTopic(descriptor.id).ok).toBe(true);
  });
  expect(screen.queryByText(checkpoints[0]!.explanation)).toBeNull();
  expect(store.getSnapshot().answers).toHaveLength(199);
});
it("keeps a pending checkpoint failure scoped to that checkpoint and retries it explicitly", async () => {
  let resolve!: (response: unknown) => void;
  const fetch = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => baselineResult,
    });
  vi.stubGlobal("fetch", fetch);
  render(guided());
  reveal();
  fireEvent.click(screen.getByRole("button", { name: "Next checkpoint →" }));
  await act(async () =>
    resolve({
      ok: false,
      status: 503,
      json: async () => ({ message: "Checkpoint A could not run." }),
    }),
  );
  expect(
    screen.getByRole("heading", { name: checkpoints[1]!.title, level: 2 }),
  ).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "← Previous checkpoint" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Checkpoint A could not run.",
  );
  reveal();
  await screen.findByText(checkpoints[0]!.explanation);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(2);
});
