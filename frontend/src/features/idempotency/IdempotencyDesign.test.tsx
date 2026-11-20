import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { descriptor, pairs } from "../../api/idempotencyTestFixtures";
import type { IdempotencyState } from "../../api/types";
import { IdempotencyArchitectureView } from "./IdempotencyArchitectureView";
import {
  authoredIdempotencyPaths,
  IdempotencySequenceView,
} from "./IdempotencySequenceView";
import { callerObservation, phaseLabels } from "./idempotencyLabels";
vi.mock("../../api/client", () => ({ api: { runIdempotency: vi.fn() } }));
const scene = () =>
  screen.getByRole("region", { name: "Selected idempotency path step" });
const next = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Next idempotency path step" }),
  );
const fact = (scope: HTMLElement, label: string) =>
  within(scope)
    .getByText(label, { exact: true })
    .parentElement!.querySelector("dd")!;
function expectState(state: IdempotencyState) {
  const snapshot = within(scene()).getByRole("region", {
    name: "Selected idempotency snapshot",
  });
  expect(fact(snapshot, "Published units")).toHaveTextContent(
    new RegExp(`^${state.publishedUnits}$`),
  );
  expect(fact(snapshot, "Active retained keys")).toHaveTextContent(
    new RegExp(`^${state.activeKeyCount}$`),
  );
  expect(fact(snapshot, "Expired historical keys")).toHaveTextContent(
    new RegExp(`^${state.expiredKeyCount}$`),
  );
  for (const call of state.calls) {
    const card = within(snapshot).getByRole("article", {
      name: `Call ${call.id}`,
    });
    expect(card).toHaveTextContent(phaseLabels[call.phase]);
    expect(card).toHaveTextContent(callerObservation(call));
    expect(fact(card, "Server-side receipt")).toHaveTextContent(
      call.receipt
        ? `${call.receipt.effectId} · ${call.receipt.units} units`
        : "None cached",
    );
    expect(fact(card, "This call's public effect")).toHaveTextContent(
      call.publishedEffectId ?? "None",
    );
    expect(
      within(card).getByText("Private prepared units").nextElementSibling,
    ).toHaveTextContent(new RegExp(`^${call.pendingUnits}$`));
  }
}
it("verifies all 27 authored states, identities and times against actual Java goldens", () => {
  expect(authoredIdempotencyPaths).toHaveLength(3);
  let checked = 0;
  for (const path of authoredIdempotencyPaths) {
    const run = pairs.find((pair) => pair.id === path.presetId)!.result;
    expect(path.steps).toHaveLength(run.outcomes.length + 1);
    path.steps.forEach((step, index) => {
      expect(step.sequence).toBe(index);
      if (index === 0) {
        expect(step.state).toEqual(run.initialState);
        expect(step.timeMs).toBe(0);
        expect(step.kind).toBeUndefined();
        expect(step.callId).toBeUndefined();
      } else {
        const outcome = run.outcomes.find((item) => item.stepId === step.id)!;
        expect(outcome).toBeDefined();
        expect(step.sequence).toBe(outcome.sequence);
        expect(step.timeMs).toBe(outcome.timeMs);
        expect(step.kind).toBe(outcome.kind);
        expect(step.callId).toBe(outcome.callId);
        expect(step.state).toEqual(outcome.postState);
      }
      checked++;
    });
  }
  expect(checked).toBe(27);
});
it("connects the six responsibilities as one causal publication topology with a full text alternative", () => {
  render(<IdempotencyArchitectureView />);
  const topology = screen.getByRole("region", {
    name: "Idempotency publication topology",
  });
  expect(within(topology).getAllByRole("button")).toHaveLength(6);
  expect(topology).toHaveTextContent("Public effect ledger");
  expect(topology).toHaveTextContent("Retained key → original receipt");
  const selected = () =>
    screen.getByRole("region", { name: "Selected idempotency responsibility" });
  fireEvent.click(screen.getByRole("button", { name: "Inspect Key lookup" }));
  expect(selected()).toHaveTextContent("reserves nothing");
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect Publication boundary" }),
  );
  expect(selected()).toHaveTextContent("current active key");
  expect(selected()).toHaveTextContent("cannot undo the earlier public write");
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect Retained receipts" }),
  );
  expect(selected()).toHaveTextContent("replay does not extend it");
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect Caller observation" }),
  );
  expect(selected()).toHaveTextContent(
    "received error is not a received receipt",
  );
  expect(
    screen.getByRole("region", {
      name: "Idempotency architecture text equivalent",
    }),
  ).toHaveTextContent("A miss does not acquire a lock or reserve the key");
  expect(api.runIdempotency).not.toHaveBeenCalled();
});
it.each(authoredIdempotencyPaths)(
  "manually selects the exact initial and post-step facts for $id without a run",
  (path) => {
    render(<IdempotencySequenceView descriptor={descriptor} />);
    fireEvent.click(screen.getByRole("radio", { name: path.title }));
    expectState(path.steps[0]!.state);
    for (const step of path.steps.slice(1)) {
      next();
      expect(scene()).toHaveTextContent(step.title);
      expect(scene()).toHaveTextContent(step.detail);
      expect(scene()).toHaveTextContent(step.kind!);
      expectState(step.state);
    }
    expect(
      screen.getByRole("button", { name: "Next idempotency path step" }),
    ).toBeDisabled();
    expect(api.runIdempotency).not.toHaveBeenCalled();
  },
);
it("returns focus to an enabled manual control at each endpoint and resets without an automatic run", () => {
  render(<IdempotencySequenceView descriptor={descriptor} />);
  const nextButton = screen.getByRole("button", {
    name: "Next idempotency path step",
  });
  nextButton.focus();
  for (let i = 0; i < 8; i++) next();
  const previous = screen.getByRole("button", {
    name: "Previous idempotency path step",
  });
  expect(previous).toHaveFocus();
  for (let i = 0; i < 8; i++) fireEvent.click(previous);
  expect(nextButton).toHaveFocus();
  next();
  fireEvent.click(
    screen.getByRole("button", { name: "Reset idempotency path" }),
  );
  expect(scene()).toHaveTextContent(
    "Initial state before the first authored action",
  );
  expectState(authoredIdempotencyPaths[0]!.steps[0]!.state);
  expect(api.runIdempotency).not.toHaveBeenCalled();
});
it("changing paths resets manual selection and exposes readable complete state details within the text sequence", () => {
  render(<IdempotencySequenceView descriptor={descriptor} />);
  next();
  next();
  const second = authoredIdempotencyPaths[1]!,
    radio = screen.getByRole("radio", { name: second.title });
  radio.focus();
  fireEvent.click(radio);
  expect(radio).toHaveFocus();
  expect(scene()).toHaveTextContent(
    "Initial state before the first authored action",
  );
  fireEvent.click(
    screen.getByText("Full idempotency text sequence", { selector: "summary" }),
  );
  const text = screen.getByRole("region", {
    name: "Authored idempotency sequence",
  });
  expect(text.querySelectorAll(":scope > ol > li")).toHaveLength(9);
  const detail = within(text).getByText("Call and receipt details for save-b", {
    selector: "summary",
  });
  fireEvent.click(detail);
  const snapshot = detail.parentElement!.querySelector<HTMLElement>(
    '[aria-label="Selected idempotency snapshot"]',
  )!;
  expect(snapshot).toBeVisible();
  expect(
    within(snapshot).getByRole("article", { name: "Call b" }),
  ).toHaveTextContent("Result-save conflict");
  expect(fact(snapshot, "Published units")).toHaveTextContent(/^2$/);
  expect(api.runIdempotency).not.toHaveBeenCalled();
});
it("fails visibly if the matching authored preset input is unavailable", () => {
  render(
    <IdempotencySequenceView descriptor={{ ...descriptor, presets: [] }} />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("no matching scenario");
  expect(
    screen.queryByRole("region", { name: "Selected idempotency path step" }),
  ).not.toBeInTheDocument();
  expect(api.runIdempotency).not.toHaveBeenCalled();
});
