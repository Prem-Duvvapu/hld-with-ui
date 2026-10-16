import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import type { AtomicityResult, AtomicityState } from "../../api/types";
import { AtomicityPlayground } from "./AtomicityPlayground";
import {
  conflictInput,
  conflictResult,
  descriptor,
  input,
  protectedInput,
  protectedResult,
  result,
} from "./atomicityTestFixtures";

vi.mock("../../api/client", () => ({ api: { runAtomicity: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
const controls = () =>
  screen.getByRole("region", { name: "Edit the atomicity schedule" });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const run = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Run atomicity experiment" }),
  );
const snapshot = () =>
  screen.getByRole("region", { name: "Selected atomicity snapshot" });
const published = () =>
  within(snapshot()).getByRole("region", {
    name: "Published state at this step",
  });
const fact = (scope: HTMLElement, label: string) =>
  within(scope)
    .getByText(label, { exact: true })
    .parentElement!.querySelector("dd")!;
function expectPublished(state: AtomicityState) {
  expect(fact(published(), "Remaining units")).toHaveTextContent(
    new RegExp(`^${state.remainingUnits}$`),
  );
  expect(fact(published(), "Allocated units")).toHaveTextContent(
    new RegExp(`^${state.allocatedUnits}$`),
  );
  expect(fact(published(), "Published revision")).toHaveTextContent(
    new RegExp(`^${state.revision}$`),
  );
  expect(fact(published(), "Accounted units")).toHaveTextContent(
    new RegExp(`^${state.invariants.accountedUnits}$`),
  );
  for (const [label, flag] of [
    ["Remaining stock is nonnegative", state.invariants.remainingNonnegative],
    [
      "Allocated units fit initial capacity",
      state.invariants.allocatedWithinCapacity,
    ],
    [
      "Remaining + allocated equals initial stock",
      state.invariants.unitsConserved,
    ],
    [
      "Aborted transactions have no published effects",
      state.invariants.abortedEffectsAbsent,
    ],
  ] as const)
    expect(fact(published(), label)).toHaveTextContent(
      flag ? /^Preserved$/ : /^Violated$/,
    );
}

it("selects the named baseline with no automatic POST and preserves invalid numeric blanks", () => {
  render(
    <AtomicityPlayground
      descriptor={{ ...descriptor, presets: [...descriptor.presets].reverse() }}
    />,
  );
  expect(api.runAtomicity).not.toHaveBeenCalled();
  expect(
    screen.getByRole("region", { name: "No atomicity analysis yet" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Abort between separate writes" }),
  ).toHaveAttribute("aria-pressed", "true");
  change("Initial stock (units)", "");
  run();
  expect(api.runAtomicity).not.toHaveBeenCalled();
  expect(
    within(controls()).getByLabelText("Initial stock (units)"),
  ).toHaveValue("");
  expect(screen.getByLabelText("Initial stock (units)")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Check the highlighted fields",
  );
});

it("captures one pending input, locks conflicts and presets, and leaves prediction editable", async () => {
  let resolve!: (value: AtomicityResult) => void;
  vi.mocked(api.runAtomicity).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<AtomicityPlayground descriptor={descriptor} />);
  run();
  expect(api.runAtomicity).toHaveBeenCalledExactlyOnceWith(input);
  for (const label of [
    "Initial stock (units)",
    "Atomicity mode",
    "Transaction 1 ID",
    "Step 1 transaction ID",
    "Step 1 action",
  ])
    expect(screen.getByLabelText(label)).toBeDisabled();
  const preset = screen.getByRole("button", {
    name: "Discard unpublished stock work",
  });
  expect(preset).toBeDisabled();
  expect(screen.getByRole("button", { name: "Add step" })).toBeDisabled();
  fireEvent.click(preset);
  change("Initial stock (units)", "20");
  fireEvent.click(
    screen.getByRole("button", { name: "Running atomicity in Java…" }),
  );
  expect(api.runAtomicity).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Initial stock (units)")).toHaveValue("1");
  change(
    "Your atomicity prediction (optional)",
    "The separate stock write remains after abort.",
  );
  await act(async () => resolve(result));
  expect(screen.getByLabelText("Transaction 1 ID")).toBeEnabled();
  expect(
    screen.getByLabelText("Your atomicity prediction (optional)"),
  ).toHaveValue("The separate stock write remains after abort.");
});

it("keeps preset changes manual and serializes meaningful ID/reference/quantity/mode/order edits", async () => {
  vi.mocked(api.runAtomicity).mockRejectedValue(
    new Error("Unavailable for this attempt"),
  );
  render(<AtomicityPlayground descriptor={descriptor} />);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Two private proposals share one base",
    }),
  );
  change(
    "Your atomicity prediction (optional)",
    "Changing the commit order changes which proposal publishes.",
  );
  const actor = screen.getByLabelText("Transaction 1 ID");
  actor.focus();
  change("Transaction 1 ID", "alpha");
  expect(screen.getByLabelText("Transaction 1 ID")).toBe(actor);
  expect(actor).toHaveFocus();
  expect(screen.getByLabelText("Step 1 transaction ID")).toHaveValue("a");
  change("Transaction 1 quantity", "2");
  change("Initial stock (units)", "3");
  change("Atomicity mode", "SPLIT_WRITES");
  for (const position of [1, 3, 5, 7])
    change(`Step ${position} transaction ID`, "alpha");
  change("Step 1 ID", "begin-alpha");
  fireEvent.click(screen.getByRole("button", { name: "Move step 8 up" }));
  expect(screen.getByRole("button", { name: "Move step 7 up" })).toHaveFocus();
  expect(api.runAtomicity).not.toHaveBeenCalled();
  run();
  const edited = conflictInput.schedule.map((step) => ({
    ...step,
    id: step.id === "begin-a" ? "begin-alpha" : step.id,
    transactionId: step.transactionId === "a" ? "alpha" : step.transactionId,
  }));
  [edited[6], edited[7]] = [edited[7]!, edited[6]!];
  expect(api.runAtomicity).toHaveBeenCalledWith({
    ...conflictInput,
    mode: "SPLIT_WRITES",
    initialUnits: 3,
    transactions: [
      { id: "alpha", quantity: 2 },
      { id: "b", quantity: 1 },
    ],
    schedule: edited,
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unavailable for this attempt",
  );
  expect(
    screen.getByLabelText("Your atomicity prediction (optional)"),
  ).toHaveValue("Changing the commit order changes which proposal publishes.");
});

it.each([
  {
    actualInput: input,
    actualResult: result,
    preset: "Abort between separate writes",
  },
  {
    actualInput: protectedInput,
    actualResult: protectedResult,
    preset: "Discard unpublished stock work",
  },
])(
  "renders every selected $preset prefix from the actual Java golden",
  async ({ actualInput, actualResult, preset }) => {
    vi.mocked(api.runAtomicity).mockResolvedValue(actualResult);
    render(<AtomicityPlayground descriptor={descriptor} />);
    fireEvent.click(screen.getByRole("button", { name: preset }));
    expect(api.runAtomicity).not.toHaveBeenCalled();
    run();
    await screen.findByRole("region", {
      name: "Java atomicity analysis results",
    });
    expect(api.runAtomicity).toHaveBeenCalledExactlyOnceWith(actualInput);
    expect(screen.getByLabelText("Atomicity snapshot position")).toHaveValue(
      "0",
    );
    expect(
      screen.getByRole("button", { name: "Previous atomicity step" }),
    ).toBeDisabled();
    expectPublished(actualResult.initialState);
    const actor = () =>
      within(snapshot()).getByRole("listitem", { name: "Transaction a" });
    expect(fact(actor(), "Captured stock")).toHaveTextContent(/^Not begun$/);
    expect(fact(actor(), "Private remaining proposal")).toHaveTextContent(
      /^No private workspace$/,
    );
    expect(
      within(published()).getByRole("region", {
        name: "Published allocations at this step",
      }),
    ).toHaveTextContent("No published allocations");
    for (const outcome of actualResult.outcomes) {
      fireEvent.click(
        screen.getByRole("button", { name: "Next atomicity step" }),
      );
      expect(
        within(snapshot()).getByRole("article", {
          name: `Atomicity evidence for ${outcome.stepId}`,
        }),
      ).toHaveTextContent(outcome.explanation);
      expectPublished(outcome.postState);
      const transaction = outcome.postState.transactions[0]!;
      expect(fact(actor(), "Stock units already published")).toHaveTextContent(
        new RegExp(`^${transaction.appliedStockUnits}$`),
      );
      expect(fact(actor(), "Stock units prepared privately")).toHaveTextContent(
        new RegExp(`^${transaction.pendingStockUnits}$`),
      );
      expect(fact(actor(), "Private remaining proposal")).toHaveTextContent(
        transaction.workingRemaining === undefined
          ? /^No private workspace$/
          : new RegExp(`^${transaction.workingRemaining}$`),
      );
    }
    expect(
      screen.getByRole("button", { name: "Next atomicity step" }),
    ).toBeDisabled();
    expect(actor()).toHaveTextContent("Aborted");
    expect(fact(actor(), "Captured stock")).toHaveTextContent(/^1$/);
    fireEvent.click(
      screen.getByRole("button", { name: "Reset atomicity snapshot" }),
    );
    expectPublished(actualResult.initialState);
    expect(api.runAtomicity).toHaveBeenCalledTimes(1);
  },
);

it("keeps an initial/OPEN prefix distinct from later aborted-effects history", async () => {
  vi.mocked(api.runAtomicity).mockResolvedValue(result);
  render(<AtomicityPlayground descriptor={descriptor} />);
  run();
  await screen.findByRole("region", {
    name: "Java atomicity analysis results",
  });
  const summary = screen.getByRole("region", {
    name: "Whole atomicity experiment summary",
  });
  expect(
    fact(summary, "Aborted transactions with published effects"),
  ).toHaveTextContent(/^1$/);
  expect(fact(summary, "First violating step")).toHaveTextContent(
    /^decrement-a$/,
  );
  expect(
    within(published()).queryByText("Violated", { exact: true }),
  ).not.toBeInTheDocument();
  change("Atomicity snapshot position", "2");
  expect(
    fact(published(), "Remaining + allocated equals initial stock"),
  ).toHaveTextContent(/^Violated$/);
  expect(
    fact(published(), "Aborted transactions have no published effects"),
  ).toHaveTextContent(/^Preserved$/);
  expect(
    within(snapshot()).getByRole("listitem", { name: "Transaction a" }),
  ).toHaveTextContent("Open");
  change("Atomicity snapshot position", "3");
  expect(
    fact(published(), "Aborted transactions have no published effects"),
  ).toHaveTextContent(/^Violated$/);
  expect(api.runAtomicity).toHaveBeenCalledTimes(1);
});

it("shows private proposals before conflict and clears only the losing workspace after commit", async () => {
  vi.mocked(api.runAtomicity).mockResolvedValue(conflictResult);
  render(<AtomicityPlayground descriptor={descriptor} />);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Two private proposals share one base",
    }),
  );
  run();
  await screen.findByRole("region", {
    name: "Java atomicity analysis results",
  });
  change("Atomicity snapshot position", "6");
  expectPublished(conflictResult.outcomes[5]!.postState);
  const b = () =>
    within(snapshot()).getByRole("listitem", { name: "Transaction b" });
  expect(fact(b(), "Private remaining proposal")).toHaveTextContent(/^0$/);
  expect(fact(b(), "Private allocation")).toHaveTextContent(
    "1 units · step record-b · not published",
  );
  expect(
    within(published()).getByRole("region", {
      name: "Published allocations at this step",
    }),
  ).toHaveTextContent("No published allocations");
  change("Atomicity snapshot position", "8");
  expectPublished(conflictResult.finalState);
  expect(
    within(snapshot()).getByText("Expected revision 0; actual revision 1."),
  ).toBeVisible();
  expect(b()).toHaveTextContent("REVISION_CONFLICT");
  expect(fact(b(), "Private remaining proposal")).toHaveTextContent(
    /^No private workspace$/,
  );
  const allocations = within(published()).getByRole("region", {
    name: "Published allocations at this step",
  });
  expect(within(allocations).getAllByRole("listitem")).toHaveLength(1);
  expect(allocations).toHaveTextContent("record-a");
  expect(allocations).toHaveTextContent("commit-a");
  expect(allocations).not.toHaveTextContent("record-b");
});

