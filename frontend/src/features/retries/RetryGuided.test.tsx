import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import authored from "../../../../content/topics/timeouts-retries/checkpoints.json";
import { api } from "../../api/client";
import {
  descriptor,
  input,
  result,
  deadlineResult,
} from "../../api/retryTestFixtures";
import type { GuidedCheckpoint } from "../../api/types";
import { createPracticeStore } from "../learning/practiceStorage";
import { RetryGuided } from "./RetryGuided";
let store: ReturnType<typeof createPracticeStore>;
vi.mock("../learning/practiceStorage", async (original) => ({
  ...(await original<typeof import("../learning/practiceStorage")>()),
  getPracticeStore: () => store,
}));
vi.mock("../../api/client", () => ({ api: { runRetry: vi.fn() } }));
const first = authored.find(
  (checkpoint) => checkpoint.id === "retry-timeout-keeps-work",
)! as GuidedCheckpoint;
const repeated = {
  ...first,
  id: "retry-test-same-preset",
  title: "Explain the same actual timeout again",
};
const reveal = () =>
  fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
const guided = (checkpoints = [first], version = "1.1.0") => (
  <RetryGuided
    descriptor={descriptor}
    checkpoints={checkpoints}
    contentVersion={version}
  />
);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.runRetry).mockResolvedValue(result);
  let raw: string | null = null;
  store = createPracticeStore(() => ({
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
    },
  }));
});
it("runs explicitly and displays selected timeout evidence without a future retry or whole-run metrics", async () => {
  render(guided());
  expect(api.runRetry).not.toHaveBeenCalled();
  reveal();
  await screen.findByText(first.explanation);
  expect(api.runRetry).toHaveBeenCalledWith(input);
  expect(
    screen.getByRole("region", { name: "Selected retry checkpoint event" }),
  ).toHaveTextContent(
    result.events.find((e) => e.kind === "ATTEMPT_TIMED_OUT")!.explanation,
  );
  expect(
    screen.getByRole("article", { name: "Retry attempt a-a1" }),
  ).toHaveTextContent("Timed out");
  expect(
    screen.getByRole("article", { name: "Retry attempt a-a1" }),
  ).toHaveTextContent("Running");
  expect(
    screen.queryByRole("article", { name: "Retry attempt a-a2" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "Whole retry experiment summary" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  expect(store.getSnapshot().answers[0]?.topicId).toBe("timeouts-retries");
});
it("reuses a real preset run while storing separate checkpoint predictions", async () => {
  render(guided([first, repeated]));
  reveal();
  await screen.findByText(first.explanation);
  fireEvent.click(screen.getByRole("button", { name: "Next checkpoint →" }));
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "The server still owns the first work." },
  });
  reveal();
  await screen.findByRole("heading", {
    name: "Java evidence at this checkpoint",
  });
  expect(api.runRetry).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole("button", { name: "← Previous checkpoint" }),
  );
  expect(
    screen.getByLabelText(
      "Your prediction (revise it after seeing the evidence)",
    ),
  ).toHaveValue("");
});
it("withholds the authored explanation and tradeoffs when semantic identity no longer matches Java", async () => {
  const missing = {
    ...first,
    target: {
      requestId: "a",
      attemptId: "a-a1",
      kind: "WORK_QUEUED",
      occurrence: 1,
    },
  } as GuidedCheckpoint;
  render(guided([missing]));
  reveal();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "no longer matches the Java evidence",
  );
  expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
  expect(screen.queryByText("4. Choose a tradeoff")).not.toBeInTheDocument();
  expect(store.getSnapshot().answers).toHaveLength(0);
});
it("ignores a pending response after topic reset and allows a new explicit run", async () => {
  let resolve!: (value: typeof result) => void;
  vi.mocked(api.runRetry).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(guided());
  reveal();
  expect(
    screen.getByRole("button", { name: "Running the Java model…" }),
  ).toBeDisabled();
  act(() => {
    expect(store.resetTopic("timeouts-retries").ok).toBe(true);
  });
  await act(async () => resolve(result));
  expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
  expect(store.getSnapshot().answers).toHaveLength(0);
  reveal();
  await screen.findByText(first.explanation);
  expect(api.runRetry).toHaveBeenCalledTimes(2);
});
it("keeps a failed checkpoint's prediction and retries without losing its reasoning", async () => {
  vi.mocked(api.runRetry).mockRejectedValueOnce(
    new Error("The retry model is occupied"),
  );
  render(guided());
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "A caller timeout does not cancel work." },
  });
  reveal();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The retry model is occupied",
  );
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "A caller timeout does not cancel work.",
  );
  reveal();
  await screen.findByText(first.explanation);
  expect(api.runRetry).toHaveBeenCalledTimes(2);
});
it("restores saved reasoning after remount and invalidates evidence after content versions change", async () => {
  const page = render(guided());
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Retain my earlier explanation." },
  });
  reveal();
  await screen.findByText(first.explanation);
  page.rerender(guided([first], "1.2.0"));
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Retain my earlier explanation.",
  );
  expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
  expect(screen.getByRole("note")).toHaveTextContent("content v1.1.0");
  reveal();
  await screen.findByText(first.explanation);
  page.unmount();
  render(guided([first], "1.2.0"));
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Retain my earlier explanation.",
  );
  expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
  expect(api.runRetry).toHaveBeenCalledTimes(2);
});
it("shows a blocked proposal as unscheduled without leaking the later overall failure", async () => {
  const checkpoint = authored.find(
    (item) => item.id === "retry-proposal-is-not-scheduled",
  )! as GuidedCheckpoint;
  vi.mocked(api.runRetry).mockResolvedValueOnce(deadlineResult);
  render(guided([checkpoint]));
  reveal();
  await screen.findByText(checkpoint.explanation);
  expect(
    screen.getByRole("region", { name: "Selected retry checkpoint event" }),
  ).toHaveTextContent("proposed 120 ms retry is blocked; it is not scheduled");
  const caller = screen.getByRole("article", { name: "Caller a" });
  expect(caller).toHaveTextContent(
    "No retry scheduled; awaiting overall deadline",
  );
  expect(caller).toHaveTextContent("Not observed");
  expect(caller).not.toHaveTextContent("Overall deadline reached");
  expect(
    screen.queryByRole("article", { name: "Retry attempt a-a3" }),
  ).not.toBeInTheDocument();
});
