import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReservationState } from "../../api/types";
import {
  ReservationArchitectureView,
  ReservationSequenceView,
} from "./ReservationConceptViews";
import { protectedResult, result } from "./reservationTestFixtures";

afterEach(() => vi.unstubAllGlobals());
const selected = () =>
  screen.getByRole("region", { name: "Selected reservation path step" });
const fact = (scope: HTMLElement, name: string) =>
  within(scope)
    .getByText(name, { exact: true })
    .parentElement!.querySelector("dd")!;
const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next path step" }));
function expectState(state: ReservationState) {
  const scope = selected();
  expect(fact(scope, "Remaining units")).toHaveTextContent(
    new RegExp(`^${state.remainingUnits}$`),
  );
  expect(fact(scope, "Allocated units")).toHaveTextContent(
    new RegExp(`^${state.allocatedUnits}$`),
  );
  expect(fact(scope, "Accounted units")).toHaveTextContent(
    new RegExp(`^${state.invariants.accountedUnits}$`),
  );
  for (const actor of state.reservations) {
    expect(scope).toHaveTextContent(
      `${actor.id.toUpperCase()}: ${actor.status}, quantity ${actor.quantity}, observation ${actor.observedRemaining === undefined ? "absent" : actor.observedRemaining}.`,
    );
  }
  for (const [label, value] of [
    ["Nonnegative remaining stock", state.invariants.remainingNonnegative],
    ["Within initial capacity", state.invariants.allocatedWithinCapacity],
    ["Units conserved", state.invariants.unitsConserved],
  ] as const) {
    expect(fact(scope, label)).toHaveTextContent(
      value ? /^Preserved$/ : /^Violated$/,
    );
  }
  if (!state.allocations.length)
    expect(scope).toHaveTextContent("Accepted allocations: None.");
  for (const allocation of state.allocations) {
    expect(scope).toHaveTextContent(
      `${allocation.reservationId.toUpperCase()} · quantity ${allocation.quantity} · step ${allocation.stepId}`,
    );
  }
}

