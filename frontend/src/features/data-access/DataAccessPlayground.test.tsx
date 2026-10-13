import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import type { DataAccessResult } from "../../api/types";
import { DataAccessPlayground } from "./DataAccessPlayground";
import { descriptor, input, result } from "./dataAccessTestFixtures";

vi.mock("../../api/client", () => ({ api: { runDataAccess: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
const run = () =>
  fireEvent.click(screen.getByRole("button", { name: "Run access analysis" }));

it("requires an explicit run and preserves a blank invalid field without a request", () => {
  render(<DataAccessPlayground descriptor={descriptor} />);
  expect(api.runDataAccess).not.toHaveBeenCalled();
  expect(
    screen.getByRole("region", { name: "No access analysis yet" }),
  ).toBeVisible();
  fireEvent.change(screen.getByLabelText("Range start"), {
    target: { value: "" },
  });
  run();
  expect(api.runDataAccess).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Range start")).toHaveValue(null);
  expect(screen.getByLabelText("Range start")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Check the highlighted fields",
  );
});

it("captures one pending request, locks presets and inputs, and keeps the prediction editable", async () => {
  let resolve!: (value: DataAccessResult) => void;
  vi.mocked(api.runDataAccess).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<DataAccessPlayground descriptor={descriptor} />);
  run();
  expect(api.runDataAccess).toHaveBeenCalledTimes(1);
  expect(api.runDataAccess).toHaveBeenCalledWith(input);
  expect(screen.getByLabelText("Range start")).toBeDisabled();
  const preset = screen.getByRole("button", { name: "Created order first" });
  expect(preset).toBeDisabled();
  fireEvent.click(preset);
  fireEvent.change(screen.getByLabelText("Range start"), {
    target: { value: "99" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Running in Java…" }));
  expect(api.runDataAccess).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Range start")).toHaveValue(20);
  expect(screen.getByLabelText("Secondary index order")).toHaveValue(
    "TENANT_CREATED",
  );
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Two entries, then two records." },
  });
  await act(async () => resolve(result));
  expect(
    screen.getByRole("region", { name: "Java access analysis results" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Range start")).toBeEnabled();
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Two entries, then two records.",
  );
});

it("serializes meaningful edits without running on preset selection or losing the prediction", async () => {
  vi.mocked(api.runDataAccess).mockRejectedValue(
    new Error("Unavailable for this attempt"),
  );
  render(<DataAccessPlayground descriptor={descriptor} />);
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "A table scan will inspect every record." },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Remove the secondary index" }),
  );
  fireEvent.click(
    screen.getByLabelText("Require a unique business key within each tenant"),
  );
  fireEvent.change(screen.getByLabelText("Range end"), {
    target: { value: "40" },
  });
  fireEvent.change(screen.getByLabelText("Result limit"), {
    target: { value: "1" },
  });
  expect(api.runDataAccess).not.toHaveBeenCalled();
  run();
  expect(api.runDataAccess).toHaveBeenCalledWith({
    ...input,
    indexOrder: "NONE",
    enforceBusinessKey: false,
    operations: [
      {
        id: "q1",
        kind: "TENANT_RANGE",
        tenant: "beta",
        fromCreatedOrder: 20,
        toCreatedOrder: 40,
        limit: 1,
      },
    ],
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unavailable for this attempt",
  );
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "A table scan will inspect every record.",
  );
});

it("preserves the previous submitted evidence on failure and labels changed inputs until explicit retry", async () => {
  vi.mocked(api.runDataAccess)
    .mockResolvedValueOnce(result)
    .mockRejectedValueOnce(new Error("Java unavailable"))
    .mockResolvedValueOnce(result);
  render(<DataAccessPlayground descriptor={descriptor} />);
  run();
  await screen.findByRole("region", { name: "Java access analysis results" });
  fireEvent.change(screen.getByLabelText("Result limit"), {
    target: { value: "1" },
  });
  expect(screen.getByText(/Inputs changed\. These results/)).toBeVisible();
  run();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Java unavailable",
  );
  expect(
    screen.getByRole("heading", {
      name: "Scan tenant → created order entries",
    }),
  ).toBeVisible();
  expect(screen.getByLabelText("Result limit")).toHaveValue(1);
  expect(screen.getByText(/Inputs changed\. These results/)).toBeVisible();
  fireEvent.change(screen.getByLabelText("Result limit"), {
    target: { value: "20" },
  });
  run();
  await act(async () => {});
  expect(api.runDataAccess).toHaveBeenCalledTimes(3);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(
    screen.getByText(/Analysis complete\. These results match/),
  ).toBeVisible();
});

it("adds a different operation variant without inherited range fields and removes it explicitly", async () => {
  vi.mocked(api.runDataAccess).mockRejectedValue(new Error("Try later"));
  render(<DataAccessPlayground descriptor={descriptor} />);
  fireEvent.click(screen.getByRole("button", { name: "Add operation" }));
  const second = screen.getByRole("group", { name: "Operation 2" });
  fireEvent.change(within(second).getByLabelText("Operation"), {
    target: { value: "LOOKUP_ID" },
  });
  fireEvent.change(within(second).getByLabelText("Record ID"), {
    target: { value: "g2" },
  });
  run();
  expect(api.runDataAccess).toHaveBeenCalledWith({
    ...input,
    operations: [
      ...input.operations,
      { id: "operation-1", kind: "LOOKUP_ID", rowId: "g2" },
    ],
  });
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Remove operation 2" }));
  expect(
    screen.queryByRole("group", { name: "Operation 2" }),
  ).not.toBeInTheDocument();
  run();
  expect(api.runDataAccess).toHaveBeenLastCalledWith(input);
  await screen.findByRole("alert");
});

it("submits an empty initial dataset and renders a genuine zero-result response", async () => {
  const empty: DataAccessResult = {
    ...result,
    input: { ...input, rows: [] },
    finalRows: [],
    outcomes: [
      {
        ...result.outcomes[0]!,
        candidateIds: [],
        matchedIds: [],
        returnedIds: [],
        recordCountBefore: 0,
        recordCountAfter: 0,
        explanation: "The empty index matched no records.",
        work: {
          ...result.outcomes[0]!.work,
          indexEntriesExamined: 0,
          baseRowsExamined: 0,
          matchedRows: 0,
          returnedRows: 0,
        },
      },
    ],
    totals: {
      ...result.totals,
      indexEntriesExamined: 0,
      baseRowsExamined: 0,
      matchedRows: 0,
      returnedRows: 0,
    },
  };
  vi.mocked(api.runDataAccess).mockResolvedValue(empty);
  render(<DataAccessPlayground descriptor={descriptor} />);
  fireEvent.click(screen.getByText("Edit the initial records"));
  fireEvent.change(screen.getByLabelText("Initial records (JSON)"), {
    target: { value: "[]" },
  });
  run();
  expect(api.runDataAccess).toHaveBeenCalledWith({ ...input, rows: [] });
  expect(
    await screen.findByText("The query returned no records."),
  ).toBeVisible();
  expect(screen.getByText("No matching records.")).toBeVisible();
  expect(screen.getByText(/0 initial records/)).toHaveTextContent(
    "0 final records",
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("does not install a completed response after its playground was unmounted", async () => {
  let resolve!: (value: DataAccessResult) => void;
  vi.mocked(api.runDataAccess).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const first = render(<DataAccessPlayground descriptor={descriptor} />);
  run();
  first.unmount();
  render(<DataAccessPlayground descriptor={descriptor} />);
  await act(async () => resolve(result));
  expect(
    screen.queryByRole("region", { name: "Java access analysis results" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Run access analysis" }),
  ).toBeEnabled();
});
