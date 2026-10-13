import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import authored from "../../../../content/topics/data-access-models/checkpoints.json";
import { api } from "../../api/client";
import type { GuidedCheckpoint } from "../../api/types";
import { createPracticeStore } from "../learning/practiceStorage";
import { DataAccessGuided } from "./DataAccessGuided";
import { DataAccessEvidence } from "./DataAccessEvidence";
import { descriptor, input, result } from "./dataAccessTestFixtures";
let store: ReturnType<typeof createPracticeStore>;
vi.mock("../learning/practiceStorage", async (original) => ({
  ...(await original<typeof import("../learning/practiceStorage")>()),
  getPracticeStore: () => store,
}));
vi.mock("../../api/client", () => ({ api: { runDataAccess: vi.fn() } }));
const first = authored[0]! as GuidedCheckpoint;
const samePreset: GuidedCheckpoint = {
  ...first,
  id: "test-read-again",
  title: "Read the same Java evidence again",
};
const checkpoints = [first, samePreset];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.runDataAccess).mockResolvedValue(result);
  let raw: string | null = null;
  store = createPracticeStore(() => ({
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
    },
  }));
});
const guided = (items = checkpoints, version = "1.1.0") => (
  <DataAccessGuided
    descriptor={descriptor}
    checkpoints={items}
    contentVersion={version}
  />
);
const reveal = () =>
  fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
it("runs only explicitly and shows selected operation counts without whole-run or final-state panels", async () => {
  render(guided());
  expect(api.runDataAccess).not.toHaveBeenCalled();
  reveal();
  expect(await screen.findByText(first.explanation)).toBeVisible();
  expect(api.runDataAccess).toHaveBeenCalledWith(input);
  expect(
    screen.getByRole("article", { name: "Evidence for q1" }),
  ).toHaveTextContent("12 before this operation → 12 after it");
  expect(
    screen.getByRole("region", { name: "Returned records for this operation" }),
  ).toHaveTextContent("b2");
  expect(screen.queryByText("Whole workload")).not.toBeInTheDocument();
  expect(screen.queryByText(/Final record set/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("navigation", { name: "Select an operation result" }),
  ).not.toBeInTheDocument();
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
  expect(api.runDataAccess).toHaveBeenCalledTimes(1);
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
  expect(api.runDataAccess).toHaveBeenCalledTimes(1);
  reveal();
  expect(await screen.findByLabelText(option.label)).toBeChecked();
  expect(api.runDataAccess).toHaveBeenCalledTimes(2);
});
it("withholds explanation and tradeoffs when an operation target cannot be matched", async () => {
  render(
    guided([
      {
        ...first,
        target: { operationId: "missing", kind: "TENANT_RANGE", occurrence: 1 },
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
  vi.mocked(api.runDataAccess).mockImplementationOnce(
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
  expect(api.runDataAccess).toHaveBeenCalledTimes(2);
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
  expect(api.runDataAccess).toHaveBeenCalledTimes(2);
});
it("scopes pending failure to the initiating checkpoint and preserves its prediction for retry", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(api.runDataAccess).mockImplementationOnce(
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
it("renders one returned operation without exposing another outcome or complete final rows", () => {
  const later = {
    ...result.outcomes[0]!,
    operationId: "later",
    explanation: "Do not display this later outcome.",
  };
  render(
    <DataAccessEvidence
      result={{
        ...result,
        input: {
          ...input,
          operations: [
            ...input.operations,
            { ...input.operations[0]!, id: "later" },
          ],
        },
        outcomes: [...result.outcomes, later],
      }}
      position={0}
    />,
  );
  expect(screen.queryByText(later.explanation)).not.toBeInTheDocument();
  expect(
    screen.getByRole("article", { name: "Evidence for q1" }),
  ).toBeVisible();
  expect(screen.queryByText(/Final record set/)).not.toBeInTheDocument();
  expect(screen.queryByText("a1")).not.toBeInTheDocument();
});
