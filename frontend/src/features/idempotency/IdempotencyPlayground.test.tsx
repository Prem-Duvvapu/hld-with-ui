import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import type { IdempotencyResult, IdempotencyState } from "../../api/types";
import {
  descriptor,
  input,
  result,
  pairs,
  atomicResult,
} from "../../api/idempotencyTestFixtures";
import { IdempotencyPlayground } from "./IdempotencyPlayground";
import { callerObservation, phaseLabels } from "./idempotencyLabels";
vi.mock("../../api/client", () => ({ api: { runIdempotency: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const run = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Run idempotency experiment" }),
  );
const snapshot = () =>
  screen.getByRole("region", { name: "Selected idempotency snapshot" });
const results = () =>
  screen.getByRole("region", { name: "Java idempotency simulation results" });
const fact = (scope: HTMLElement, label: string) =>
  within(scope)
    .getByText(label, { exact: true })
    .parentElement!.querySelector("dd")!;
function expectSnapshot(state: IdempotencyState) {
  const region = snapshot();
  expect(fact(region, "Published units")).toHaveTextContent(
    new RegExp(`^${state.publishedUnits}$`),
  );
  expect(fact(region, "Active retained keys")).toHaveTextContent(
    new RegExp(`^${state.activeKeyCount}$`),
  );
  expect(fact(region, "Expired historical keys")).toHaveTextContent(
    new RegExp(`^${state.expiredKeyCount}$`),
  );
  for (const call of state.calls) {
    const card = within(region).getByRole("article", {
      name: `Call ${call.id}`,
    });
    expect(card).toHaveTextContent(phaseLabels[call.phase]);
    expect(
      within(card).getByText("Private prepared units").nextElementSibling,
    ).toHaveTextContent(new RegExp(`^${call.pendingUnits}$`));
    expect(card).toHaveTextContent(callerObservation(call));
    expect(fact(card, "This call's public effect")).toHaveTextContent(
      call.publishedEffectId ?? "None",
    );
    expect(fact(card, "Server-side receipt")).toHaveTextContent(
      call.receipt
        ? `${call.receipt.effectId} · ${call.receipt.units} units`
        : "None cached",
    );
  }
  const ledger = within(region).getByRole("region", {
    name: "Public effect ledger",
  });
  expect(within(ledger).queryAllByRole("listitem")).toHaveLength(
    state.effects.length,
  );
  for (const effect of state.effects)
    expect(
      within(ledger).getByRole("listitem", { name: `Effect ${effect.id}` }),
    ).toHaveTextContent(`${effect.units} units`);
  const history = within(region).getByRole("region", {
    name: "Retained key history",
  });
  expect(within(history).queryAllByRole("listitem")).toHaveLength(
    state.keyRecords.length,
  );
  for (const record of state.keyRecords)
    expect(
      within(history).getByRole("listitem", {
        name: `Key record ${record.id}`,
      }),
    ).toHaveTextContent(
      record.status === "ACTIVE" ? "Active" : "Expired history",
    );
}
it("selects the explicit default even if presets are reordered and never runs on load or edits", () => {
  render(
    <IdempotencyPlayground
      descriptor={{ ...descriptor, presets: [...descriptor.presets].reverse() }}
    />,
  );
  expect(screen.getByLabelText("Scenario")).toHaveValue(
    "unprotected-response-loss",
  );
  expect(
    screen.getByRole("combobox", { name: "Protection mode" }),
  ).toHaveAccessibleDescription(/Change only this field/);
  expect(
    screen.getByRole("region", { name: "No idempotency simulation yet" }),
  ).toBeVisible();
  change("Protection mode", "ATOMIC_EFFECT_RECORD");
  expect(screen.getByLabelText("Scenario")).toHaveValue("");
  expect(api.runIdempotency).not.toHaveBeenCalled();
});
it("keeps invalid numeric blanks and focuses the field rather than posting", () => {
  render(<IdempotencyPlayground descriptor={descriptor} />);
  change("Result retention (ms)", "");
  run();
  expect(api.runIdempotency).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Result retention (ms)")).toHaveValue("");
  expect(screen.getByLabelText("Result retention (ms)")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByLabelText("Result retention (ms)")).toHaveAccessibleName(
    "Result retention (ms)",
  );
  expect(
    screen.getByLabelText("Result retention (ms)"),
  ).toHaveAccessibleDescription(/Enter a whole number/);
  expect(screen.getByLabelText("Result retention (ms)")).toHaveFocus();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Check the highlighted fields",
  );
});
it("opens the editor to focus an invalid referenced ID and preserves the authored mismatch", () => {
  render(<IdempotencyPlayground descriptor={descriptor} />);
  change("Call 1 ID", "renamed");
  run();
  expect(api.runIdempotency).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Step 1 call ID")).toHaveValue("a");
  expect(screen.getByLabelText("Step 1 call ID")).toHaveFocus();
  expect(
    screen.getByLabelText("Step 1 call ID").closest("details"),
  ).toHaveAttribute("open");
});
it("captures one pending submission, locks conflict controls and leaves prediction editable", async () => {
  let resolve!: (value: IdempotencyResult) => void;
  vi.mocked(api.runIdempotency).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<IdempotencyPlayground descriptor={descriptor} />);
  run();
  expect(api.runIdempotency).toHaveBeenCalledExactlyOnceWith(input);
  for (const label of [
    "Scenario",
    "Protection mode",
    "Result retention (ms)",
    "Call 1 ID",
    "Step 1 action",
  ])
    expect(screen.getByLabelText(label)).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Running idempotency in Java…" }),
  );
  change("Protection mode", "ATOMIC_EFFECT_RECORD");
  expect(api.runIdempotency).toHaveBeenCalledTimes(1);
  change(
    "Your idempotency prediction (optional)",
    "The retry may create another effect.",
  );
  await act(async () => resolve(result));
  expect(screen.getByLabelText("Protection mode")).toHaveValue("NO_DEDUP");
  expect(
    screen.getByLabelText("Your idempotency prediction (optional)"),
  ).toHaveValue("The retry may create another effect.");
});
it.each(pairs)(
  "renders each actual Java $id snapshot without replaying the model in React",
  async ({ id, input: actualInput, result: actualResult }) => {
    vi.mocked(api.runIdempotency).mockResolvedValue(actualResult);
    render(<IdempotencyPlayground descriptor={descriptor} />);
    change("Scenario", id);
    expect(api.runIdempotency).not.toHaveBeenCalled();
    run();
    await screen.findByRole("region", {
      name: "Java idempotency simulation results",
    });
    expect(api.runIdempotency).toHaveBeenCalledExactlyOnceWith(actualInput);
    expectSnapshot(actualResult.initialState);
    for (const outcome of actualResult.outcomes) {
      fireEvent.click(
        screen.getByRole("button", { name: "Next idempotency step" }),
      );
      expect(
        screen.getByRole("article", {
          name: `Idempotency evidence for ${outcome.stepId}`,
        }),
      ).toHaveTextContent(outcome.explanation);
      expectSnapshot(outcome.postState);
    }
    expect(
      screen.getByRole("button", { name: "Next idempotency step" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Reset idempotency snapshot" }),
    );
    expectSnapshot(actualResult.initialState);
    expect(api.runIdempotency).toHaveBeenCalledTimes(1);
  },
);
it("separates a retained server receipt from a lost response and whole-run metrics from selected state", async () => {
  vi.mocked(api.runIdempotency).mockResolvedValue(atomicResult);
  render(<IdempotencyPlayground descriptor={descriptor} />);
  change("Protection mode", "ATOMIC_EFFECT_RECORD");
  run();
  await screen.findByRole("region", {
    name: "Java idempotency simulation results",
  });
  const summary = screen.getByRole("region", {
    name: "Whole idempotency experiment summary",
  });
  expect(fact(summary, "Published effects")).toHaveTextContent(/^1$/);
  expect(fact(snapshot(), "Published units")).toHaveTextContent(/^0$/);
  change("Idempotency snapshot position", "4");
  const a = within(snapshot()).getByRole("article", { name: "Call a" });
  expect(fact(a, "Server-side receipt")).toHaveTextContent(
    "effect-a · 1 units",
  );
  expect(a).toHaveTextContent("No response received (lost)");
  change("Idempotency snapshot position", "8");
  const b = within(snapshot()).getByRole("article", { name: "Call b" });
  expect(fact(b, "This call's public effect")).toHaveTextContent(/^None$/);
  expect(fact(b, "Server-side receipt")).toHaveTextContent(
    "effect-a · 1 units",
  );
  expect(b).toHaveTextContent("Receipt received");
});
it("retains old results through meaningful edits and a failed explicit retry", async () => {
  vi.mocked(api.runIdempotency)
    .mockResolvedValueOnce(result)
    .mockRejectedValueOnce(new Error("Busy. Try this input again."));
  render(<IdempotencyPlayground descriptor={descriptor} />);
  run();
  await screen.findByRole("region", {
    name: "Java idempotency simulation results",
  });
  change("Call 2 key", "new-key");
  change("Result retention (ms)", "200");
  expect(within(results()).getByRole("status")).toHaveTextContent(
    "Inputs changed",
  );
  run();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Busy. Try this input again.",
  );
  expect(results()).toBeVisible();
  expect(screen.getByLabelText("Call 2 key")).toHaveValue("new-key");
  expect(api.runIdempotency).toHaveBeenLastCalledWith({
    ...input,
    retentionMs: 200,
    calls: [input.calls[0], { ...input.calls[1], key: "new-key" }],
  });
  expect(within(results()).getByText(/Submitted:/)).toHaveTextContent(
    "retention 100 ms",
  );
});
it("moves an equal-time step with stable focus, does not sort it, and restores focus after removal", () => {
  render(<IdempotencyPlayground descriptor={descriptor} />);
  change("Scenario", "atomic-race");
  fireEvent.click(screen.getByRole("button", { name: "Move step 6 up" }));
  expect(screen.getByRole("button", { name: "Move step 5 up" })).toHaveFocus();
  expect(screen.getByLabelText("Step 5 ID")).toHaveValue("save-b");
  fireEvent.click(screen.getByRole("button", { name: "Remove step 5" }));
  expect(screen.getByRole("button", { name: "Add step" })).toHaveFocus();
  expect(api.runIdempotency).not.toHaveBeenCalled();
});
it("ignores an old response after the workbench is unmounted", async () => {
  let resolve!: (value: IdempotencyResult) => void;
  vi.mocked(api.runIdempotency).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const previous = render(<IdempotencyPlayground descriptor={descriptor} />);
  run();
  previous.unmount();
  render(<IdempotencyPlayground descriptor={descriptor} />);
  await act(async () => resolve(result));
  expect(
    screen.queryByRole("region", {
      name: "Java idempotency simulation results",
    }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Run idempotency experiment" }),
  ).toBeEnabled();
});
