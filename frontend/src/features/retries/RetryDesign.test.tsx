import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api } from "../../api/client";
import {
  result,
  backoffResult,
  deadlineResult,
} from "../../api/retryTestFixtures";
import type { GuidedCheckpoint } from "../../api/types";
import {
  authoredRetryPaths,
  RetryArchitectureView,
  RetrySequenceView,
} from "./RetryDesign";
import { resolveRetryCheckpoint } from "./checkpoints";
vi.mock("../../api/client", () => ({ api: { runRetry: vi.fn() } }));
const scene = () =>
  screen.getByRole("region", { name: "Selected retry path step" });
const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next retry path step" }));
it("checks every authored step against the actual Java golden by semantic identity, state and virtual time", () => {
  const goldens = {
    "late-work": result,
    "backoff-recovery": backoffResult,
    "deadline-before-retry": deadlineResult,
  };
  expect(authoredRetryPaths).toHaveLength(3);
  let checked = 0;
  for (const path of authoredRetryPaths) {
    const run = goldens[path.presetId as keyof typeof goldens];
    for (const step of path.steps) {
      const position = step.target
        ? resolveRetryCheckpoint(
            run.events,
            step.target as GuidedCheckpoint["target"],
          )
        : -1;
      if (step.target) expect(position).toBeGreaterThanOrEqual(0);
      const event = step.target ? run.events[position]! : undefined;
      const state = event?.postState ?? run.initialState;
      const request = state.requests.find((r) => r.id === "a")!;
      expect(event?.timeMs ?? 0).toBe(step.timeMs);
      expect(request.phase).toBe(step.facts.phase);
      expect(request.attemptsSent).toBe(step.facts.attemptsSent);
      expect(request.activeAttemptId).toBe(step.facts.activeAttemptId);
      expect(request.nextRetryAtMs).toBe(step.facts.nextRetryAtMs);
      expect(request.finishedAtMs).toBe(step.facts.finishedAtMs);
      expect(request.failureReason).toBe(step.facts.failureReason);
      expect(state.queue).toEqual(step.facts.queue);
      expect(state.workers).toHaveLength(1);
      expect(state.workers[0]!.attemptId).toBe(step.facts.workerAttemptId);
      expect(state.retryBudgetRemaining).toBe(step.facts.budget);
      expect(state.attempts).toHaveLength(step.facts.attempts.length);
      step.facts.attempts.forEach((a, index) =>
        expect(state.attempts[index]).toMatchObject(a),
      );
      if (step.facts.proposedRetryAtMs !== undefined)
        expect(event?.proposedRetryAtMs).toBe(step.facts.proposedRetryAtMs);
      checked++;
    }
  }
  expect(checked).toBe(16);
});
it("inspects the retry and server ownership boundaries with a complete textual explanation", () => {
  render(<RetryArchitectureView />);
  const policy = screen.getByRole("button", { name: "Inspect Retry policy" });
  fireEvent.click(policy);
  expect(policy).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("region", { name: "Selected retry responsibility" }),
  ).toHaveTextContent("planning reserves no token");
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect FIFO queue and workers" }),
  );
  expect(
    screen.getByRole("region", { name: "Selected retry responsibility" }),
  ).toHaveTextContent("Late completion cannot satisfy a newer attempt");
  expect(
    screen.getByRole("region", { name: "Retry architecture text equivalent" }),
  ).toHaveTextContent("without cancelling accepted work");
  expect(api.runRetry).not.toHaveBeenCalled();
});
it("traces late work past caller failure, preserves endpoint focus and resets manually", () => {
  render(<RetrySequenceView />);
  expect(scene()).toHaveTextContent("No actual attempts yet");
  for (let i = 0; i < 5; i++) next();
  expect(scene()).toHaveTextContent("Maximum attempts reached");
  expect(scene()).toHaveTextContent("Server work: Running");
  const nextButton = screen.getByRole("button", {
    name: "Next retry path step",
  });
  nextButton.focus();
  next();
  expect(scene()).toHaveTextContent("160 ms virtual time");
  expect(scene()).toHaveTextContent("Caller finished100 ms");
  expect(
    screen.getByRole("button", { name: "Previous retry path step" }),
  ).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Reset retry path" }));
  expect(
    within(scene()).getByRole("heading", {
      name: "Before the original arrives",
    }),
  ).toBeVisible();
  expect(api.runRetry).not.toHaveBeenCalled();
});
it("resets when changing paths and distinguishes a blocked proposal from a scheduled retry and actual failure", () => {
  render(<RetrySequenceView />);
  next();
  fireEvent.click(
    screen.getByRole("radio", {
      name: "A retry proposal cannot extend the deadline",
    }),
  );
  expect(scene()).toHaveTextContent("No actual attempts yet");
  next();
  next();
  expect(scene()).toHaveTextContent("Blocked proposal120 ms · not scheduled");
  expect(scene()).toHaveTextContent("Scheduled retryNone scheduled");
  expect(scene()).toHaveTextContent("Caller finishedNot finished");
  expect(scene()).not.toHaveTextContent("Overall deadline reached");
  next();
  expect(scene()).toHaveTextContent("Overall deadline reached");
  expect(scene()).toHaveTextContent("Caller finished100 ms");
  fireEvent.click(
    screen.getByText("Full retry text sequence", { selector: "summary" }),
  );
  const text = screen.getByRole("region", { name: "Authored retry sequence" });
  expect(
    within(text).getByRole("heading", {
      name: "The proposed 120 ms retry is blocked",
    }),
  ).toBeVisible();
  expect(text.querySelector('li[aria-current="step"]')).toHaveTextContent(
    "actual-deadline",
  );
});
it("explains relative backoff arithmetic and a response to the currently waiting attempt", () => {
  render(<RetrySequenceView />);
  fireEvent.click(
    screen.getByRole("radio", {
      name: "Backoff reaches a recovered dependency",
    }),
  );
  next();
  next();
  expect(scene()).toHaveTextContent("40 + 80 = 120 ms");
  next();
  expect(scene()).toHaveTextContent("Worker ownsa-a3");
  next();
  expect(scene()).toHaveTextContent("Caller: Response received");
  expect(scene()).toHaveTextContent("Caller finished140 ms");
  expect(api.runRetry).not.toHaveBeenCalled();
});
