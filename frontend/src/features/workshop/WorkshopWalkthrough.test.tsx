import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import workshop from "../../../../content/case-studies/url-shortener/workshop.json";
import { WorkshopWalkthrough } from "./WorkshopWalkthrough";
const paths = workshop.stages.find(
  (stage) => stage.id === "flows",
)!.walkthroughs!;

it("lets a learner inspect causal ordering, direct steps and bounded navigation", () => {
  render(<WorkshopWalkthrough walkthroughs={paths} />);
  const inspector = screen.getByLabelText("Selected decision");
  expect(inspector).toHaveTextContent("POST: same caller key and fields");
  expect(
    screen.getByRole("button", { name: "Previous decision" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Next decision" }));
  expect(inspector).toHaveTextContent("SQL: claim the caller/key");
  fireEvent.click(screen.getByRole("button", { name: /04.*COMMIT/ }));
  expect(inspector).toHaveTextContent(
    "No partial or pending result may commit",
  );
  fireEvent.click(screen.getByRole("button", { name: "Next decision" }));
  expect(inspector).toHaveTextContent("Only after confirmed commit");
  expect(screen.getByRole("button", { name: "Next decision" })).toBeDisabled();
});

it("keeps independent positions for success, retry and expiry paths", () => {
  render(<WorkshopWalkthrough walkthroughs={paths} />);
  const picker = screen.getByRole("combobox", { name: "Choose a walkthrough" });
  fireEvent.click(screen.getByRole("button", { name: /04.*COMMIT/ }));
  fireEvent.change(picker, { target: { value: "lost-response" } });
  expect(screen.getByRole("status")).toHaveTextContent("Step 1 of 5");
  fireEvent.click(screen.getByRole("button", { name: /05.*replay/ }));
  expect(screen.getByLabelText("Selected decision")).toHaveTextContent(
    "Replay never extends expiry",
  );
  fireEvent.change(picker, { target: { value: "expired" } });
  fireEvent.click(screen.getByRole("button", { name: /03.*now/ }));
  expect(screen.getByLabelText("Selected decision")).toHaveTextContent(
    "At equality the link is expired",
  );
  fireEvent.change(picker, { target: { value: "create" } });
  expect(screen.getByRole("status")).toHaveTextContent("Step 4 of 5");
});

it("offers the complete text equivalent of the current diagram, including internal decisions", () => {
  render(<WorkshopWalkthrough walkthroughs={paths} />);
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "resolve" },
  });
  const transcript = screen
    .getByText("Complete text equivalent: participants and steps")
    .closest("details")!;
  expect(transcript).toHaveTextContent(
    "DestinationReceives a separate browser request",
  );
  for (const step of paths[1]!.steps)
    expect(within(transcript).getByText(step.title)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /03.*Decision/ }));
  expect(screen.getByLabelText("Selected decision")).toHaveTextContent(
    "Internal decision",
  );
  expect(document.querySelectorAll(".walkthrough-node.active")).toHaveLength(1);
});

it("supports a single baseline path without an unnecessary picker or timers", () => {
  const baseline = workshop.stages.find(
    (stage) => stage.id === "baseline",
  )!.walkthroughs!;
  render(<WorkshopWalkthrough walkthroughs={baseline} />);
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.getByText(/Illustrative, no execution/)).toBeVisible();
  expect(
    screen.getByRole("region", { name: /Participant diagram/ }),
  ).toHaveAttribute("tabindex", "0");
  expect(screen.getByRole("status")).toHaveTextContent("Step 1 of 4");
});
