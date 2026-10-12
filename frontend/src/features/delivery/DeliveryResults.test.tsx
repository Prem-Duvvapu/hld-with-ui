import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { beforeFirstEvent } from "../../api/deliveryTestFixtures";
import { DeliveryResults } from "./DeliveryResults";
import { baselineInput, baselineResult } from "./deliveryTestFixtures";
it("renders authoritative Java metrics independently of the selected playback prefix", () => {
  render(
    <DeliveryResults
      result={baselineResult}
      input={baselineInput}
      stale={false}
    />,
  );
  const metrics = screen.getByRole("region", { name: "Delivery run metrics" });
  for (const [label, value] of [
    ["Delivery attempts", baselineResult.metrics.deliveryAttempts],
    ["Committed effects", baselineResult.metrics.committedEffects],
    ["Mean ACK latency", baselineResult.metrics.meanAckLatencyMs],
  ] as const)
    expect(within(metrics).getByText(label).parentElement).toHaveTextContent(
      String(value),
    );
  fireEvent.click(screen.getByRole("button", { name: "Next event" }));
  expect(
    within(metrics).getByText("Committed effects").parentElement,
  ).toHaveTextContent("1");
  expect(
    screen.getByRole("region", {
      name: "Committed ledger at the selected position",
    }),
  ).toHaveTextContent("No committed records yet");
});
it("presents a structural empty-prefix fixture with unavailable latency and unsettled loss, not zeros or successful completion", () => {
  // Structural presentation fixture only; the browser suite executes genuine Java limit scenarios.
  render(
    <DeliveryResults
      result={beforeFirstEvent}
      input={baselineInput}
      stale={true}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "Partial run metrics" }),
  ).toBeVisible();
  const metrics = screen.getByRole("region", { name: "Delivery run metrics" });
  expect(
    within(metrics).getByText("Mean ACK latency").parentElement,
  ).toHaveTextContent("Unavailable");
  expect(
    within(metrics).getByText("Acknowledged without effect").parentElement,
  ).toHaveTextContent("Requires full settlement");
  expect(screen.getByText(/Pending work is unresolved/)).toBeVisible();
  expect(screen.getByText(/Inputs changed/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Play trace" })).toBeDisabled();
});
