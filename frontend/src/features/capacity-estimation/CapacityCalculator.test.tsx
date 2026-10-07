import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiClientError } from "../../api/client";
import type {
  CapacityEstimateResult,
  CapacityEstimatorDescriptor,
} from "../../api/types";
import { CapacityCalculator } from "./CapacityCalculator";

const input = {
  schemaVersion: "1.0" as const,
  dailyActiveUsers: 1_000_000,
  requestsPerUserPerDay: 10,
  peakFactor: 5,
  readPercentage: 90,
  recordSizeKb: 1,
  responseSizeKb: 2,
  retentionDays: 365,
  replicationFactor: 3,
  meanLatencyMs: 200,
  headroomPercentage: 30,
};
const descriptor: CapacityEstimatorDescriptor = {
  id: "capacity-estimation",
  title: "Capacity Estimation",
  kind: "estimator",
  schemaVersion: "1.0",
  description: "Estimate",
  defaultInput: input,
  presets: [
    {
      id: "baseline",
      title: "Interview baseline",
      question: "What changes?",
      input,
    },
  ],
  limits: {},
  assumptions: [],
};
const result: CapacityEstimateResult = {
  schemaVersion: "1.0",
  estimatorId: "capacity-estimation",
  status: "estimated",
  metrics: {
    dailyRequests: 10_000_000,
    averageRequestsPerSecond: 115.7407,
    peakRequestsPerSecond: 578.7037,
    peakReadsPerSecond: 520.8333,
    peakWritesPerSecond: 57.8704,
    dailyWrites: 1_000_000,
    rawStorageGigabytes: 365,
    replicatedStorageGigabytes: 1095,
    dailyResponseGigabytes: 20,
    peakResponseMegabitsPerSecond: 9.2593,
    meanConcurrentRequests: 115.7407,
    peakRequestsWithHeadroom: 752.3148,
  },
  steps: [
    {
      id: "average",
      label: "Average request rate",
      formula: "daily requests ÷ 86,400",
      value: 115.7407,
      unit: "requests/s",
      meaning: "Daily average.",
    },
  ],
  sensitivity: [
    {
      id: "base",
      label: "Base",
      trafficMultiplier: 1,
      peakRequestsPerSecond: 578.7037,
      peakResponseMegabitsPerSecond: 9.2593,
      meanConcurrentRequests: 115.7407,
    },
  ],
  assumptions: ["Decimal units."],
  warnings: ["Not a benchmark."],
};

afterEach(() => vi.restoreAllMocks());

