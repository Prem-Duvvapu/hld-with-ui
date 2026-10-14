import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import authored from "../../../../content/topics/transactions-isolation/checkpoints.json";
import { api } from "../../api/client";
import type { GuidedCheckpoint } from "../../api/types";
import { createPracticeStore } from "../learning/practiceStorage";
import { ReservationGuided } from "./ReservationGuided";
import {
  descriptor,
  protectedInput as input,
  protectedResult as result,
  result as unsafeResult,
} from "./reservationTestFixtures";
let store: ReturnType<typeof createPracticeStore>;
vi.mock("../learning/practiceStorage", async (original) => ({
  ...(await original<typeof import("../learning/practiceStorage")>()),
  getPracticeStore: () => store,
}));
vi.mock("../../api/client", () => ({ api: { runReservation: vi.fn() } }));
const first = authored[0]! as GuidedCheckpoint;
const samePreset: GuidedCheckpoint = {
  ...first,
  id: "test-read-again",
  title: "Read the same Java evidence again",
};
const checkpoints = [first, samePreset];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.runReservation).mockResolvedValue(result);
  let raw: string | null = null;
  store = createPracticeStore(() => ({
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
    },
  }));
});
const guided = (items = checkpoints, version = "1.1.0") => (
  <ReservationGuided
    descriptor={descriptor}
    checkpoints={items}
    contentVersion={version}
  />
);
const reveal = () =>
  fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
it("runs only explicitly and shows selected operation counts without whole-run or final-state panels", async () => {
  render(guided());
  expect(api.runReservation).not.toHaveBeenCalled();
  reveal();
  expect(await screen.findByText(first.explanation)).toBeVisible();
  expect(api.runReservation).toHaveBeenCalledWith(input);
  expect(
    screen.getByRole("article", { name: "Evidence for read-b" }),
  ).toHaveTextContent(result.outcomes[1]!.explanation);
  const snapshot = screen.getByRole("region", {
    name: "Selected reservation snapshot",
  });
  expect(snapshot).toHaveTextContent("No allocations at this snapshot.");
  expect(
    screen.queryByRole("region", { name: "Whole schedule summary" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
});
it("reuses an actual preset while preserving separate checkpoint predictions", async () => {
  render(guided());
  reveal();
  await screen.findByText(first.explanation);
  fireEvent.click(screen.getByRole("button", { name: "Next checkpoint →" }));
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "The same submitted query should return the same IDs." },
  });
  reveal();
  await screen.findByRole("heading", {
    name: "Java evidence at this checkpoint",
  });
  expect(api.runReservation).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole("button", { name: "← Previous checkpoint" }),
  );
  expect(
    screen.getByLabelText(
      "Your prediction (revise it after seeing the evidence)",
    ),
  ).toHaveValue("");
});
it("restores saved reasoning and tradeoff but requires explicit execution for evidence after remount", async () => {
  const view = render(guided());
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Two grouped entries should match." },
  });
  reveal();
  const option = first.tradeoff.options[0]!;
  fireEvent.click(await screen.findByLabelText(option.label));
  view.unmount();
  render(guided());
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Two grouped entries should match.",
  );
  expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
  expect(api.runReservation).toHaveBeenCalledTimes(1);
  reveal();
  expect(await screen.findByLabelText(option.label)).toBeChecked();
  expect(api.runReservation).toHaveBeenCalledTimes(2);
});
it("withholds explanation and tradeoffs when an operation target cannot be matched", async () => {
  render(
    guided([
      {
        ...first,
        target: { stepId: "missing", kind: "READ_OBSERVED", occurrence: 1 },
      },
    ]),
  );
  reveal();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "no longer matches the Java evidence",
  );
  expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
  expect(screen.queryByText("4. Choose a tradeoff")).not.toBeInTheDocument();
  expect(store.getSnapshot().answers).toHaveLength(0);
});
it("ignores a pending response after topic answer reset and allows another explicit run", async () => {
  let resolve!: (value: typeof result) => void;
  vi.mocked(api.runReservation).mockImplementationOnce(
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
    expect(store.resetTopic(descriptor.id).ok).toBe(true);
  });
  await act(async () => resolve(result));
  expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
  expect(store.getSnapshot().answers).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Run and reveal" })).toBeEnabled();
  reveal();
  await screen.findByText(first.explanation);
  expect(api.runReservation).toHaveBeenCalledTimes(2);
});
it("preserves older reasoning but invalidates transient evidence when content version changes", async () => {
  const view = render(guided());
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Earlier reasoning" },
  });
  reveal();
  await screen.findByText(first.explanation);
  view.rerender(guided(checkpoints, "1.2.0"));
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Earlier reasoning",
  );
  expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
  expect(screen.getByRole("note")).toHaveTextContent("content v1.1.0");
  reveal();
  await screen.findByText(first.explanation);
  expect(api.runReservation).toHaveBeenCalledTimes(2);
});
it("scopes pending failure to the initiating checkpoint and preserves its prediction for retry", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(api.runReservation).mockImplementationOnce(
    () =>
      new Promise((_done, fail) => {
        reject = fail;
      }),
  );
  render(guided());
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Keep this prediction" },
  });
  reveal();
  fireEvent.click(screen.getByRole("button", { name: "Next checkpoint →" }));
  await act(async () => reject(new Error("First operation unavailable")));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "← Previous checkpoint" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "First operation unavailable",
  );
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Keep this prediction",
  );
  reveal();
  await screen.findByText(first.explanation);
});
it("keeps explicit evidence readable when saving is full and hides it on scoped reset", async () => {
  for (let i = 0; i < 200; i++)
    expect(
      store.save({
        topicId: i === 0 ? descriptor.id : "retired",
        activityId: `old-${i}`,
        contentVersion: "1.0.0",
        answer: { kind: "text", text: "Preserve this" },
        referenceViewed: false,
      }).ok,
    ).toBe(true);
  const before = store.getSnapshot().answers;
  render(guided());
  reveal();
  expect(await screen.findByText(first.explanation)).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "answer limit was reached",
  );
  expect(store.getSnapshot().answers).toEqual(before);
  act(() => {
    expect(store.resetTopic(descriptor.id).ok).toBe(true);
  });
  expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
  expect(store.getSnapshot().answers).toHaveLength(199);
});
it("reveals the first unsafe acceptance without leaking later violated flags or history metrics", async () => {
  vi.mocked(api.runReservation).mockResolvedValueOnce(unsafeResult);
  const checkpoint = authored[1]! as GuidedCheckpoint;
  render(guided([checkpoint]));
  reveal();
  await screen.findByText(checkpoint.explanation);
  expect(
    screen.getByRole("article", { name: "Evidence for attempt-a" }),
  ).toHaveTextContent(unsafeResult.outcomes[2]!.explanation);
  expect(
    screen.getByRole("region", { name: "Allocations at this snapshot" }),
  ).toHaveTextContent("a");
  expect(
    screen.queryByText("Violated", { exact: true }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "Whole schedule summary" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(unsafeResult.outcomes[3]!.explanation),
  ).not.toBeInTheDocument();
});