it("retains submitted evidence/prediction through changed-input failure and resets selection on retry", async () => {
  vi.mocked(api.runAtomicity)
    .mockResolvedValueOnce(result)
    .mockRejectedValueOnce(new Error("Java unavailable"))
    .mockResolvedValueOnce(result);
  render(<AtomicityPlayground descriptor={descriptor} />);
  run();
  await screen.findByRole("region", {
    name: "Java atomicity analysis results",
  });
  change("Atomicity snapshot position", "2");
  change(
    "Your atomicity prediction (optional)",
    "The previous stock-only state should remain inspectable.",
  );
  change("Initial stock (units)", "2");
  expect(screen.getByText(/Inputs have changed\. These results/)).toBeVisible();
  run();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Java unavailable",
  );
  expect(screen.getByLabelText("Atomicity snapshot position")).toHaveValue("2");
  expectPublished(result.outcomes[1]!.postState);
  expect(screen.getByLabelText("Initial stock (units)")).toHaveValue("2");
  expect(
    screen.getByLabelText("Your atomicity prediction (optional)"),
  ).toHaveValue("The previous stock-only state should remain inspectable.");
  change("Initial stock (units)", "1");
  run();
  await act(async () => {});
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(
    screen.queryByText(/Inputs have changed\. These results/),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Atomicity snapshot position")).toHaveValue("0");
});

