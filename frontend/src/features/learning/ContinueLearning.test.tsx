import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import catalog from "../../../../content/catalog.json";
import questions from "../../../../content/topics/request-flow/questions.json";
import workshop from "../../../../content/case-studies/url-shortener/workshop.json";
import type {
  CaseStudyDetail,
  CatalogEntry,
  TopicDetail,
} from "../../api/types";
import { api, ApiClientError } from "../../api/client";
import { ContinueLearning } from "./ContinueLearning";
import {
  createPracticeStore,
  serializeAnswers,
  type PracticeAnswer,
} from "./practiceStorage";

let store: ReturnType<typeof createPracticeStore>;
let raw: string | null;
vi.mock("./practiceStorage", async (original) => ({
  ...(await original<typeof import("./practiceStorage")>()),
  getPracticeStore: () => store,
}));
const entries = catalog as CatalogEntry[];
const topic = {
  topic: entries.find((entry) => entry.id === "request-flow")!,
  questions,
  checkpoints: [],
  lessonMarkdown: "A lesson.",
} as TopicDetail;
const caseStudy = {
  entry: entries.find((entry) => entry.id === "url-shortener")!,
  workshop,
} as CaseStudyDetail;
const saved: PracticeAnswer = {
  topicId: "request-flow",
  activityId: "request-flow-interview",
  contentVersion: "1.1.0",
  updatedAt: "2026-10-10T01:00:00.000Z",
  answer: {
    kind: "text",
    text: "Private reasoning must stay on this browser.",
  },
  referenceViewed: false,
};
function setup(records: PracticeAnswer[], denied = false) {
  raw = serializeAnswers(records);
  store = createPracticeStore(() => ({
    getItem: () => raw,
    setItem: (_key, value) => {
      if (denied) throw new DOMException("Denied", "QuotaExceededError");
      raw = value;
    },
  }));
}
function view() {
  return render(
    <MemoryRouter>
      <ContinueLearning
        entries={entries.filter((entry) => entry.status === "published")}
      />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  setup([saved]);
  vi.spyOn(api, "topic").mockResolvedValue(topic);
});
afterEach(() => vi.restoreAllMocks());

