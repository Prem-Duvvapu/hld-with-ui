import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueuePlayground } from "./QueuePlayground";
import { baselineInput, baselineResult, descriptor } from "./queueTestFixtures";
afterEach(() => vi.unstubAllGlobals());
function mockFetch(body: unknown = baselineResult, ok = true) {
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok, status: ok ? 200 : 503, json: async () => body });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
function run() {
  fireEvent.click(screen.getByRole("button", { name: "Run queue simulation" }));
}
it("does not run on mount, sends captured input on explicit run and marks edited results stale", async () => {
  const fetch = mockFetch();
  render(<QueuePlayground descriptor={descriptor} />);
  expect(fetch).not.toHaveBeenCalled();
  run();
  expect(
    await screen.findByRole("table", { name: "Queue job outcomes" }),
  ).toBeVisible();
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(baselineInput);
  fireEvent.change(screen.getByLabelText("Workers", { exact: true }), {
    target: { value: "2" },
  });
  expect(screen.getByRole("status")).toHaveTextContent("Inputs changed");
  expect(
    screen.getByRole("table", { name: "Queue job outcomes" }),
  ).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("refuses blank values and duplicate IDs before sending anything", () => {
  const fetch = mockFetch();
  render(<QueuePlayground descriptor={descriptor} />);
  fireEvent.change(screen.getByLabelText("Waiting slots", { exact: true }), {
    target: { value: "" },
  });
  fireEvent.change(screen.getByLabelText("Job 2 ID", { exact: true }), {
    target: { value: "job-1" },
  });
  run();
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Check the highlighted fields",
  );
  expect(screen.getByLabelText("Waiting slots", { exact: true })).toHaveValue(
    null,
  );
  expect(
    screen.getByLabelText("Waiting slots", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByText("Each job needs a unique ID.")).toBeVisible();
});
it("locks the workload during a pending run and keeps prediction separate from transmitted input", async () => {
  let resolve!: (response: unknown) => void;
  const fetch = vi.fn().mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  render(<QueuePlayground descriptor={descriptor} />);
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Two jobs will be rejected." },
  });
  run();
  expect(screen.getByLabelText("Workers", { exact: true })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Add job" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "More workers" })).toBeDisabled();
  await act(async () =>
    resolve({ ok: true, status: 200, json: async () => baselineResult }),
  );
  expect(screen.getByLabelText("Workers", { exact: true })).toBeEnabled();
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(baselineInput);
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Two jobs will be rejected.",
  );
});
it("keeps workload and prior results after an HTTP failure and recovers only after explicit retry", async () => {
  const fetch = mockFetch();
  render(<QueuePlayground descriptor={descriptor} />);
  run();
  await screen.findByRole("table", { name: "Queue job outcomes" });
  fetch.mockResolvedValueOnce({
    ok: false,
    status: 503,
    json: async () => ({ message: "The simulator is busy. Try again." }),
  });
  run();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The simulator is busy",
  );
  expect(
    screen.getByRole("table", { name: "Queue job outcomes" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Waiting slots", { exact: true })).toHaveValue(
    1,
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  run();
  await screen.findByRole("button", { name: "Run queue simulation" });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(3);
});
it("rejects an unknown transition without manufacturing an outcomes table", async () => {
  mockFetch({
    ...baselineResult,
    events: [{ ...baselineResult.events[0], kind: "job.future" }],
  });
  render(<QueuePlayground descriptor={descriptor} />);
  run();
  expect(await screen.findByRole("alert")).toHaveTextContent("incompatible");
  expect(
    screen.queryByRole("table", { name: "Queue job outcomes" }),
  ).not.toBeInTheDocument();
});
it("adding and removing rows keeps IDs unique, supports focus and changes the explicit request", async () => {
  const fetch = mockFetch();
  render(<QueuePlayground descriptor={descriptor} />);
  fireEvent.click(screen.getByRole("button", { name: "Add job" }));
  expect(screen.getByLabelText("Job 5 ID", { exact: true })).toHaveValue(
    "job-5",
  );
  expect(screen.getByLabelText("Job 5 ID", { exact: true })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Remove job 2" }));
  expect(screen.getByRole("button", { name: "Add job" })).toHaveFocus();
  run();
  await screen.findByRole("alert");
  expect(
    JSON.parse(fetch.mock.calls[0]![1].body).jobs.map(
      (job: { id: string }) => job.id,
    ),
  ).toEqual(["job-1", "job-3", "job-4", "job-5"]);
});
it("removing a job at the maximum row count restores focus to the enabled Add control", () => {
  const maximum = {
    ...descriptor,
    presets: [
      {
        ...descriptor.presets[0]!,
        input: {
          ...baselineInput,
          jobs: Array.from({ length: 100 }, (_, index) => ({
            id: `job-${index + 1}`,
            arrivalTimeMs: 0,
            serviceTimeMs: 10,
          })),
        },
      },
    ],
  };
  render(<QueuePlayground descriptor={maximum} />);
  expect(screen.getByRole("button", { name: "Add job" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Remove job 100" }));
  expect(screen.getByRole("button", { name: "Add job" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Add job" })).toHaveFocus();
});