it("adds/removes explicit steps and requires the learner to repair a changed complete program", async () => {
  vi.mocked(api.runAtomicity).mockRejectedValue(new Error("Try later"));
  render(<AtomicityPlayground descriptor={descriptor} />);
  change("Step 3 action", "COMMIT");
  fireEvent.click(screen.getByRole("button", { name: "Add step" }));
  change("Step 4 action", "RECORD_ALLOCATION");
  change("Step 4 ID", "record-a");
  fireEvent.click(screen.getByRole("button", { name: "Move step 4 up" }));
  expect(screen.getByRole("button", { name: "Move step 3 up" })).toHaveFocus();
  expect(api.runAtomicity).not.toHaveBeenCalled();
  run();
  expect(api.runAtomicity).toHaveBeenCalledWith({
    ...input,
    schedule: [
      input.schedule[0],
      input.schedule[1],
      { id: "record-a", transactionId: "a", action: "RECORD_ALLOCATION" },
      { id: "abort-a", transactionId: "a", action: "COMMIT" },
    ],
  });
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Remove step 3" }));
  expect(screen.getByRole("button", { name: "Add step" })).toHaveFocus();
  run();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Check the highlighted fields",
  );
  expect(api.runAtomicity).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Step 3 action")).toHaveValue("COMMIT");
});