describe("Continue learning", () => {
  it("stays absent and performs no lookup when no meaningful work has been saved", () => {
    setup([{ ...saved, answer: { kind: "text", text: "" } }]);
    view();
    expect(
      screen.queryByRole("heading", { name: "Continue learning" }),
    ).toBeNull();
    expect(api.topic).not.toHaveBeenCalled();
  });
  it("checks current content before linking to an exact question, without rewriting or transmitting the answer", async () => {
    const original = raw;
    view();
    expect(screen.getByText("Checking your saved module…")).toHaveAttribute(
      "role",
      "status",
    );
    expect(
      await screen.findByRole("link", { name: "Continue saved work" }),
    ).toHaveAttribute(
      "href",
      "/topics/request-flow?view=practice&question=request-flow-interview",
    );
    expect(api.topic).toHaveBeenCalledExactlyOnceWith("request-flow");
    expect(
      screen.queryByText(saved.answer.kind === "text" ? saved.answer.text : ""),
    ).toBeNull();
    expect(raw).toBe(original);
    expect(screen.getByText(/No completion or mastery inferred/)).toBeVisible();
  });
  it("offers a draft workshop stage only for existing saved work and preserves older versions", async () => {
    setup([
      {
        ...saved,
        topicId: "url-shortener",
        activityId: "operations-revision",
        contentVersion: "1.0.0",
      },
    ]);
    vi.mocked(api.topic).mockRejectedValue(
      new ApiClientError("Unknown topic", 404),
    );
    vi.spyOn(api, "caseStudy").mockResolvedValue(caseStudy);
    const original = raw;
    view();
    expect(
      await screen.findByRole("link", { name: "Continue saved work" }),
    ).toHaveAttribute("href", "/case-studies/url-shortener?stage=operations");
    expect(screen.getByText("Draft workshop · Saved work")).toBeVisible();
    expect(screen.getByRole("note")).toHaveTextContent("Content has changed");
    expect(raw).toBe(original);
  });
  it("keeps reference-only reading distinct from a written attempt", async () => {
    setup([
      { ...saved, answer: { kind: "text", text: "" }, referenceViewed: true },
    ]);
    view();
    await screen.findByRole("link", { name: "Continue saved work" });
    expect(
      screen.getByText(/Reference viewed without a written attempt/),
    ).toBeVisible();
  });
  it("retains a removed activity and links only to the current module", async () => {
    setup([{ ...saved, activityId: "retired" }]);
    const original = raw;
    view();
    expect(
      await screen.findByRole("link", { name: "Open current module" }),
    ).toHaveAttribute("href", "/topics/request-flow");
    expect(screen.getByRole("note")).toHaveTextContent(
      "no longer in the module",
    );
    expect(raw).toBe(original);
  });
  it("keeps a removed module's answers available for backup with no invented link", async () => {
    vi.mocked(api.topic).mockRejectedValue(
      new ApiClientError("Unknown topic", 404),
    );
    vi.spyOn(api, "caseStudy").mockRejectedValue(
      new ApiClientError("Unknown workshop", 404),
    );
    const original = raw;
    view();
    expect(await screen.findByRole("note")).toHaveTextContent(
      "no longer available",
    );
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByText("Back up or manage saved answers"));
    expect(
      screen.getByRole("button", { name: "Download answers" }),
    ).toBeEnabled();
    expect(raw).toBe(original);
  });
  it("retries backend errors without falling back to a guessed case route", async () => {
    vi.mocked(api.topic).mockRejectedValueOnce(new ApiClientError("Offline"));
    const cases = vi.spyOn(api, "caseStudy");
    view();
    expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
    expect(cases).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("link", { name: "Continue saved work" }),
    ).toBeVisible();
  });
  it("ignores late responses after choosing a different saved module", async () => {
    setup([
      saved,
      {
        ...saved,
        topicId: "url-shortener",
        activityId: "requirements-attempt",
        updatedAt: "2026-10-09T01:00:00.000Z",
      },
    ]);
    let resolve!: (value: TopicDetail) => void;
    vi.mocked(api.topic).mockImplementation((id) =>
      id === "request-flow"
        ? new Promise((done) => {
            resolve = done;
          })
        : Promise.reject(new ApiClientError("Unknown topic", 404)),
    );
    vi.spyOn(api, "caseStudy").mockResolvedValue(caseStudy);
    view();
    fireEvent.change(screen.getByRole("combobox", { name: "Saved module" }), {
      target: { value: "url-shortener" },
    });
    expect(
      await screen.findByRole("link", { name: "Continue saved work" }),
    ).toHaveAttribute("href", "/case-studies/url-shortener?stage=requirements");
    await act(async () => resolve(topic));
    expect(
      screen.getByRole("link", { name: "Continue saved work" }),
    ).toHaveAttribute("href", "/case-studies/url-shortener?stage=requirements");
  });
  it("warns visibly about session-only answers and preserves the prior durable value", async () => {
    setup([saved], true);
    const original = raw;
    store.save({
      ...saved,
      answer: { kind: "text", text: "Session revision" },
    });
    view();
    expect(screen.getByRole("note")).toHaveTextContent("session only");
    await screen.findByRole("link", { name: "Continue saved work" });
    expect(raw).toBe(original);
  });
  it("shows storage recovery tools even if previous data is corrupt and no answers can be read", () => {
    raw = "{broken";
    view();
    expect(screen.getByRole("note")).toHaveTextContent(
      "Previous saved data has not been replaced",
    );
    fireEvent.click(screen.getByText("Back up or manage saved answers"));
    expect(
      screen.getByRole("button", { name: "Download previous data" }),
    ).toBeEnabled();
    expect(raw).toBe("{broken");
  });
});
