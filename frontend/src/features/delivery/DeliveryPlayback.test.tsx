import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import catalog from "../../../../content/catalog.json";
import type { CatalogEntry } from "../../api/types";
import { ModuleShell } from "../../components/ModuleShell";
import { DeliveryPlayback } from "./DeliveryPlayback";
import { baselineResult } from "./deliveryTestFixtures";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function viewEvent(sequence: number) {
  fireEvent.click(
    screen.getByRole("button", { name: `View event ${sequence}` }),
  );
}
it("shows Java broker/consumer/ledger snapshots and supports forward, backward and reset without any fetch", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<DeliveryPlayback result={baselineResult} />);
  expect(screen.getByLabelText("Trace position")).toHaveValue("-1");
  expect(
    screen.getByRole("region", {
      name: "Committed ledger at the selected position",
    }),
  ).toHaveTextContent("No committed records yet");
  fireEvent.click(screen.getByText(/Inspect the full event trace/));
  viewEvent(2);
  expect(
    screen.getByRole("listitem", { name: "Consumer c1" }),
  ).toHaveTextContent("Current processing attempt: m1-a1");
  viewEvent(3);
  expect(
    screen.getByRole("listitem", { name: "Consumer c1" }),
  ).toHaveTextContent("Current processing attempt: None");
  expect(
    screen.getByRole("region", {
      name: "Committed ledger at the selected position",
    }),
  ).toHaveTextContent("m1-a1-effect");
  viewEvent(5);
  expect(
    screen.getByRole("listitem", { name: "Message m1" }),
  ).toHaveTextContent("Current attempt: None");
  viewEvent(2);
  expect(
    screen.getByRole("region", {
      name: "Committed ledger at the selected position",
    }),
  ).toHaveTextContent("No committed records yet");
  fireEvent.click(
    screen.getByRole("button", { name: "Reset to initial state" }),
  );
  expect(screen.getByLabelText("Trace position")).toHaveValue("-1");
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it("filters only trace rows and retains complete world records and ledger", () => {
  render(<DeliveryPlayback result={baselineResult} />);
  fireEvent.click(screen.getByText(/Inspect the full event trace/));
  viewEvent(3);
  fireEvent.change(screen.getByLabelText("Message filter"), {
    target: { value: "m1" },
  });
  expect(
    within(
      screen.getByRole("table", { name: "Delivery simulation event trace" }),
    ).getAllByRole("row"),
  ).toHaveLength(6);
  expect(
    screen.getByRole("region", {
      name: "Committed ledger at the selected position",
    }),
  ).toHaveTextContent("Committed at 50 ms");
});
it("pauses retained playback in a hidden tab and keeps its cursor", () => {
  vi.useFakeTimers();
  const topic = catalog.find(
    (entry) => entry.id === "queues-delivery",
  )! as CatalogEntry;
  render(
    <MemoryRouter>
      <ModuleShell
        topic={topic}
        tabs={[
          { id: "playground", label: "Playground" },
          { id: "study", label: "Study" },
        ]}
        defaultView="playground"
        panels={{
          playground: <DeliveryPlayback result={baselineResult} />,
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
