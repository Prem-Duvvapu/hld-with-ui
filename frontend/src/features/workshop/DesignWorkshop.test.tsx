import workshopFixture from "../../../../content/case-studies/url-shortener/workshop.json";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workshop } from "../../api/types";
import {
  createPracticeStore,
  serializeAnswers,
  type PracticeAnswer,
} from "../learning/practiceStorage";
import { DesignWorkshop } from "./DesignWorkshop";

let store: ReturnType<typeof createPracticeStore>;
let raw: string | null;
vi.mock("../learning/practiceStorage", async (original) => ({
  ...(await original<typeof import("../learning/practiceStorage")>()),
  getPracticeStore: () => store,
}));
const workshop = workshopFixture as Workshop;
function makeStore(denied = false) {
  return createPracticeStore(() => ({
    getItem: () => raw,
    setItem: (_key, value) => {
      if (denied)
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      raw = value;
    },
  }));
}
function Location() {
  const location = useLocation();
  return <output aria-label="Current route">{location.search}</output>;
}
function view(route = "/case-studies/url-shortener") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Location />
      <DesignWorkshop workshop={workshop} title="URL Shortener" draft />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  raw = null;
  store = makeStore();
});
describe("Design workshop", () => {
  it("preserves an original attempt separately from revised reasoning and self-checks across reload", () => {
    const first = view();
    expect(
      screen.getByRole("region", { name: "Draft workshop" }),
    ).toHaveTextContent("10 authored stages");
    expect(raw).toBeNull();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Your original answer" }),
      { target: { value: "Create stable codes; only active links redirect." } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reveal reference answer" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Your original answer" }),
    ).toHaveAttribute("readonly");
    fireEvent.click(
      screen.getAllByRole("radio", { name: "Covered in my answer" })[0]!,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Your revised answer" }),
      {
        target: {
          value:
            "Check expiry on cached reads and document ambiguous-create retries.",
        },
      },
    );
    first.unmount();
    store = makeStore();
    view();
    expect(
      screen.getByRole("textbox", { name: "Your original answer" }),
    ).toHaveValue("Create stable codes; only active links redirect.");
    expect(
      screen.getByRole("textbox", { name: "Your revised answer" }),
    ).toHaveValue(
      "Check expiry on cached reads and document ambiguous-create retries.",
    );
    expect(
      screen.getAllByRole("radio", { name: "Covered in my answer" })[0],
    ).toBeChecked();
    expect(store.getSnapshot().answers).toHaveLength(3);
  });
  it("distinguishes viewing the reference from writing an original attempt", () => {
    view();
    fireEvent.click(
      screen.getByRole("button", { name: "Reveal reference answer" }),
    );
    expect(
      screen.getByText(/Reference viewed without an original written attempt/),
    ).toBeVisible();
    expect(store.getSnapshot().answers[0]?.answer).toEqual({
      kind: "text",
      text: "",
    });
    fireEvent.click(screen.getByText("Import answers or reset this module"));
    fireEvent.click(screen.getByRole("button", { name: "Reset this module" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Delete module answers" }),
    );
    expect(
      screen.queryByRole("heading", { name: "2. Compare with the reference" }),
    ).not.toBeInTheDocument();
  });
  it("keeps older answers but requires a fresh reference review and self-check", () => {
    const old: PracticeAnswer = {
      topicId: workshop.id,
      activityId: "requirements-attempt",
      contentVersion: "0.9.0",
      updatedAt: "2026-10-01T00:00:00.000Z",
      answer: {
        kind: "text",
        text: "My previous requirements remain visible.",
      },
      referenceViewed: true,
    };
    raw = serializeAnswers([
      old,
      {
        ...old,
        activityId: "requirements-check-behavior",
        answer: { kind: "choice", optionId: "yes" },
      },
    ]);
    store = makeStore();
    view();
    expect(
      screen.getByRole("textbox", { name: "Your original answer" }),
    ).toHaveValue("My previous requirements remain visible.");
    expect(screen.getByRole("note")).toHaveTextContent("older lesson");
    expect(
      screen.queryByRole("heading", { name: "2. Compare with the reference" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Review the current reference" }),
    );
    expect(
      screen.getAllByRole("radio", { name: "Covered in my answer" })[0],
    ).not.toBeChecked();
    expect(
      screen.getByRole("textbox", { name: "Your original answer" }),
    ).toHaveValue("My previous requirements remain visible.");
  });
  it("keeps learning usable with a clear session-only notice when durable saving fails", () => {
    store = makeStore(true);
    view();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Your original answer" }),
      { target: { value: "A stable destination and explicit expiry policy." } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reveal reference answer" }),
    );
    expect(
      screen.getByRole("region", { name: "Workshop answer storage" }),
    ).toHaveTextContent("session only");
    expect(
      screen.getByRole("heading", { name: "2. Compare with the reference" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Download answers" }),
    ).toBeEnabled();
    expect(raw).toBeNull();
  });
  it("allows reading the reference with a full answer store and leaves accepted records untouched", () => {
    const accepted: PracticeAnswer[] = Array.from(
      { length: 200 },
      (_, index) => ({
        topicId: "retired-module",
        activityId: `answer-${index + 1}`,
        contentVersion: "1.0.0",
        updatedAt: "2026-10-01T00:00:00.000Z",
        answer: { kind: "text", text: "Preserved previous work." },
        referenceViewed: false,
      }),
    );
    raw = serializeAnswers(accepted);
    const previous = raw;
    store = makeStore();
    view();
    fireEvent.click(
      screen.getByRole("button", { name: "Reveal reference answer" }),
    );
    expect(
      screen.getByRole("heading", { name: "2. Compare with the reference" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Workshop answer storage" }),
    ).toHaveTextContent("answer limit");
    expect(raw).toBe(previous);
    expect(store.getSnapshot().answers).toHaveLength(200);
    fireEvent.click(screen.getByRole("button", { name: "Next stage" }));
    expect(
      screen.queryByRole("heading", { name: "2. Compare with the reference" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous stage" }));
    expect(
      screen.getByRole("heading", { name: "2. Compare with the reference" }),
    ).toBeVisible();
    expect(raw).toBe(previous);
  });
  it("uses direct stage links, explains an unknown stage and preserves other query parameters", () => {
    const direct = view("/case-studies/url-shortener?stage=api&view=workshop");
    expect(screen.getByRole("button", { name: /03.*API/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByRole("button", { name: "Next stage" })).toBeEnabled();
    expect(
      screen.getByRole("heading", {
        name: workshop.stages[2]!.title,
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Previous stage" }));
    expect(screen.getByLabelText("Current route")).toHaveTextContent(
      "stage=estimates&view=workshop",
    );
    direct.unmount();
    view("/case-studies/url-shortener?stage=unavailable");
    expect(
      screen.getByText(/The requested stage is unavailable/),
    ).toHaveAttribute("role", "status");
    expect(
      screen.getByRole("button", { name: "Previous stage" }),
    ).toBeDisabled();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });
  it("isolates stage attempts, revisions and self-checks across stage changes", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: /01.*Requirements/ }));
    expect(screen.getByLabelText("Current route")).toBeEmptyDOMElement();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Your original answer" }),
      { target: { value: "Requirements reasoning" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reveal reference answer" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Your revised answer" }),
      { target: { value: "Requirements revision" } },
    );
    fireEvent.click(
      screen.getAllByRole("radio", { name: "Covered in my answer" })[0]!,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next stage" }));
    expect(
      screen.getByRole("textbox", { name: "Your original answer" }),
    ).toHaveValue("");
    expect(
      screen.queryByRole("textbox", { name: "Your revised answer" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: workshop.stages[1]!.title }),
    ).toHaveFocus();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Your original answer" }),
      { target: { value: "Estimate reasoning with units" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reveal reference answer" }),
    );
    expect(
      screen.getAllByRole("radio", { name: "Covered in my answer" })[0],
    ).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Previous stage" }));
    expect(
      screen.getByRole("heading", { name: workshop.stages[0]!.title }),
    ).toHaveFocus();
    expect(
      screen.getByRole("textbox", { name: "Your original answer" }),
    ).toHaveValue("Requirements reasoning");
    expect(
      screen.getByRole("textbox", { name: "Your revised answer" }),
    ).toHaveValue("Requirements revision");
    expect(
      screen.getAllByRole("radio", { name: "Covered in my answer" })[0],
    ).toBeChecked();
    expect(
      store.getSnapshot().answers.map((answer) => answer.activityId),
    ).toContain("estimates-attempt");
  });
});
