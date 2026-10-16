import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api } from "../../api/client";
import {
  AtomicityArchitectureView,
  AtomicitySequenceView,
} from "./AtomicityConceptViews";
vi.mock("../../api/client", () => ({ api: { runAtomicity: vi.fn() } }));
const scene = () =>
  screen.getByRole("region", { name: "Selected atomicity path step" });
const next = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Next atomicity path step" }),
  );
it("inspects private/published ownership and the coarse revision decision with a complete text equivalent", () => {
  render(<AtomicityArchitectureView />);
  const publication = screen.getByRole("button", {
    name: "Inspect One publication boundary",
  });
  fireEvent.click(publication);
  expect(publication).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("region", { name: "Selected atomicity responsibility" }),
  ).toHaveTextContent("a conflict can occur even with enough stock left");
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect Abort and effect ownership" }),
  );
  expect(
    screen.getByRole("region", { name: "Selected atomicity responsibility" }),
  ).toHaveTextContent(
    "does not undo another transaction's committed allocation",
  );
  expect(
    screen.getByRole("region", { name: "Atomicity ownership text equivalent" }),
  ).toHaveTextContent(
    "Separate published writes remain visible after their abort",
  );
  expect(api.runAtomicity).not.toHaveBeenCalled();
});
it("manually reveals the split abort and keeps two different violated checks explicit", () => {
  render(<AtomicitySequenceView />);
  expect(
    within(scene()).getByRole("heading", {
      name: "One unit, no operation yet",
    }),
  ).toBeVisible();
  next();
  next();
  expect(
    within(scene()).getAllByText("Violated", { exact: true }),
  ).toHaveLength(1);
  const nextButton = screen.getByRole("button", {
    name: "Next atomicity path step",
  });
  nextButton.focus();
  next();
  expect(
    within(scene()).getAllByText("Violated", { exact: true }),
  ).toHaveLength(2);
  expect(scene()).toHaveTextContent("USER_ABORT");
  expect(
    screen.getByRole("button", { name: "Previous atomicity path step" }),
  ).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Reset atomicity path" }));
  expect(
    within(scene()).getByRole("heading", {
      name: "One unit, no operation yet",
    }),
  ).toBeVisible();
  expect(api.runAtomicity).not.toHaveBeenCalled();
});
it("resets on path change, distinguishes private zero from absent work, and exposes every authored state in text", () => {
  render(<AtomicitySequenceView />);
  next();
  fireEvent.click(
    screen.getByRole("radio", {
      name: "Publish both prepared pieces together",
    }),
  );
  expect(scene()).toHaveTextContent("initial");
  next();
  next();
  const proposal = within(scene())
    .getByText("Private remaining proposal")
    .closest("div")!;
  expect(proposal).toHaveTextContent("0");
  expect(proposal).not.toHaveTextContent("No private workspace");
  next();
  next();
  expect(
    within(scene()).getByText("Private remaining proposal").closest("div"),
  ).toHaveTextContent("No private workspace");
  expect(scene()).toHaveTextContent("COMMITTED");
  fireEvent.click(
    screen.getByText("Full atomicity text sequence", { selector: "summary" }),
  );
  const text = screen.getByRole("region", {
    name: "Authored atomicity sequence",
  });
  expect(
    within(text).getByRole("heading", { name: "A prepares zero privately" }),
  ).toBeVisible();
  expect(
    within(text).getByRole("heading", {
      name: "One boundary publishes both pieces",
    }),
  ).toBeVisible();
  expect(text.querySelector('li[aria-current="step"]')).toHaveTextContent(
    "commit-a",
  );
});
it("shows the losing transaction's discarded workspace without erasing the winner's published unit", () => {
  render(<AtomicitySequenceView />);
  fireEvent.click(
    screen.getByRole("radio", {
      name: "Discard a conflicting private proposal",
    }),
  );
  for (let i = 0; i < 8; i++) next();
  expect(scene()).toHaveTextContent("REVISION_CONFLICT");
  expect(scene()).toHaveTextContent("Published remaining units2");
  expect(scene()).toHaveTextContent("Published allocated units1");
  expect(scene()).toHaveTextContent("Transaction a · COMMITTED");
  expect(scene()).toHaveTextContent("Transaction b · ABORTED");
  expect(
    within(scene()).queryByText("Violated", { exact: true }),
  ).not.toBeInTheDocument();
  expect(
    within(scene()).getAllByText("No private workspace", { exact: true }),
  ).toHaveLength(2);
  expect(
    screen.getByRole("region", { name: "Authored atomicity path explanation" }),
  ).toHaveTextContent("despite two units remaining");
});
