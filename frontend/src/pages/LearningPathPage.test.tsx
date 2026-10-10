import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import catalog from "../../../content/catalog.json";
import definitions from "../../../content/learning-paths.json";
import requestQuestions from "../../../content/topics/request-flow/questions.json";
import capacityQuestions from "../../../content/topics/capacity-estimation/questions.json";
import cacheQuestions from "../../../content/topics/cache-aside/questions.json";
import checkpoints from "../../../content/topics/cache-aside/checkpoints.json";
import type { CatalogEntry, LearningPath, Question } from "../api/types";
import { api, ApiClientError } from "../api/client";
import {
  createPracticeStore,
  serializeAnswers,
  type PracticeAnswer,
} from "../features/learning/practiceStorage";
import { LearningPathPage } from "./LearningPathPage";

const definition = definitions[0]!;
const entries = catalog as CatalogEntry[];
const questions = [
  ...requestQuestions,
  ...capacityQuestions,
  ...cacheQuestions,
] as Question[];
function fixture(): LearningPath {
  return {
    schemaVersion: 1,
    id: definition.id,
    title: definition.title,
    summary: definition.summary,
    steps: definition.steps.map((step) => {
      const entry = entries.find(
        (entry) => entry.id === step.moduleId && entry.status === "published",
      );
      const activities = questions
        .filter((question) => question.topicId === step.moduleId)
        .map((question) => ({
          id: question.id,
          kind: question.options?.length
            ? ("choice" as const)
            : ("text" as const),
          optionIds: question.options?.map((item) => item.id) ?? [],
        }));
      if (entry?.capabilities.includes("guided"))
        for (const checkpoint of checkpoints) {
          activities.push(
            { id: `${checkpoint.id}-prediction`, kind: "text", optionIds: [] },
            {
              id: `${checkpoint.id}-tradeoff`,
              kind: "choice",
              optionIds: checkpoint.tradeoff.options.map((item) => item.id),
            },
          );
        }
      return {
        ...step,
        available: !!entry,
        ...(entry ? { entry } : {}),
        activities: entry ? activities : [],
      };
    }),
    optionalModules: entries.filter(
      (entry) =>
        definition.optionalModuleIds.includes(entry.id) &&
        entry.status === "published",
    ),
  };
}
let raw: string | null;
let writes: ReturnType<typeof vi.fn<(key: string, value: string) => void>>;
let store: ReturnType<typeof createPracticeStore>;
vi.mock("../features/learning/practiceStorage", async (original) => ({
  ...(await original<typeof import("../features/learning/practiceStorage")>()),
  getPracticeStore: () => store,
}));
const saved = (overrides: Partial<PracticeAnswer> = {}): PracticeAnswer => ({
  topicId: "request-flow",
  activityId: "request-flow-interview",
  contentVersion: "1.1.0",
  updatedAt: "2026-10-10T00:00:00.000Z",
  answer: {
    kind: "text",
    text: "Waiting increases when arrival demand exceeds service capacity.",
  },
  referenceViewed: false,
  ...overrides,
});
function setup(records: PracticeAnswer[] = []) {
  raw = records.length ? serializeAnswers(records) : null;
  writes = vi.fn((_key: string, value: string) => {
    raw = value;
  });
  store = createPracticeStore(
    () => ({ getItem: () => raw, setItem: writes }),
    () => "2026-10-10T00:00:00.000Z",
  );
}
function view() {
  return render(
    <MemoryRouter initialEntries={[`/learning-paths/${definition.id}`]}>
      <Link to="/learning-paths/other">Other path</Link>
      <Routes>
        <Route path="/learning-paths/:id" element={<LearningPathPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
async function ready() {
  return screen.findByRole("list", { name: "Learning path steps" });
}
beforeEach(() => {
  setup();
  vi.spyOn(api, "learningPath").mockResolvedValue(fixture());
});
afterEach(() => vi.restoreAllMocks());

it("shows the canonical order, real prerequisites and optional depth without linking the draft or writing progress", async () => {
  view();
  const list = await ready();
  expect(
    within(list)
      .getAllByRole("listitem")
      .filter((item) => item.classList.contains("path-step")),
  ).toHaveLength(4);
  expect(
    screen.getByRole("link", { name: "Open suggested module" }),
  ).toHaveAttribute("href", "/topics/request-flow?view=study");
  expect(
    screen.getByRole("list", { name: "Prerequisites for Cache-Aside" }),
  ).toHaveTextContent("Request Flow & Load BalancingCapacity Estimation");
  expect(
    screen.getByRole("link", { name: "Distributed Rate Limiter" }),
  ).toHaveAttribute("href", "/topics/distributed-rate-limiter?view=study");
  expect(list.querySelector('a[href*="url-shortener"]')).toBeNull();
  expect(
    screen.getByLabelText("Path availability and saved reasoning"),
  ).toHaveTextContent("3 / 4 steps available0 steps have saved answers");
  expect(writes).not.toHaveBeenCalled();
});
it("separates saved answers from reference-only views and excludes old, retired and invalid activity records", async () => {
  const choice = requestQuestions.find((question) => question.options?.length)!;
  setup([
    saved(),
    saved({
      activityId: choice.id,
      answer: { kind: "choice", optionId: "removed-option" },
    }),
    saved({ activityId: "retired-activity" }),
    saved({
      topicId: "capacity-estimation",
      activityId: capacityQuestions[0]!.id,
      contentVersion: "0.1.0",
    }),
    saved({
      topicId: "cache-aside",
      activityId: `${checkpoints[0]!.id}-prediction`,
      answer: { kind: "text", text: "" },
      referenceViewed: true,
    }),
  ]);
  const original = raw;
  view();
  await ready();
  expect(
    screen.getByLabelText("Path availability and saved reasoning"),
  ).toHaveTextContent("1 step has saved answers");
  expect(
    screen.getByRole("link", { name: "Open suggested module" }),
  ).toHaveAttribute("href", "/topics/capacity-estimation?view=study");
  expect(
    screen.getByText(/2 earlier or unavailable activity records/),
  ).toBeVisible();
  expect(screen.getByText("1 reference view recorded")).toBeVisible();
  expect(raw).toBe(original);
  expect(writes).not.toHaveBeenCalled();
});
it("reacts to a real saved-answer mutation and reset without inferring completion", async () => {
  view();
  await ready();
  act(() => {
    store.save(saved());
  });
  expect(
    screen.getByRole("link", { name: "Open suggested module" }),
  ).toHaveAttribute("href", "/topics/capacity-estimation?view=study");
  act(() => {
    store.resetTopic("request-flow");
  });
  expect(
    screen.getByRole("link", { name: "Open suggested module" }),
  ).toHaveAttribute("href", "/topics/request-flow?view=study");
  expect(
    screen.getByText(/do not certify completion or mastery/),
  ).toBeVisible();
});
it("keeps session work visible when saving is denied without changing previous bytes", async () => {
  writes.mockImplementation(() => {
    throw new DOMException("Denied", "QuotaExceededError");
  });
  store.save(saved());
  view();
  await ready();
  expect(
    screen.getByText(/Your new answers are kept for this session only/),
  ).toBeVisible();
  expect(
    screen.getByLabelText("Path availability and saved reasoning"),
  ).toHaveTextContent("1 step has saved answers");
  expect(raw).toBeNull();
});
it("shows loading, retries a real API failure and gives the missing path a distinct state", async () => {
  vi.mocked(api.learningPath).mockRejectedValueOnce(
    new ApiClientError("Backend unavailable", 503),
  );
  view();
  expect(screen.getByRole("status")).toHaveTextContent("Loading learning path");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Backend unavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await ready();
  expect(screen.getByRole("heading", { name: definition.title })).toHaveFocus();
  vi.mocked(api.learningPath).mockRejectedValueOnce(
    new ApiClientError("Unknown path", 404),
  );
  fireEvent.click(screen.getByRole("link", { name: "Other path" }));
  expect(
    await screen.findByRole("heading", { name: "Learning path not found" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("list", { name: "Learning path steps" }),
  ).toBeNull();
  expect(writes).not.toHaveBeenCalled();
});
it("ignores a late response from the previous route", async () => {
  let finish!: (value: LearningPath) => void;
  vi.mocked(api.learningPath).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  vi.mocked(api.learningPath).mockRejectedValueOnce(
    new ApiClientError("Unknown", 404),
  );
  view();
  fireEvent.click(screen.getByRole("link", { name: "Other path" }));
  await screen.findByRole("heading", { name: "Learning path not found" });
  await act(async () => finish(fixture()));
  expect(
    screen.queryByRole("list", { name: "Learning path steps" }),
  ).toBeNull();
});
it("shows an honest empty availability state and does not open a fake destination", async () => {
  const empty = fixture();
  empty.steps = empty.steps.map((step) => ({
    moduleId: step.moduleId,
    purpose: step.purpose,
    available: false,
    activities: [],
  }));
  empty.optionalModules = [];
  vi.mocked(api.learningPath).mockResolvedValueOnce(empty);
  view();
  await ready();
  expect(screen.getByText(/No steps are published yet/)).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Open suggested module" }),
  ).toBeNull();
  expect(
    screen.getByLabelText("Path availability and saved reasoning"),
  ).toHaveTextContent("0 / 4 steps available");
});
it("rejects incompatible versions and advertised draft destinations", async () => {
  const invalid = fixture();
  invalid.steps[0]!.entry = { ...invalid.steps[0]!.entry!, status: "draft" };
  vi.mocked(api.learningPath).mockResolvedValueOnce(invalid);
  view();
  expect(await screen.findByRole("alert")).toHaveTextContent("incompatible");
  expect(
    screen.queryByRole("link", { name: "Open suggested module" }),
  ).toBeNull();
});

it("rejects an unsupported path schema without offering destinations", async () => {
  const invalid = Object.assign(fixture(), {
    schemaVersion: 2,
  }) as LearningPath;
  vi.mocked(api.learningPath).mockResolvedValueOnce(invalid);
  view();
  expect(await screen.findByRole("alert")).toHaveTextContent("incompatible");
  expect(
    screen.queryByRole("list", { name: "Learning path steps" }),
  ).toBeNull();
});
it("offers review when each available step has a current valid answer and rejects wrong-kind records", async () => {
  const path = fixture();
  setup(
    path.steps
      .filter((step) => step.available)
      .map((step) => {
        const activity = step.activities.find((item) => item.kind === "text")!;
        return saved({
          topicId: step.moduleId,
          activityId: activity.id,
          contentVersion: step.entry!.contentVersion,
        });
      }),
  );
  view();
  await ready();
  expect(screen.getByText("Revisit your reasoning")).toBeVisible();
  expect(
    screen.getByLabelText("Path availability and saved reasoning"),
  ).toHaveTextContent("3 steps have saved answers");
  act(() => {
    store.save(saved({ answer: { kind: "choice", optionId: "yes" } }));
  });
  expect(
    screen.getByLabelText("Path availability and saved reasoning"),
  ).toHaveTextContent("2 steps have saved answers");
  expect(
    screen.getByText(/1 earlier or unavailable activity record is/),
  ).toBeVisible();
});