it("preserves explicitly reassigned steps when removing their previous owner", () => {
  render(<AtomicityPlayground descriptor={descriptor} />);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Two private proposals share one base",
    }),
  );
  change("Step 1 transaction ID", "b");
  fireEvent.click(
    screen.getByRole("button", { name: "Remove transaction 1 and its steps" }),
  );
  expect(screen.getByRole("button", { name: "Add transaction" })).toHaveFocus();
  expect(screen.getByLabelText("Transaction 1 ID")).toHaveValue("b");
  expect(screen.getByLabelText("Step 1 ID")).toHaveValue("begin-a");
  expect(screen.getByLabelText("Step 1 transaction ID")).toHaveValue("b");
  expect(screen.getByLabelText("Step 5 ID")).toHaveValue("commit-b");
  run();
  expect(api.runAtomicity).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Check the highlighted fields",
  );
});

it("removes a renamed actor's original input steps and leaves the other actor's program usable", async () => {
  vi.mocked(api.runAtomicity).mockRejectedValue(new Error("Try later"));
  render(<AtomicityPlayground descriptor={descriptor} />);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Two private proposals share one base",
    }),
  );
  change("Transaction 1 ID", "renamed");
  expect(screen.getByLabelText("Step 1 transaction ID")).toHaveValue("a");
  fireEvent.click(
    screen.getByRole("button", { name: "Remove transaction 1 and its steps" }),
  );
  expect(screen.getByLabelText("Transaction 1 ID")).toHaveValue("b");
  expect(screen.getByLabelText("Step 1 ID")).toHaveValue("begin-b");
  expect(screen.queryByLabelText("Step 5 ID")).not.toBeInTheDocument();
  run();
  expect(api.runAtomicity).toHaveBeenCalledWith({
    ...conflictInput,
    transactions: [conflictInput.transactions[1]],
    schedule: conflictInput.schedule.filter(
      (step) => step.transactionId === "b",
    ),
  });
  await screen.findByRole("alert");
});

it("adds a full transaction input program and restores Add focus when it is removed", () => {
  render(<AtomicityPlayground descriptor={descriptor} />);
  fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
  expect(screen.getByLabelText("Transaction 2 ID")).toBeVisible();
  expect(screen.getByLabelText("Step 7 action")).toHaveValue("COMMIT");
  fireEvent.click(
    screen.getByRole("button", { name: "Remove transaction 2 and its steps" }),
  );
  expect(screen.getByRole("button", { name: "Add transaction" })).toHaveFocus();
  expect(screen.queryByLabelText("Transaction 2 ID")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Step 4 ID")).not.toBeInTheDocument();
  expect(api.runAtomicity).not.toHaveBeenCalled();
});

it("ignores a response after its workbench unmounts", async () => {
  let resolve!: (value: AtomicityResult) => void;
  vi.mocked(api.runAtomicity).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const previous = render(<AtomicityPlayground descriptor={descriptor} />);
  run();
  previous.unmount();
  render(<AtomicityPlayground descriptor={descriptor} />);
  await act(async () => resolve(result));
  expect(
    screen.queryByRole("region", { name: "Java atomicity analysis results" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Run atomicity experiment" }),
  ).toBeEnabled();
});
