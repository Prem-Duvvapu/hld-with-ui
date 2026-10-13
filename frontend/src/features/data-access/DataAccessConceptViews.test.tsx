import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  DataAccessArchitectureView,
  DataAccessSequenceView,
} from "./DataAccessConceptViews";
afterEach(() => vi.unstubAllGlobals());
it("inspects all five responsibilities and preserves a full textual ownership equivalent without execution", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<DataAccessArchitectureView />);
  const inspector = screen.getByRole("region", {
    name: "Selected access responsibility",
  });
  expect(inspector).toHaveTextContent("result limit");
  for (const [title, evidence] of [
    ["Primary identity", "Every insert checks this identity first"],
    ["Ordered access view", "derives a sorted view"],
    ["Scoped business rule", "alpha/k2 and beta/k2 may coexist"],
    ["Per-run records", "Another call starts with separate state"],
  ]) {
    fireEvent.click(screen.getByRole("button", { name: `Inspect ${title}` }));
    expect(inspector).toHaveTextContent(evidence!);
    expect(
      screen.getByRole("button", { name: `Inspect ${title}` }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  expect(
    screen.getByRole("region", { name: "Access ownership text equivalent" }),
  ).toHaveTextContent("A rejection changes nothing");
  expect(fetch).not.toHaveBeenCalled();
});
it("manually steps the normal query with a complete ordered explanation and no timing", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<DataAccessSequenceView />);
  const selected = screen.getByRole("region", {
    name: "Selected authored operation step",
  });
  expect(selected).toHaveTextContent("Step 1 of 5");
  fireEvent.click(screen.getByRole("button", { name: "Next path step" }));
  expect(selected).toHaveTextContent("candidate IDs are b2 and b3");
  fireEvent.click(screen.getByRole("button", { name: "Next path step" }));
  fireEvent.click(screen.getByRole("button", { name: "Next path step" }));
  fireEvent.click(screen.getByRole("button", { name: "Next path step" }));
  expect(selected).toHaveTextContent("record count remains twelve");
  expect(screen.getByRole("button", { name: "Next path step" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Previous path step" }));
  expect(selected).toHaveTextContent("Fetch two matching records");
  fireEvent.click(screen.getByRole("button", { name: "Reset authored path" }));
  expect(selected).toHaveTextContent("Step 1 of 5");
  expect(fetch).not.toHaveBeenCalled();
});
it("resets the cursor when switching accepted and rejected paths and explains their different mutations", () => {
  render(<DataAccessSequenceView />);
  fireEvent.click(screen.getByLabelText("Write · accept a new business key"));
  const full = screen.getByRole("region", {
    name: "Full authored operation path",
  });
  expect(within(full).getAllByRole("listitem")).toHaveLength(5);
  expect(full).toHaveTextContent("secondary entries written 1");
  expect(full).toHaveTextContent("returning b2, b5, b3");
  fireEvent.click(screen.getByRole("button", { name: "Next path step" }));
  fireEvent.click(screen.getByLabelText("Write · reject a scoped conflict"));
  expect(
    screen.getByRole("region", { name: "Selected authored operation step" }),
  ).toHaveTextContent("Step 1 of 5");
  expect(full).toHaveTextContent("DUPLICATE_BUSINESS_KEY, not DUPLICATE_ID");
  expect(full).toHaveTextContent("all zero");
  expect(full).toHaveTextContent("returning b2, b3");
});
