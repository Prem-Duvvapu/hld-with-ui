import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import baseline from "../../../../contracts/examples/queue-capacity-baseline-result.json";
import { QueueArchitectureView, QueueSequenceView } from "./QueueConceptViews";

describe("queue ownership and authored job paths", () => {
  it("makes direct start, FIFO waiting and full-queue rejection separate readable boundaries", () => {
    render(<QueueArchitectureView />);
    const diagram = screen.getByRole("region", {
      name: "Shared FIFO admission diagram",
    });
    expect(
      within(diagram).getByRole("button", { name: "Inspect worker capacity" }),
    ).toHaveTextContent("A worker is idle");
    expect(
      within(diagram).getByRole("button", { name: "Inspect waiting capacity" }),
    ).toHaveTextContent("All workers busy; a waiting slot is free");
    expect(
      within(diagram).getByRole("button", { name: "Inspect rejection" }),
    ).toHaveTextContent("the waiting queue is full");
    expect(
      screen.getByRole("region", { name: "Admission flow text equivalent" }),
    ).toHaveTextContent("Dispatch older waiters before handling new arrivals");
    expect(
      screen.getByText(/One process owns the queue and workers/),
    ).toBeVisible();
  });
  it("inspects a decision without moving keyboard focus or requesting a simulation", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      render(<QueueArchitectureView />);
      const waiting = screen.getByRole("button", {
        name: "Inspect waiting capacity",
      });
      waiting.focus();
      fireEvent.click(waiting);
      expect(waiting).toHaveFocus();
      expect(waiting).toHaveAttribute("aria-pressed", "true");
      const explanation = screen.getByRole("region", {
        name: "Selected queue boundary",
      });
      expect(explanation).toHaveTextContent(
        "More waiting slots can reduce rejection while increasing how long accepted jobs wait",
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Inspect rejection" }),
      );
      expect(explanation).toHaveTextContent(
        "no successful service or latency sample",
      );
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it("keeps the authored direct-start times consistent with the Java baseline artifact", () => {
    render(<QueueSequenceView />);
    const job = baseline.outcomes.find((outcome) => outcome.jobId === "job-1")!;
    expect(job.startTimeMs).toBe(0);
    expect(job.terminalTimeMs).toBe(10);
    const path = screen.getByRole("region", { name: "Full authored job path" });
    expect(
      within(path).getByRole("button", {
        name: /Reserve the worker and start/,
      }),
    ).toHaveTextContent(`${job.startTimeMs} ms`);
    expect(
      within(path).getByRole("button", { name: /Observe the completion/ }),
    ).toHaveTextContent(`${job.terminalTimeMs} ms`);
    expect(
      screen.getByText(/selecting a step does not execute a new run/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Previous path step" }),
    ).toBeDisabled();
  });
  it("inspects FIFO waiting forward/backward and retains a chosen path without executing Java", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      render(<QueueSequenceView />);
      fireEvent.click(screen.getByRole("radio", { name: "Job 2 · waits" }));
      const job = baseline.outcomes.find(
        (outcome) => outcome.jobId === "job-2",
      )!;
      expect(job.waitTimeMs).toBe(10);
      expect(job.latencyMs).toBe(20);
      const step = screen.getByRole("region", {
        name: "Selected authored job step",
      });
      const inspect = screen.getByRole("button", {
        name: "Inspect path step 3: The older waiter starts next",
      });
      inspect.focus();
      fireEvent.click(inspect);
      expect(inspect).toHaveFocus();
      expect(step).toHaveTextContent(`Step 3 of 4 · ${job.startTimeMs} ms`);
      expect(step).toHaveTextContent(
        "before new arrivals at the same timestamp",
      );
      fireEvent.click(screen.getByRole("button", { name: "Next path step" }));
      expect(step).toHaveTextContent(`Step 4 of 4 · ${job.terminalTimeMs} ms`);
      expect(
        screen.getByRole("button", { name: "Next path step" }),
      ).toBeDisabled();
      fireEvent.click(
        screen.getByRole("button", { name: "Previous path step" }),
      );
      expect(step).toHaveTextContent("Step 3 of 4");
      fireEvent.click(
        screen.getByRole("radio", { name: "Job 1 · starts immediately" }),
      );
      fireEvent.click(screen.getByRole("radio", { name: "Job 2 · waits" }));
      expect(step).toHaveTextContent("Step 3 of 4");
      fireEvent.click(
        screen.getByRole("button", { name: "Reset authored path" }),
      );
      expect(step).toHaveTextContent("Step 1 of 4");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it("does not give a rejected job a successful wait, service or completion", () => {
    render(<QueueSequenceView />);
    fireEvent.click(screen.getByRole("radio", { name: "Job 3 · rejected" }));
    const job = baseline.outcomes.find((outcome) => outcome.jobId === "job-3")!;
    expect(job.status).toBe("REJECTED");
    expect(job.terminalTimeMs).toBe(0);
    expect("latencyMs" in job).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Next path step" }));
    expect(
      screen.getByRole("region", { name: "Selected authored job step" }),
    ).toHaveTextContent("no service start or completion");
    expect(
      screen.getByText(/supplies no successful wait or latency sample/),
    ).toBeVisible();
  });
});