it("inspects six ownership responsibilities with keyboard focus, full text and no network execution", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<ReservationArchitectureView />);
  const inspector = screen.getByRole("region", {
    name: "Selected reservation responsibility",
  });
  expect(
    screen
      .getByRole("region", { name: "Reservation ownership diagram" })
      .querySelectorAll("button"),
  ).toHaveLength(6);
  for (const [title, evidence] of [
    ["Local observations", "An absent observation means Not read yet"],
    ["Shared inventory", "Each Java run owns separate local state"],
    ["Acceptance boundary", "The unsafe action is also complete"],
    ["Allocation records", "one reservation can consume two units"],
    [
      "Business rejection",
      "Shared inventory and the allocation list stay unchanged",
    ],
    ["Declared invariants", "pass capacity but fail conservation"],
  ] as const) {
    const button = screen.getByRole("button", { name: `Inspect ${title}` });
    button.focus();
    fireEvent.click(button);
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("aria-controls", inspector.id);
    expect(inspector).toHaveTextContent(evidence);
  }
  expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
  const text = screen.getByRole("region", {
    name: "Reservation ownership text equivalent",
  });
  expect(within(text).getAllByRole("listitem")).toHaveLength(6);
  expect(text).toHaveTextContent("inside one indivisible modeled action");
  expect(text).toHaveTextContent("actor's status to rejected");
  expect(
    screen.getByText(/Neither algorithm emulates a SQL isolation level/),
  ).toHaveTextContent("durability, rollback, retries, idempotency");
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  { path: "Both accept from an earlier read", actual: result },
  { path: "Current stock rejects the later attempt", actual: protectedResult },
])(
  "reconciles every authored $path snapshot with the actual Java golden",
  ({ path, actual }) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<ReservationSequenceView />);
    fireEvent.click(screen.getByRole("radio", { name: path }));
    expectState(actual.initialState);
    expect(selected()).toHaveTextContent("Step 1 of 5 · initial");
    expect(
      screen.getByRole("button", { name: "Previous path step" }),
    ).toBeDisabled();
    for (const outcome of actual.outcomes) {
      next();
      expect(selected()).toHaveTextContent(
        `Step ${outcome.sequence + 1} of 5 · ${outcome.stepId}`,
      );
      expectState(outcome.postState);
      if (outcome.action === "ATTEMPT_RESERVE") {
        expect(selected()).toHaveTextContent(
          `${outcome.checkSource} ${outcome.checkedRemaining}`,
        );
      }
      if (outcome.kind === "RESERVATION_REJECTED")
        expect(selected()).toHaveTextContent("INSUFFICIENT_STOCK");
    }
    expect(
      screen.getByRole("button", { name: "Next path step" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reset path" }));
    expectState(actual.initialState);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("shows the serial control's unread actor before its saved-zero rejection rather than the shared-read state", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<ReservationSequenceView />);
  fireEvent.click(
    screen.getByRole("radio", { name: "A serial order hides the flaw" }),
  );
  expect(selected()).toHaveTextContent("Initial state");
  next();
  expect(selected()).toHaveTextContent(
    "A: READ_OBSERVED, quantity 1, observation 1.",
  );
  next();
  expect(selected()).toHaveTextContent("Step 3 of 5 · attempt-a");
  expect(selected()).toHaveTextContent(
    "B: NOT_READ, quantity 1, observation absent.",
  );
  expect(fact(selected(), "Remaining units")).toHaveTextContent(/^0$/);
  expect(fact(selected(), "Allocated units")).toHaveTextContent(/^1$/);
  next();
  expect(selected()).toHaveTextContent(
    "B: READ_OBSERVED, quantity 1, observation 0.",
  );
  next();
  expect(selected()).toHaveTextContent("SNAPSHOT 0");
  expect(selected()).toHaveTextContent(
    "B: REJECTED, quantity 1, observation 0.",
  );
  expect(selected()).toHaveTextContent("other legal interleavings");
  expect(fact(selected(), "Accounted units")).toHaveTextContent(/^1$/);
  expect(fact(selected(), "Units conserved")).toHaveTextContent(/^Preserved$/);
  expect(selected()).not.toHaveTextContent("step attempt-b.");
  expect(fetch).not.toHaveBeenCalled();
});

it("resets position on path changes and keeps five ordered full-text scenes with the selected scene marked", () => {
  render(<ReservationSequenceView />);
  next();
  next();
  fireEvent.click(
    screen.getByRole("radio", {
      name: "Current stock rejects the later attempt",
    }),
  );
  expect(selected()).toHaveTextContent("Step 1 of 5 · initial");
  const details = screen.getByText("Full text sequence", {
    selector: "summary",
  }).parentElement!;
  fireEvent.click(
    screen.getByText("Full text sequence", { selector: "summary" }),
  );
  expect(details).toHaveAttribute("open");
  const full = screen.getByRole("region", {
    name: "Authored reservation sequence",
  });
  const scenes = within(full).getAllByRole("listitem");
  expect(scenes).toHaveLength(5);
  expect(scenes[0]).toHaveAttribute("aria-current", "step");
  expect(scenes[4]).toHaveTextContent(
    "B: REJECTED, quantity 1, observation 1.",
  );
  expect(scenes[4]).toHaveTextContent("Stock and allocation A do not change");
  next();
  expect(scenes[0]).not.toHaveAttribute("aria-current");
  expect(scenes[1]).toHaveAttribute("aria-current", "step");
  fireEvent.click(
    screen.getByRole("radio", { name: "A serial order hides the flaw" }),
  );
  expect(selected()).toHaveTextContent("Step 1 of 5 · initial");
  const serial = within(full).getAllByRole("listitem");
  expect(serial).toHaveLength(5);
  expect(serial[2]).toHaveTextContent(
    "B: NOT_READ, quantity 1, observation absent.",
  );
  expect(serial[4]).toHaveTextContent(
    "B: REJECTED, quantity 1, observation 0.",
  );
});

it("keeps manual keyboard focus on an enabled control at either end of a path", () => {
  render(<ReservationSequenceView />);
  const forward = screen.getByRole("button", { name: "Next path step" });
  const backward = screen.getByRole("button", { name: "Previous path step" });
  forward.focus();
  for (let step = 0; step < 4; step++) fireEvent.click(forward);
  expect(forward).toBeDisabled();
  expect(backward).toHaveFocus();
  for (let step = 0; step < 4; step++) fireEvent.click(backward);
  expect(backward).toBeDisabled();
  expect(forward).toHaveFocus();
  const reset = screen.getByRole("button", { name: "Reset path" });
  next();
  reset.focus();
  fireEvent.click(reset);
  expect(reset).toHaveFocus();
  expect(selected()).toHaveTextContent("Step 1 of 5 · initial");
});
