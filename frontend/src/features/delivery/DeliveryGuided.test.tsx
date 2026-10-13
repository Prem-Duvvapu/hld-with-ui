import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import authored from "../../../../content/topics/queues-delivery/checkpoints.json";
import { api } from "../../api/client";
import type { GuidedCheckpoint } from "../../api/types";
import { createPracticeStore } from "../learning/practiceStorage";
import { DeliveryGuided } from "./DeliveryGuided";
import {
  baselineInput,
  baselineResult,
  descriptor,
} from "./deliveryTestFixtures";
let store: ReturnType<typeof createPracticeStore>;
vi.mock("../learning/practiceStorage", async (original) => ({
  ...(await original<typeof import("../learning/practiceStorage")>()),
  getPracticeStore: () => store,
}));
vi.mock("../../api/client", () => ({ api: { runDelivery: vi.fn() } }));
const first = authored[0]! as GuidedCheckpoint;
// A second baseline target tests concrete shared-preset reuse without inventing another Java outcome.
const confirmed: GuidedCheckpoint = {
  ...first,
  id: "test-baseline-confirmation",
  title: "Broker confirmation",
  target: {
    messageId: "m1",
    attemptId: "m1-a1",
    kind: "ack.accepted",
    occurrence: 1,
  },
};
const checkpoints = [first, confirmed];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.runDelivery).mockResolvedValue(baselineResult);
  let raw: string | null = null;
  store = createPracticeStore(() => ({
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
    },
  }));
});
function guided(items = checkpoints, version = "1.1.0") {
  return (
    <DeliveryGuided
      descriptor={descriptor}
      checkpoints={items}
      contentVersion={version}
    />
  );
}
function reveal() {
  fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
}
it("runs only explicitly and reconstructs the selected Java prefix with complete consumer-record replacement", async () => {
  render(guided());
  expect(api.runDelivery).not.toHaveBeenCalled();
  reveal();
  expect(await screen.findByText(first.explanation)).toBeVisible();
  expect(api.runDelivery).toHaveBeenCalledWith(baselineInput);
  expect(screen.getByLabelText("Trace position")).toHaveValue("2");
  expect(
    screen.getByRole("listitem", { name: "Consumer c1" }),
  ).toHaveTextContent("Current processing attempt: None");
  expect(
    screen.getByRole("listitem", { name: "Message m1" }),
  ).toHaveTextContent("Current attempt: m1-a1");
  expect(
    screen.getByRole("region", {
      name: "Committed ledger at the selected position",
    }),
  ).toHaveTextContent("m1-a1-effect");
  expect(
    screen.queryByRole("table", { name: "Delivery simulation event trace" }),
  ).toBeNull();
});
it("memoizes the actual preset while keeping checkpoint predictions and evidence positions separate", async () => {
  render(guided());
  reveal();
  await screen.findByText(first.explanation);
  fireEvent.click(screen.getByRole("button", { name: "Next checkpoint →" }));
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Broker learns at 55 ms." },
  });
  reveal();
  await screen.findByRole("heading", { name: "Java trace at this checkpoint" });
  expect(screen.getByLabelText("Trace position")).toHaveValue("4");
  expect(
    screen.getByRole("listitem", { name: "Message m1" }),
  ).toHaveTextContent("Current attempt: None");
  expect(api.runDelivery).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole("button", { name: "← Previous checkpoint" }),
  );
  expect(
    screen.getByLabelText(
      "Your prediction (revise it after seeing the evidence)",
    ),
  ).toHaveValue("");
});
it("restores prediction and tradeoff after remount but requires explicit execution for fresh evidence", async () => {
  const view = render(guided());
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Ledger has a record before ACK." },
  });
  reveal();
  const option = first.tradeoff.options[0]!;
  fireEvent.click(await screen.findByLabelText(option.label));
  view.unmount();
  render(guided());
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Ledger has a record before ACK.",
  );
  expect(screen.queryByText(first.explanation)).toBeNull();
  expect(api.runDelivery).toHaveBeenCalledTimes(1);
  reveal();
  expect(await screen.findByLabelText(option.label)).toBeChecked();
  expect(api.runDelivery).toHaveBeenCalledTimes(2);
});
it("does not expose reference explanation or tradeoffs for a missing message/attempt target", async () => {
  render(
    guided([
      {
        ...first,
        target: {
          messageId: "m1",
          attemptId: "m1-a2",
          kind: "effect.committed",
          occurrence: 1,
        },
      },
    ]),
  );
  reveal();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "no longer matches the Java trace",
  );
  expect(screen.queryByText(first.explanation)).toBeNull();
  expect(screen.queryByText("4. Choose a tradeoff")).toBeNull();
  expect(store.getSnapshot().answers).toHaveLength(0);
});
it("ignores a pending response after successful answer reset", async () => {
  let resolve!: (value: typeof baselineResult) => void;
  vi.mocked(api.runDelivery).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(guided());
  reveal();
  act(() => {
    expect(store.resetTopic(descriptor.id).ok).toBe(true);
  });
  await act(async () => resolve(baselineResult));
  expect(store.getSnapshot().answers).toHaveLength(0);
  expect(screen.queryByText(first.explanation)).toBeNull();
  expect(screen.getByRole("button", { name: "Run and reveal" })).toBeEnabled();
});
it("invalidates transient evidence after a lesson version change while preserving older reasoning", async () => {
  const view = render(guided());
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Previous reasoning" },
  });
  reveal();
  await screen.findByText(first.explanation);
  view.rerender(guided(checkpoints, "1.2.0"));
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Previous reasoning",
  );
  expect(screen.queryByText(first.explanation)).toBeNull();
  expect(screen.getByRole("note")).toHaveTextContent("content v1.1.0");
  reveal();
  await screen.findByText(first.explanation);
  expect(api.runDelivery).toHaveBeenCalledTimes(2);
});
it("scopes a pending failure to its checkpoint and allows explicit retry on returning", async () => {
  let reject!: (value: Error) => void;
  vi.mocked(api.runDelivery).mockImplementationOnce(
    () =>
      new Promise((_done, fail) => {
        reject = fail;
      }),
  );
  render(guided());
  reveal();
  fireEvent.click(screen.getByRole("button", { name: "Next checkpoint →" }));
  await act(async () => reject(new Error("First checkpoint unavailable")));
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "← Previous checkpoint" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "First checkpoint unavailable",
  );
  reveal();
  await screen.findByText(first.explanation);
  expect(api.runDelivery).toHaveBeenCalledTimes(2);
});
it("leaves valid explicit evidence readable with a truthful save warning at the record limit, and a scoped reset hides it", async () => {
  for (let index = 0; index < 200; index++)
    expect(
      store.save({
        topicId: index === 0 ? descriptor.id : "retired",
        activityId: `old-${index}`,
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
  expect(screen.queryByText(first.explanation)).toBeNull();
  expect(store.getSnapshot().answers).toHaveLength(199);
});
