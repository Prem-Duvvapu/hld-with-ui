import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import type { ReservationResult } from "../../api/types";
import { ReservationPlayground } from "./ReservationPlayground";
import {
  descriptor,
  input,
  protectedInput,
  protectedResult,
  result,
} from "./reservationTestFixtures";

vi.mock("../../api/client", () => ({ api: { runReservation: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
const run = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Run reservation schedule" }),
  );
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const snapshot = () =>
  screen.getByRole("region", { name: "Selected reservation snapshot" });
const fact = (scope: HTMLElement, label: string) =>
  within(scope).getByText(label, { exact: true }).parentElement!;

it("waits for an explicit run and preserves a blank invalid quantity without a request", () => {
  render(<ReservationPlayground descriptor={descriptor} />);
  expect(api.runReservation).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("region", { name: "Java reservation analysis results" }),
  ).not.toBeInTheDocument();
  change("Reservation 1 quantity", "");
  run();
  expect(api.runReservation).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Reservation 1 quantity")).toHaveValue("");
  expect(screen.getByLabelText("Reservation 1 quantity")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Check the highlighted fields",
  );
});

it("selects the named unsafe baseline even when descriptor presets arrive in a different order", () => {
  render(
    <ReservationPlayground
      descriptor={{ ...descriptor, presets: [...descriptor.presets].reverse() }}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Both read one unit" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("Reservation strategy")).toHaveValue(
    "STALE_READ_WRITE",
  );
  expect(api.runReservation).not.toHaveBeenCalled();
});

it("captures one pending request, locks changes and presets, and keeps the prediction editable", async () => {
  let resolve!: (value: ReservationResult) => void;
  vi.mocked(api.runReservation).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<ReservationPlayground descriptor={descriptor} />);
  run();
  expect(api.runReservation).toHaveBeenCalledExactlyOnceWith(input);
  const preset = screen.getByRole("button", {
    name: "Check current stock atomically",
  });
  expect(preset).toBeDisabled();
  expect(screen.getByLabelText("Reservation 1 ID")).toBeDisabled();
  expect(screen.getByLabelText("Initial stock (units)")).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Add reservation" }),
  ).toBeDisabled();
  fireEvent.click(preset);
  change("Initial stock (units)", "20");
  fireEvent.click(screen.getByRole("button", { name: "Running in Java…" }));
  expect(api.runReservation).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Initial stock (units)")).toHaveValue("1");
  expect(screen.getByLabelText("Reservation strategy")).toHaveValue(
    "STALE_READ_WRITE",
  );
  change(
    "Your prediction (optional)",
    "Both saved reads may accept the last unit.",
  );
  await act(async () => resolve(result));
  expect(
    screen.getByRole("region", { name: "Java reservation analysis results" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Initial stock (units)")).toBeEnabled();
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Both saved reads may accept the last unit.",
  );
});

it("preserves focus and step links while editing IDs, quantities, strategy and order in the submitted request", async () => {
  vi.mocked(api.runReservation).mockRejectedValue(
    new Error("Unavailable for this attempt"),
  );
  render(<ReservationPlayground descriptor={descriptor} />);
  const actor = screen.getByLabelText("Reservation 1 ID");
  actor.focus();
  change("Reservation 1 ID", "team-a");
  expect(screen.getByLabelText("Reservation 1 ID")).toBe(actor);
  expect(actor).toHaveFocus();
  change("Reservation 1 quantity", "2");
  change("Initial stock (units)", "3");
  change("Reservation strategy", "ATOMIC_CONDITIONAL_RESERVATION");
  change("Step 1 ID", "preview-team-a");
  fireEvent.click(screen.getByRole("button", { name: "Move step 3 up" }));
  expect(screen.getByRole("button", { name: "Move step 2 up" })).toHaveFocus();
  expect(screen.getByLabelText("Step 2 ID")).toHaveValue("attempt-a");
  expect(api.runReservation).not.toHaveBeenCalled();
  run();
  expect(api.runReservation).toHaveBeenCalledWith({
    ...input,
    initialUnits: 3,
    strategy: "ATOMIC_CONDITIONAL_RESERVATION",
    reservations: [
      { id: "team-a", quantity: 2 },
      { id: "b", quantity: 1 },
    ],
    schedule: [
      { id: "preview-team-a", reservationId: "team-a", action: "READ" },
      { id: "attempt-a", reservationId: "team-a", action: "ATTEMPT_RESERVE" },
      input.schedule[1],
      input.schedule[3],
    ],
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unavailable for this attempt",
  );
});

it("changes the preset without running and retains the learner's prediction", async () => {
  vi.mocked(api.runReservation).mockResolvedValue(protectedResult);
  render(<ReservationPlayground descriptor={descriptor} />);
  change(
    "Your prediction (optional)",
    "B should check current zero stock and reject.",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Check current stock atomically" }),
  );
  expect(api.runReservation).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Reservation strategy")).toHaveValue(
    "ATOMIC_CONDITIONAL_RESERVATION",
  );
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "B should check current zero stock and reject.",
  );
  run();
  await screen.findByRole("region", {
    name: "Java reservation analysis results",
  });
  expect(api.runReservation).toHaveBeenCalledExactlyOnceWith(protectedInput);
});

it("starts at the initial snapshot and reveals Java prefix evidence only through manual controls", async () => {
  vi.mocked(api.runReservation).mockResolvedValue(result);
  render(<ReservationPlayground descriptor={descriptor} />);
  run();
  await screen.findByRole("region", {
    name: "Java reservation analysis results",
  });
  expect(screen.getByLabelText("Snapshot position")).toHaveValue("0");
  expect(screen.getByRole("button", { name: "Previous step" })).toBeDisabled();
  expect(
    within(snapshot()).getByRole("article", { name: "Initial state" }),
  ).toBeVisible();
  expect(
    within(snapshot()).getByRole("listitem", { name: "Reservation b" }),
  ).toHaveTextContent("Not read yet");
  expect(fact(snapshot(), "Allocated units")).toHaveTextContent("0");
  expect(
    within(snapshot()).getByRole("region", {
      name: "Allocations at this snapshot",
    }),
  ).toHaveTextContent("No allocations at this snapshot.");
  expect(
    within(snapshot()).queryByText("Violated", { exact: true }),
  ).not.toBeInTheDocument();
  const summary = screen.getByRole("region", {
    name: "Whole schedule summary",
  });
  expect(fact(summary, "Accepted reservations")).toHaveTextContent("2");
  expect(fact(summary, "First violating step")).toHaveTextContent("attempt-b");
  fireEvent.click(screen.getByRole("button", { name: "Next step" }));
  expect(
    within(snapshot()).getByRole("article", { name: "Evidence for read-a" }),
  ).toHaveTextContent(result.outcomes[0]!.explanation);
  expect(
    within(snapshot()).getByRole("listitem", { name: "Reservation a" }),
  ).toHaveTextContent("Read observed");
  expect(
    within(snapshot()).getByRole("listitem", { name: "Reservation b" }),
  ).toHaveTextContent("Not read yet");
  change("Snapshot position", "3");
  expect(fact(snapshot(), "Allocated units")).toHaveTextContent("1");
  expect(
    within(snapshot()).getByRole("listitem", { name: "Reservation b" }),
  ).toHaveTextContent("Read observed");
  expect(
    within(snapshot()).queryByText("Violated", { exact: true }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next step" }));
  expect(fact(snapshot(), "Allocated units")).toHaveTextContent("2");
  expect(
    within(snapshot()).getByText(
      "Checked 1 units from the earlier read for a quantity of 1.",
    ),
  ).toBeVisible();
  expect(fact(snapshot(), "Remaining stock is nonnegative")).toHaveTextContent(
    "Preserved",
  );
  expect(
    fact(snapshot(), "Allocated units fit initial capacity"),
  ).toHaveTextContent("Violated");
  expect(
    fact(snapshot(), "Remaining + allocated equals initial stock"),
  ).toHaveTextContent("Violated");
  expect(screen.getByRole("button", { name: "Next step" })).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Reset to initial state" }),
  );
  expect(screen.getByLabelText("Snapshot position")).toHaveValue("0");
  expect(fact(snapshot(), "Allocated units")).toHaveTextContent("0");
  expect(api.runReservation).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole("button", { name: /^Play$/ }),
  ).not.toBeInTheDocument();
});

it("shows the protected rejection's current check separately from B's saved observation", async () => {
  vi.mocked(api.runReservation).mockResolvedValue(protectedResult);
  render(<ReservationPlayground descriptor={descriptor} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Check current stock atomically" }),
  );
  run();
  await screen.findByRole("region", {
    name: "Java reservation analysis results",
  });
  change("Snapshot position", "4");
  expect(
    within(snapshot()).getByRole("article", { name: "Evidence for attempt-b" }),
  ).toHaveTextContent("Reservation rejected");
  expect(
    within(snapshot()).getByText(
      "Checked 0 units from current shared stock for a quantity of 1.",
    ),
  ).toBeVisible();
  const b = within(snapshot()).getByRole("listitem", { name: "Reservation b" });
  expect(b).toHaveTextContent("Rejected");
  expect(fact(b, "Earlier observed stock")).toHaveTextContent("1");
  const allocations = within(snapshot()).getByRole("region", {
    name: "Allocations at this snapshot",
  });
  expect(within(allocations).getAllByRole("listitem")).toHaveLength(1);
  expect(allocations).toHaveTextContent("attempt-a");
  expect(allocations).not.toHaveTextContent("attempt-b");
  expect(
    within(snapshot()).queryByText("Violated", { exact: true }),
  ).not.toBeInTheDocument();
});

it("keeps submitted evidence and prediction through a failed changed run, then resets selection after retry", async () => {
  vi.mocked(api.runReservation)
    .mockResolvedValueOnce(result)
    .mockRejectedValueOnce(new Error("Java unavailable"))
    .mockResolvedValueOnce(result);
  render(<ReservationPlayground descriptor={descriptor} />);
  run();
  await screen.findByRole("region", {
    name: "Java reservation analysis results",
  });
  change("Snapshot position", "4");
  change(
    "Your prediction (optional)",
    "A larger inventory changes the invariant check.",
  );
  change("Initial stock (units)", "2");
  expect(screen.getByText(/Inputs have changed\. These results/)).toBeVisible();
  run();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Java unavailable",
  );
  expect(screen.getByLabelText("Snapshot position")).toHaveValue("4");
  expect(fact(snapshot(), "Initial stock")).toHaveTextContent("1");
  expect(screen.getByLabelText("Initial stock (units)")).toHaveValue("2");
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "A larger inventory changes the invariant check.",
  );
  change("Initial stock (units)", "1");
  run();
  await act(async () => {});
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(
    screen.queryByText(/Inputs have changed\. These results/),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Snapshot position")).toHaveValue("0");
  expect(api.runReservation).toHaveBeenCalledTimes(3);
});

