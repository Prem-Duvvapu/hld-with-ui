import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
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
  });
});
