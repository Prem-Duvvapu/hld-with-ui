import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { DeliveryPlayground } from "./DeliveryPlayground";
import {
  baselineInput,
  baselineResult,
  descriptor,
} from "./deliveryTestFixtures";
vi.mock("../../api/client", () => ({ api: { runDelivery: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
const run = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Run delivery simulation" }),
  );
it("does not run automatically; refuses a blank field, keeps it blank and focuses its error", () => {
  render(<DeliveryPlayground descriptor={descriptor} />);
  expect(api.runDelivery).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Processing time (ms)"), {
    target: { value: "" },
  });
  run();
  expect(api.runDelivery).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Processing time (ms)")).toHaveValue(null);
  expect(screen.getByLabelText("Processing time (ms)")).toHaveFocus();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Check the highlighted fields",
  );
});
it("captures one submitted workload, locks controls while pending and displays the returned Java result", async () => {
  let resolve!: (value: typeof baselineResult) => void;
  vi.mocked(api.runDelivery).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<DeliveryPlayground descriptor={descriptor} />);
  run();
  fireEvent.submit(screen.getByRole("form", { name: "Delivery workload" }));
  expect(api.runDelivery).toHaveBeenCalledTimes(1);
  expect(api.runDelivery).toHaveBeenCalledWith(baselineInput);
  expect(screen.getByLabelText("Processing time (ms)")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Baseline" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Effect before confirmation" },
  });
  await act(async () => resolve(baselineResult));
  expect(
    screen.getByRole("heading", { name: "Final run metrics" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Processing time (ms)")).not.toBeDisabled();
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Effect before confirmation",
  );
});
it("keeps a prior trace and captured inputs on failure, labels edits stale and allows explicit retry", async () => {
  vi.mocked(api.runDelivery)
    .mockResolvedValueOnce(baselineResult)
    .mockRejectedValueOnce(new Error("Server unavailable"))
    .mockResolvedValueOnce(baselineResult);
  render(<DeliveryPlayground descriptor={descriptor} />);
  run();
  await screen.findByRole("heading", { name: "Final run metrics" });
  fireEvent.change(screen.getByLabelText("Processing time (ms)"), {
    target: { value: "51" },
  });
  expect(screen.getByText(/Inputs changed/)).toBeVisible();
  expect(screen.getByText(/Submitted:/)).toHaveTextContent("processing 50 ms");
  run();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Server unavailable",
  );
  expect(
    screen.getByRole("heading", { name: "Final run metrics" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Processing time (ms)")).toHaveValue(51);
  fireEvent.change(screen.getByLabelText("Processing time (ms)"), {
    target: { value: "50" },
  });
  run();
  await act(async () => {});
  expect(api.runDelivery).toHaveBeenCalledTimes(3);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("does not install a response after unmount or leak it into a new playground", async () => {
  let resolve!: (value: typeof baselineResult) => void;
  vi.mocked(api.runDelivery).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const first = render(<DeliveryPlayground descriptor={descriptor} />);
  run();
  first.unmount();
  render(<DeliveryPlayground descriptor={descriptor} />);
  await act(async () => resolve(baselineResult));
  expect(
    screen.queryByRole("heading", { name: "Final run metrics" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Run delivery simulation" }),
  ).toBeEnabled();
});
