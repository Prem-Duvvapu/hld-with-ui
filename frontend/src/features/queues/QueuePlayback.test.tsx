import catalogFixture from "../../../../content/catalog.json";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ModuleShell } from "../../components/ModuleShell";
import type { CatalogEntry } from "../../api/types";
import { QueuePlayback } from "./QueuePlayback";
import { QueueResults } from "./QueueResults";
import {
  baselineInput,
  baselineResult,
  beforeFirstEvent,
} from "./queueTestFixtures";
afterEach(() => vi.useRealTimers());
const view = (sequence: number) =>
  fireEvent.click(
    screen.getByRole("button", { name: `View event ${sequence}` }),
  );
it("reads initial and forward/backward worker and FIFO states directly from the Java fixture", () => {
  render(<QueuePlayback result={baselineResult} input={baselineInput} />);
  expect(screen.getByLabelText("Trace position")).toHaveValue("-1");
  expect(
    screen.getByRole("region", { name: "Worker worker-1" }),
  ).toHaveTextContent("Idle");
  expect(
    screen.getByRole("region", { name: "Shared waiting queue" }),
  ).toHaveTextContent("No waiting jobs");
  fireEvent.click(screen.getByText(/Inspect the full event trace/));
  view(2);
  expect(
    screen.getByRole("region", { name: "Worker worker-1" }),
  ).toHaveTextContent("job-1");
  expect(
    screen.getByRole("region", { name: "Worker worker-1" }),
  ).toHaveTextContent("Scheduled completion: 10 ms");
  expect(
    screen.getByRole("region", { name: "Shared waiting queue" }),
  ).toHaveTextContent("job-2");
  view(7);
  expect(
    screen.getByRole("region", { name: "Worker worker-1" }),
  ).toHaveTextContent("Idle");
  view(2);
  expect(
    screen.getByRole("region", { name: "Shared waiting queue" }),
  ).toHaveTextContent("job-2");
  fireEvent.click(
    screen.getByRole("button", { name: "Reset to initial state" }),
  );
  expect(screen.getByLabelText("Trace position")).toHaveValue("-1");
});
it("shows Java metrics and absent successful samples honestly for an empty limited trace", () => {
  render(
    <QueueResults
      result={beforeFirstEvent}
      input={baselineInput}
      stale={false}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Partial result: Event limit reached",
  );
  expect(
    screen.getByRole("heading", { name: "Partial run metrics" }),
  ).toBeVisible();
  expect(
    within(
      screen.getByRole("region", { name: "Queue run metrics" }),
    ).getAllByText("Unavailable"),
  ).toHaveLength(5);
  expect(screen.getByRole("button", { name: "Play trace" })).toBeDisabled();
  expect(
    screen.getByRole("table", { name: "Queue job outcomes" }),
  ).toHaveTextContent("NOT_ARRIVED");
});
it("pauses a retained playback when its tab is hidden without altering the cursor", () => {
  vi.useFakeTimers();
  const entry = catalogFixture.find(
    (entry) => entry.id === "queues-tail-latency",
  )! as CatalogEntry;
  render(
    <MemoryRouter>
      <ModuleShell
        topic={entry}
        tabs={[
          { id: "playground", label: "Playground" },
          { id: "study", label: "Study" },
        ]}
        defaultView="playground"
        panels={{
          playground: (
            <QueuePlayback result={baselineResult} input={baselineInput} />
          ),
          study: <p>Study</p>,
        }}
      />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Play trace" }));
  act(() => vi.advanceTimersByTime(600));
  expect(screen.getByLabelText("Trace position")).toHaveValue("0");
  fireEvent.click(screen.getByRole("tab", { name: /Study/ }));
  act(() => vi.advanceTimersByTime(6000));
  fireEvent.click(screen.getByRole("tab", { name: /Playground/ }));
  expect(screen.getByLabelText("Trace position")).toHaveValue("0");
  expect(screen.getByRole("button", { name: "Play trace" })).toBeVisible();
});
