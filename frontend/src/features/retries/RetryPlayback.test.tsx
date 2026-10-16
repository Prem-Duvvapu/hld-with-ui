import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { result, jitterResult } from "../../api/retryTestFixtures";
import { RetryPlayback } from "./RetryPlayback";
import {
  callerLabels,
  requestPhaseLabels,
  retryTime,
  workLabels,
} from "./retryLabels";
let active = true;
vi.mock("../../components/ModuleShell", () => ({
  usePanelActive: () => active,
}));
afterEach(() => {
  vi.useRealTimers();
  active = true;
});
function seek(position: number) {
  fireEvent.change(
    screen.getByRole("slider", { name: "Retry snapshot position" }),
    { target: { value: String(position) } },
  );
}
it("renders every initial and post-event Java snapshot without replaying behavior in React", () => {
  render(<RetryPlayback result={result} />);
  for (let position = 0; position <= result.events.length; position++) {
    seek(position);
    const state = position
      ? result.events[position - 1]!.postState
      : result.initialState;
    const snapshot = screen.getByRole("region", {
      name: "Selected retry snapshot",
    });
    for (const request of state.requests) {
      const caller = within(snapshot).getByRole("article", {
        name: `Caller ${request.id}`,
      });
      expect(caller).toHaveTextContent(requestPhaseLabels[request.phase]);
      expect(
        within(caller).getByText("Attempts sent").parentElement,
      ).toHaveTextContent(String(request.attemptsSent));
      expect(
        within(caller).getByText("Overall deadline").parentElement,
      ).toHaveTextContent(retryTime(request.overallDeadlineAtMs));
    }
    for (const attempt of state.attempts) {
      const card = within(snapshot).getByRole("article", {
        name: `Retry attempt ${attempt.id}`,
      });
      expect(card).toHaveTextContent(callerLabels[attempt.callerState]);
      expect(card).toHaveTextContent(workLabels[attempt.workState]);
      expect(
        within(card).getByText("Caller finished waiting").parentElement,
      ).toHaveTextContent(retryTime(attempt.callerFinishedAtMs));
      expect(
        within(card).getByText("Work completed").parentElement,
      ).toHaveTextContent(retryTime(attempt.completedAtMs));
    }
    const queue = within(snapshot).getByRole("region", {
      name: "Retry server waiting queue",
    });
    expect(
      within(queue)
        .queryAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual(state.queue);
    if (position)
      expect(
        screen.getByRole("region", { name: "Selected retry event" }),
      ).toHaveTextContent(result.events[position - 1]!.explanation);
  }
});
it("shows a timed-out caller with running server work and a newer attempt without leaking final metrics", () => {
  render(<RetryPlayback result={result} />);
  const position =
    result.events.findIndex(
      (e) => e.kind === "WORK_COMPLETED" && e.attemptId === "a-a1",
    ) + 1;
  seek(position);
  expect(
    screen.getByRole("article", { name: "Retry attempt a-a1" }),
  ).toHaveTextContent("Timed out");
  expect(
    screen.getByRole("article", { name: "Retry attempt a-a2" }),
  ).toHaveTextContent("Waiting");
  expect(screen.getByRole("article", { name: "Caller a" })).toHaveTextContent(
    "Waiting for its active attempt",
  );
  expect(
    screen.queryByRole("region", { name: "Whole retry experiment summary" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/Several causal steps can share one virtual timestamp/),
  ).toBeVisible();
});
it("filters trace rows without filtering the authoritative snapshot", () => {
  render(<RetryPlayback result={jitterResult} />);
  fireEvent.click(
    screen.getByText(/Inspect the full retry trace/, { selector: "summary" }),
  );
  fireEvent.change(screen.getByLabelText("Retry request filter"), {
    target: { value: "b" },
  });
  expect(screen.getByRole("article", { name: "Caller a" })).toBeVisible();
  expect(screen.getByRole("article", { name: "Caller b" })).toBeVisible();
  expect(
    screen.getAllByRole("button", { name: /^View retry event/ }),
  ).toHaveLength(jitterResult.events.filter((e) => e.requestId === "b").length);
});
it("plays explicit snapshot steps, pauses when hidden and stays paused after the panel returns", () => {
  vi.useFakeTimers();
  const view = render(<RetryPlayback result={result} />);
  fireEvent.click(screen.getByRole("button", { name: "Play retry trace" }));
  act(() => {
    vi.advanceTimersByTime(600);
  });
  expect(screen.getByRole("slider")).toHaveValue("1");
  active = false;
  view.rerender(<RetryPlayback result={result} />);
  act(() => {
    vi.advanceTimersByTime(3000);
  });
  expect(screen.getByRole("slider")).toHaveValue("1");
  active = true;
  view.rerender(<RetryPlayback result={result} />);
  expect(
    screen.getByRole("button", { name: "Play retry trace" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Next retry event" }));
  expect(screen.getByRole("slider")).toHaveValue("2");
  fireEvent.click(screen.getByRole("button", { name: "Reset retry snapshot" }));
  expect(screen.getByRole("slider")).toHaveValue("0");
});

it("highlights only the actual caller and attempt named by the selected Java event", () => {
  render(<RetryPlayback result={result} />);
  expect(screen.getByRole("article", { name: "Caller a" })).not.toHaveAttribute(
    "data-selected",
  );
  const position =
    result.events.findIndex(
      (event) => event.kind === "WORK_COMPLETED" && event.attemptId === "a-a1",
    ) + 1;
  seek(position);
  expect(screen.getByRole("article", { name: "Caller a" })).toHaveAttribute(
    "data-selected",
    "true",
  );
  expect(
    screen.getByRole("article", { name: "Retry attempt a-a1" }),
  ).toHaveAttribute("data-selected", "true");
  expect(
    screen.getByRole("article", { name: "Retry attempt a-a2" }),
  ).not.toHaveAttribute("data-selected");
  const terminal =
    result.events.findIndex((event) => event.kind === "REQUEST_FAILED") + 1;
  seek(terminal);
  expect(screen.getByRole("article", { name: "Caller a" })).toHaveAttribute(
    "data-selected",
    "true",
  );
  expect(
    screen.getByRole("article", { name: "Retry attempt a-a1" }),
  ).not.toHaveAttribute("data-selected");
  expect(
    screen.getByRole("article", { name: "Retry attempt a-a2" }),
  ).not.toHaveAttribute("data-selected");
});