describe("CapacityCalculator", () => {
  it("sends changed assumptions to Java and explains the returned result", async () => {
    const calculate = vi
      .spyOn(api, "calculateCapacity")
      .mockResolvedValue(result);
    render(<CapacityCalculator descriptor={descriptor} />);
    fireEvent.change(screen.getByLabelText(/Peak factor/), {
      target: { value: "8" },
    });
    const submit = screen.getByRole("button", { name: /Calculate estimate/ });
    fireEvent.submit(submit.closest("form")!);
    await waitFor(() =>
      expect(calculate).toHaveBeenCalledWith(
        expect.objectContaining({ peakFactor: 8 }),
      ),
    );
    expect(await screen.findByText("1,095")).toBeInTheDocument();
    expect(screen.getByText("daily requests ÷ 86,400")).toBeInTheDocument();
    expect(screen.getByText("Estimate · not a benchmark")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Peak factor/), {
      target: { value: "9" },
    });
    expect(
      screen.getByText(/These results still use/).closest('[role="status"]'),
    ).toHaveTextContent("Assumptions changed");
    expect(screen.getByText("→ × 8")).toBeInTheDocument();

    calculate.mockRejectedValueOnce(
      new ApiClientError("Check the highlighted fields.", 400, {
        peakFactor: "must be within the supported range",
      }),
    );
    fireEvent.submit(submit.closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check the highlighted fields",
    );
    expect(screen.getByLabelText("Peak factor")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Peak factor")).toHaveAccessibleDescription(
      /must be within the supported range/,
    );
  });
  it("disables presets while a calculation is pending so an older response cannot replace a newer preset", async () => {
    let respond: (value: CapacityEstimateResult) => void = () => undefined;
    vi.spyOn(api, "calculateCapacity").mockReturnValue(
      new Promise((resolve) => {
        respond = resolve;
      }),
    );
    render(<CapacityCalculator descriptor={descriptor} />);
    const submit = screen.getByRole("button", { name: /Calculate estimate/ });
    fireEvent.submit(submit.closest("form")!);

    const preset = screen.getByRole("button", { name: "Interview baseline" });
    await waitFor(() => expect(preset).toBeDisabled());
    expect(screen.getByLabelText("Peak factor")).toBeDisabled();
    expect(
      screen.getByRole("heading", { name: "Calculating your estimate…" }),
    ).toBeVisible();
    respond(result);
    await waitFor(() => expect(preset).toBeEnabled());
  });
  it.each(["Read share", "Planning headroom"])(
    "preserves an empty %s instead of converting it to a valid zero",
    async (label) => {
      const calculate = vi
        .spyOn(api, "calculateCapacity")
        .mockResolvedValue(result);
      render(<CapacityCalculator descriptor={descriptor} />);
      const control = screen.getByLabelText(label);
      fireEvent.change(control, { target: { value: "" } });
      expect(control).toHaveValue(null);
      const form = screen
        .getByRole("button", { name: /Calculate estimate/ })
        .closest("form")!;
      fireEvent.submit(form);
      expect(calculate).not.toHaveBeenCalled();
      expect(control).toHaveAttribute("aria-invalid", "true");
      expect(control).toHaveAccessibleDescription(/Enter a number/);
      expect(control).toHaveFocus();
      fireEvent.change(control, { target: { value: "0" } });
      expect(control).not.toHaveAttribute("aria-invalid");
      fireEvent.submit(form);
      await waitFor(() => expect(calculate).toHaveBeenCalledOnce());
      expect(calculate.mock.calls[0]![0]).toEqual({
        ...input,
        [label === "Read share" ? "readPercentage" : "headroomPercentage"]: 0,
      });
    },
  );

  it.each([
    ["Daily active users", "1.5", "Enter a whole number."],
    ["Read share", "101", "Enter a value from 0 to 100."],
    ["Peak factor", "0", "Enter a value from 1 to 1,000."],
  ])("rejects invalid %s before contacting Java", (label, value, message) => {
    const calculate = vi.spyOn(api, "calculateCapacity");
    render(<CapacityCalculator descriptor={descriptor} />);
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.submit(
      screen
        .getByRole("button", { name: /Calculate estimate/ })
        .closest("form")!,
    );
    expect(calculate).not.toHaveBeenCalled();
    expect(screen.getByLabelText(label)).toHaveAccessibleDescription(
      new RegExp(message.replaceAll(".", "\\.")),
    );
  });

  it("accepts server-supported decimal precision and keeps the previous result tied to its submission", async () => {
    const calculate = vi
      .spyOn(api, "calculateCapacity")
      .mockResolvedValue(result);
    render(<CapacityCalculator descriptor={descriptor} />);
    const submit = screen.getByRole("button", { name: /Calculate estimate/ });
    fireEvent.change(screen.getByLabelText("Mean latency"), {
      target: { value: "200.15" },
    });
    fireEvent.submit(submit.closest("form")!);
    await screen.findByText("1,095");
    expect(calculate).toHaveBeenCalledWith({ ...input, meanLatencyMs: 200.15 });
    fireEvent.change(screen.getByLabelText("Peak factor"), {
      target: { value: "" },
    });
    expect(screen.getByText(/These results still use/)).toBeVisible();
    expect(screen.getByText("→ × 5")).toBeVisible();
    fireEvent.submit(submit.closest("form")!);
    expect(calculate).toHaveBeenCalledOnce();
    expect(screen.getByText("1,095")).toBeVisible();
  });
});
