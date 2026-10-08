import workshopFixture from "../../../../content/case-studies/url-shortener/workshop.json";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
function view() {
  return render(
    <MemoryRouter>
      <DesignWorkshop workshop={workshop} title="URL Shortener" draft />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  raw = null;
  store = makeStore();
});
describe("Requirements workshop", () => {
  it("preserves an original attempt separately from revised reasoning and self-checks across reload", () => {
    const first = view();
    expect(
      screen.getByRole("region", { name: "Draft workshop" }),
    ).toHaveTextContent("1 authored stage");
    expect(raw).toBeNull();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Your original requirements" }),
      { target: { value: "Create stable codes; only active links redirect." } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reveal reference requirements" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Your original requirements" }),
    ).toHaveAttribute("readonly");
    fireEvent.click(
      screen.getAllByRole("radio", { name: "Covered in my answer" })[0]!,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Your revised requirements" }),
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
      screen.getByRole("textbox", { name: "Your original requirements" }),
    ).toHaveValue("Create stable codes; only active links redirect.");
    expect(
      screen.getByRole("textbox", { name: "Your revised requirements" }),
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
      screen.getByRole("button", { name: "Reveal reference requirements" }),
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
      screen.getByRole("textbox", { name: "Your original requirements" }),
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
      screen.getByRole("textbox", { name: "Your original requirements" }),
    ).toHaveValue("My previous requirements remain visible.");
  });
  it("keeps learning usable with a clear session-only notice when durable saving fails", () => {
    store = makeStore(true);
    view();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Your original requirements" }),
      { target: { value: "A stable destination and explicit expiry policy." } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reveal reference requirements" }),
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
      screen.getByRole("button", { name: "Reveal reference requirements" }),
    );
    expect(
      screen.getByRole("heading", { name: "2. Compare with the reference" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Workshop answer storage" }),
    ).toHaveTextContent("answer limit");
    expect(raw).toBe(previous);
    expect(store.getSnapshot().answers).toHaveLength(200);
  });
});
