import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import authored from "../../../../content/topics/transactions-isolation/checkpoints.json";
import { api } from "../../api/client";
import type { GuidedCheckpoint } from "../../api/types";
import { createPracticeStore } from "../learning/practiceStorage";
import { AtomicityGuided } from "./AtomicityGuided";
import { descriptor, result } from "./atomicityTestFixtures";

let store: ReturnType<typeof createPracticeStore>;
vi.mock("../learning/practiceStorage", async (original) => ({
  ...(await original<typeof import("../learning/practiceStorage")>()),
  getPracticeStore: () => store,
}));
vi.mock("../../api/client", () => ({ api: { runAtomicity: vi.fn() } }));
const first = authored.find(
  (item) => item.id === "atomicity-split-abort-leaks",
)! as GuidedCheckpoint;
const beforeAbort = {
  ...first,
  id: "atomicity-test-prefix",
  target: { stepId: "decrement-a", kind: "STOCK_APPLIED", occurrence: 1 },
} as GuidedCheckpoint;
const samePreset = { ...first, id: "atomicity-test-repeat" };
const reveal = () =>
  fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
const guided = (items = [first], version = "1.3.0") => (
  <AtomicityGuided
    descriptor={descriptor}
    checkpoints={items}
    contentVersion={version}
  />
);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.runAtomicity).mockResolvedValue(result);
  let raw: string | null = null;
  store = createPracticeStore(() => ({
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
    },
  }));
});
it("runs explicitly and exposes selected-prefix checks without later abort or whole-history metrics", async () => {
  render(guided([beforeAbort]));
  expect(api.runAtomicity).not.toHaveBeenCalled();
  reveal();
  await screen.findByText(first.explanation);
  expect(
    screen.getByRole("article", { name: "Atomicity evidence for decrement-a" }),
  ).toHaveTextContent(result.outcomes[1]!.explanation);
  expect(screen.getAllByText("Violated", { exact: true })).toHaveLength(1);
  expect(
    screen.queryByText("Explicit user abort (USER_ABORT).", { exact: true }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("region", {
      name: "Whole atomicity experiment summary",
    }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  expect(store.getSnapshot().answers[0]?.topicId).toBe(
    "transactions-isolation",
  );
});
it("filters reservation checkpoints and reuses only its own preset run for separate atomicity predictions", async () => {
  render(guided([authored[0]! as GuidedCheckpoint, first, samePreset]));
  expect(screen.getByRole("heading", { name: first.title })).toBeVisible();
  reveal();
  await screen.findByText(first.explanation);
  fireEvent.click(screen.getByRole("button", { name: "Next checkpoint →" }));
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Keep this separate" },
  });
  reveal();
  await screen.findByRole("heading", {
    name: "Java evidence at this checkpoint",
  });
  expect(api.runAtomicity).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole("button", { name: "← Previous checkpoint" }),
  );
  expect(
    screen.getByLabelText(
      "Your prediction (revise it after seeing the evidence)",
    ),
  ).toHaveValue("");
});
it("withholds explanation and tradeoffs for a mismatched Java target", async () => {
  render(
    guided([
      {
        ...first,
        target: { ...beforeAbort.target, stepId: "missing" },
      } as GuidedCheckpoint,
    ]),
  );
  reveal();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "no longer matches the Java evidence",
  );
  expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
  expect(screen.queryByText("4. Choose a tradeoff")).not.toBeInTheDocument();
});
it("invalidates a pending run on canonical topic reset and permits a new explicit run", async () => {
  let resolve!: (value: typeof result) => void;
  vi.mocked(api.runAtomicity).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(guided());
  reveal();
  act(() => {
    expect(store.resetTopic("transactions-isolation").ok).toBe(true);
  });
  await act(async () => resolve(result));
  expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
  expect(store.getSnapshot().answers).toHaveLength(0);
  reveal();
  await screen.findByText(first.explanation);
  expect(api.runAtomicity).toHaveBeenCalledTimes(2);
});
it("keeps a prediction on a failed run and reveals actual evidence on retry", async () => {
  vi.mocked(api.runAtomicity).mockRejectedValueOnce(
    new Error("Atomicity temporarily unavailable"),
  );
  render(guided());
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Abort keeps the published stock change" },
  });
  reveal();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Atomicity temporarily unavailable",
  );
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Abort keeps the published stock change",
  );
  reveal();
  await screen.findByText(first.explanation);
  expect(api.runAtomicity).toHaveBeenCalledTimes(2);
});
it("restores reasoning on remount or version change but requires an explicit new Java run", async () => {
  const view = render(guided());
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Saved reasoning" },
  });
  reveal();
  await screen.findByText(first.explanation);
  view.rerender(guided([first], "1.4.0"));
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Saved reasoning",
  );
  expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
  expect(screen.getByRole("note")).toHaveTextContent("content v1.3.0");
  reveal();
  await screen.findByText(first.explanation);
  view.unmount();
  render(guided([first], "1.4.0"));
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Saved reasoning",
  );
  expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
  expect(api.runAtomicity).toHaveBeenCalledTimes(2);
});