it("keeps the old selected snapshot visible while a replacement result is pending", async () => {
  let resolve!: (value: ReservationResult) => void;
  vi.mocked(api.runReservation)
    .mockResolvedValueOnce(result)
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
  render(<ReservationPlayground descriptor={descriptor} />);
  run();
  await screen.findByRole("region", {
    name: "Java reservation analysis results",
  });
  change("Snapshot position", "3");
  fireEvent.click(
    screen.getByRole("button", { name: "Check current stock atomically" }),
  );
  run();
  expect(
    screen.getByText(
      /Running a new schedule\. Showing the previous submitted schedule/,
    ),
  ).toBeVisible();
  expect(screen.getByLabelText("Snapshot position")).toHaveValue("3");
  expect(
    within(snapshot()).getByRole("article", { name: "Evidence for attempt-a" }),
  ).toHaveTextContent(result.outcomes[2]!.explanation);
  await act(async () => resolve(protectedResult));
  expect(screen.getByLabelText("Snapshot position")).toHaveValue("0");
  expect(
    screen.queryByText(
      /Running a new schedule\. Showing the previous submitted schedule/,
    ),
  ).not.toBeInTheDocument();
  expect(api.runReservation).toHaveBeenNthCalledWith(2, protectedInput);
});

it("adds and removes complete input pairs with predictable focus and rejects an illegal explicit reorder", () => {
  render(<ReservationPlayground descriptor={descriptor} />);
  expect(
    screen.getByRole("button", { name: "Remove reservation 1" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Add reservation" }));
  expect(screen.getByLabelText("Reservation 3 ID")).toBeVisible();
  expect(screen.getByLabelText("Step 6 ID")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Remove reservation 3" }));
  expect(screen.getByRole("button", { name: "Add reservation" })).toHaveFocus();
  expect(screen.queryByLabelText("Reservation 3 ID")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Step 5 ID")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Reservation 1 ID")).toHaveValue("a");
  fireEvent.click(screen.getByRole("button", { name: "Move step 3 up" }));
  fireEvent.click(screen.getByRole("button", { name: "Move step 2 up" }));
  expect(screen.getByLabelText("Step 1 ID")).toHaveValue("attempt-a");
  expect(
    screen.getByRole("button", { name: "Move step 1 down" }),
  ).toHaveFocus();
  run();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Check the highlighted fields",
  );
  expect(
    screen.getAllByText(/Read once before attempting once/).length,
  ).toBeGreaterThan(0);
  expect(screen.getByLabelText("Step 1 ID")).toHaveValue("attempt-a");
  expect(api.runReservation).not.toHaveBeenCalled();
});

it("ignores an old response after the playground has unmounted", async () => {
  let resolve!: (value: ReservationResult) => void;
  vi.mocked(api.runReservation).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const previous = render(<ReservationPlayground descriptor={descriptor} />);
  run();
  previous.unmount();
  render(<ReservationPlayground descriptor={descriptor} />);
  await act(async () => resolve(result));
  expect(
    screen.queryByRole("region", { name: "Java reservation analysis results" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Run reservation schedule" }),
  ).toBeEnabled();
});
