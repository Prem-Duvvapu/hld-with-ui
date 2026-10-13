import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  DeliveryArchitectureView,
  DeliverySequenceView,
} from "./DeliveryConceptViews";
afterEach(() => vi.unstubAllGlobals());
it("makes all three ownership boundaries inspectable with a textual equivalent and no Java execution", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<DeliveryArchitectureView />);
  const selected = screen.getByRole("region", {
    name: "Selected delivery boundary",
  });
  expect(selected).toHaveTextContent("current token and deadline");
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect consumer processing" }),
  );
  expect(selected).toHaveTextContent(
    "preserves an effect that already committed",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect ledger effects" }),
  );
  expect(selected).toHaveTextContent("does not fence a running ledger write");
  expect(
    screen.getByRole("button", { name: "Inspect ledger effects" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("region", { name: "Delivery ownership text equivalent" }),
  ).toHaveTextContent("one atomic operation");
  expect(fetch).not.toHaveBeenCalled();
});
it("shows baseline authored 0/50/55ms paths, moves backward and resets without execution", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<DeliverySequenceView />);
  const step = screen.getByRole("region", {
    name: "Selected authored message step",
  });
  expect(step).toHaveTextContent("Step 1 of 3 · 0 ms");
  fireEvent.click(screen.getByRole("button", { name: "Next path step" }));
  expect(step).toHaveTextContent("50 ms");
  fireEvent.click(screen.getByRole("button", { name: "Next path step" }));
  expect(step).toHaveTextContent("55 ms");
  expect(screen.getByRole("button", { name: "Next path step" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Previous path step" }));
  expect(step).toHaveTextContent("50 ms");
  fireEvent.click(screen.getByRole("button", { name: "Reset authored path" }));
  expect(step).toHaveTextContent("0 ms");
  expect(fetch).not.toHaveBeenCalled();
});
it("switches distinct authored failure paths and resets only the selected path cursor", () => {
  render(<DeliverySequenceView />);
  fireEvent.click(screen.getByLabelText("Lost ACK · repeated effect"));
  const full = screen.getByRole("region", {
    name: "Full authored message path",
  });
  expect(within(full).getAllByRole("listitem")).toHaveLength(6);
  expect(full).toHaveTextContent("55 ms · Send an ACK that is lost");
  expect(full).toHaveTextContent("100 ms · Expire and redeliver");
  expect(full).toHaveTextContent("150 ms · Commit a second effect");
  fireEvent.click(screen.getByRole("button", { name: "Next path step" }));
  fireEvent.click(screen.getByLabelText("Early ACK · cancelled work"));
  expect(
    screen.getByRole("region", { name: "Selected authored message step" }),
  ).toHaveTextContent("Step 1 of 4 · 0 ms");
  expect(full).toHaveTextContent("5 ms · Accept the early ACK");
  expect(full).toHaveTextContent("25 ms · Crash and cancel processing");
  expect(full).toHaveTextContent("75 ms · Recover without redelivery");
  expect(full).toHaveTextContent("zero effects after full settlement");
});
