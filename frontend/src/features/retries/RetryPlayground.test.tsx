import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { descriptor, input, result } from "../../api/retryTestFixtures";
import { RetryPlayground } from "./RetryPlayground";
vi.mock("../../api/client", () => ({ api: { runRetry: vi.fn() } }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.runRetry).mockResolvedValue(result);
});
const run = () =>
  fireEvent.click(screen.getByRole("button", { name: "Run retry experiment" }));
it("runs only explicitly, captures actual input and keeps the prediction out of the API payload", async () => {
  render(<RetryPlayground descriptor={descriptor} />);
  expect(api.runRetry).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Your retry prediction (optional)"), {
    target: { value: "A timeout leaves the first work running." },
  });
  run();
  expect(
    await screen.findByRole("region", {
      name: "Java retry simulation results",
    }),
  ).toBeVisible();
  expect(api.runRetry).toHaveBeenCalledWith(input);
  expect(screen.getByLabelText("Your retry prediction (optional)")).toHaveValue(
    "A timeout leaves the first work running.",
  );
  const selected = screen.getByRole("region", {
    name: "Selected retry snapshot",
  });
  expect(selected).toHaveTextContent("No actual attempt has been sent.");
  const summary = screen.getByRole("region", {
    name: "Whole retry experiment summary",
  });
  expect(summary).toHaveTextContent("2 attempts / 1 original requests");
  expect(summary).toHaveTextContent("does not prove duplicate orders");
  fireEvent.change(screen.getByLabelText("Attempt timeout (ms)"), {
    target: { value: "100" },
  });
  expect(screen.getByRole("status")).toHaveTextContent("Inputs changed");
  expect(api.runRetry).toHaveBeenCalledTimes(1);
});
it("rejects blank fields before sending and opens advanced controls to focus an invalid field", () => {
  render(<RetryPlayground descriptor={descriptor} />);
  const seed = screen.getByLabelText("Seed");
  fireEvent.change(seed, { target: { value: "" } });
  run();
  expect(api.runRetry).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Check the highlighted fields",
  );
  expect(seed).toHaveValue(null);
  expect(seed).toHaveFocus();
  expect(seed.closest("details")).toHaveAttribute("open");
});
it("locks input and duplicate submits while pending, then keeps the prior result on failure and permits retry", async () => {
  render(<RetryPlayground descriptor={descriptor} />);
  run();
  await screen.findByRole("region", { name: "Java retry simulation results" });
  let reject!: (error: Error) => void;
  vi.mocked(api.runRetry).mockImplementationOnce(
    () =>
      new Promise((_done, fail) => {
        reject = fail;
      }),
  );
  run();
  expect(screen.getByLabelText("Attempt timeout (ms)")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Add request" })).toBeDisabled();
  fireEvent.submit(
    screen.getByRole("form", { name: "Edit the retry workload" }),
  );
  expect(api.runRetry).toHaveBeenCalledTimes(2);
  await act(async () => reject(new Error("Java capacity busy")));
  expect(screen.getByRole("alert")).toHaveTextContent("Java capacity busy");
  expect(
    screen.getByRole("region", { name: "Java retry simulation results" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Attempt timeout (ms)")).toBeEnabled();
  run();
  await screen.findByRole("region", { name: "Java retry simulation results" });
  expect(api.runRetry).toHaveBeenCalledTimes(3);
});
it("loads actual presets and makes policy default changes visible", () => {
  render(<RetryPlayground descriptor={descriptor} />);
  for (const preset of descriptor.presets) {
    fireEvent.click(screen.getByRole("button", { name: preset.title }));
    expect(screen.getByLabelText("Attempt timeout (ms)")).toHaveValue(
      preset.input.attemptTimeoutMs,
    );
    expect(screen.getByLabelText("Backoff policy")).toHaveValue(
      preset.input.backoff,
    );
  }
  fireEvent.change(screen.getByLabelText("Backoff policy"), {
    target: { value: "IMMEDIATE" },
  });
  expect(screen.getByRole("status")).toHaveTextContent(
    "reset the base and cap to zero",
  );
  expect(screen.getByLabelText("Base delay (ms)")).toHaveValue(0);
  expect(screen.getByLabelText("Jitter")).toHaveValue("NONE");
});
it("retains independently keyed request edits when another request is removed", () => {
  render(<RetryPlayground descriptor={descriptor} />);
  fireEvent.click(screen.getByRole("button", { name: "Add request" }));
  fireEvent.change(screen.getByLabelText("Request 2 ID"), {
    target: { value: "second" },
  });
  fireEvent.change(screen.getByLabelText("Request 2 service (ms)"), {
    target: { value: "23" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove request 1" }));
  expect(screen.getByLabelText("Request 1 ID")).toHaveValue("second");
  expect(screen.getByLabelText("Request 1 service (ms)")).toHaveValue(23);
  expect(
    within(
      screen.getByRole("form", { name: "Edit the retry workload" }),
    ).queryByLabelText("Request 2 ID"),
  ).not.toBeInTheDocument();
});
