import catalog from "../../../content/catalog.json";
import questions from "../../../content/topics/idempotency/questions.json";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiClientError } from "../api/client";
import type { TopicDetail } from "../api/types";
import { descriptor, result } from "../api/idempotencyTestFixtures";
import { IdempotencyPage } from "./IdempotencyPage";
vi.mock("../api/client", async (original) => ({
  ...(await original<typeof import("../api/client")>()),
  api: {
    draftTopic: vi.fn(),
    getIdempotency: vi.fn(),
    runIdempotency: vi.fn(),
  },
}));
const topic: TopicDetail = {
  topic: catalog.find(
    (entry) => entry.id === "idempotency",
  )! as TopicDetail["topic"],
  lessonMarkdown:
    "# Idempotency\n\nReuse the original receipt within a stated publication boundary.",
  questions: questions as TopicDetail["questions"],
  checkpoints: [],
};
const view = (route = "/draft/topics/idempotency") =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <IdempotencyPage />
    </MemoryRouter>,
  );
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.draftTopic).mockResolvedValue(topic);
  vi.mocked(api.getIdempotency).mockResolvedValue(descriptor);
});
it("offers only the three implemented draft views and does not run on opening", async () => {
  view();
  expect(
    await screen.findByRole("region", { name: "Draft idempotency module" }),
  ).toBeVisible();
  expect(screen.getAllByRole("tab")).toHaveLength(3);
  for (const label of ["Playground", "Study", "Practice"])
    expect(screen.getByRole("tab", { name: label })).toBeVisible();
  expect(screen.queryByRole("tab", { name: "Guided" })).not.toBeInTheDocument();
  expect(api.runIdempotency).not.toHaveBeenCalled();
});
it("honors Study deep links and preserves unsaved inputs and prediction across supported tabs", async () => {
  view("/draft/topics/idempotency?view=study");
  expect(
    await screen.findByRole("heading", {
      name: "Reuse a result without repeating its effect.",
    }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "Playground" }));
  fireEvent.change(screen.getByLabelText("Result retention (ms)"), {
    target: { value: "321" },
  });
  fireEvent.change(
    screen.getByLabelText("Your idempotency prediction (optional)"),
    { target: { value: "The original receipt remains useful." } },
  );
  fireEvent.click(screen.getByRole("tab", { name: "Practice" }));
  fireEvent.click(screen.getByRole("tab", { name: "Playground" }));
  expect(screen.getByLabelText("Result retention (ms)")).toHaveValue("321");
  expect(
    screen.getByLabelText("Your idempotency prediction (optional)"),
  ).toHaveValue("The original receipt remains useful.");
  expect(api.runIdempotency).not.toHaveBeenCalled();
});
it("pauses explicit playback when its panel is hidden and does not resume it on return", async () => {
  vi.mocked(api.runIdempotency).mockResolvedValue(result);
  view();
  await screen.findByRole("region", { name: "Draft idempotency module" });
  fireEvent.click(
    screen.getByRole("button", { name: "Run idempotency experiment" }),
  );
  await screen.findByRole("region", {
    name: "Java idempotency simulation results",
  });
  vi.useFakeTimers();
  try {
    fireEvent.click(
      screen.getByRole("button", { name: "Play idempotency trace" }),
    );
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByLabelText("Idempotency snapshot position")).toHaveValue(
      "1",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Study" }));
    await act(async () => {
      vi.advanceTimersByTime(7000);
    });
    fireEvent.click(screen.getByRole("tab", { name: "Playground" }));
    expect(screen.getByLabelText("Idempotency snapshot position")).toHaveValue(
      "1",
    );
    expect(
      screen.getByRole("button", { name: "Play idempotency trace" }),
    ).toBeVisible();
    await act(async () => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.getByLabelText("Idempotency snapshot position")).toHaveValue(
      "1",
    );
  } finally {
    vi.useRealTimers();
  }
});
it("keeps a descriptor loading failure visible and retries content and descriptor explicitly", async () => {
  vi.mocked(api.getIdempotency).mockRejectedValueOnce(
    new Error("Descriptor unavailable"),
  );
  view();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Descriptor unavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("region", { name: "Draft idempotency module" }),
  ).toBeVisible();
  expect(api.getIdempotency).toHaveBeenCalledTimes(2);
  expect(api.runIdempotency).not.toHaveBeenCalled();
});
it("shows a missing draft without guessing a replacement", async () => {
  vi.mocked(api.draftTopic).mockRejectedValueOnce(
    new ApiClientError("Missing", 404),
  );
  view();
  expect(
    await screen.findByRole("heading", {
      name: "That route is outside the system.",
    }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Run idempotency experiment" }),
  ).not.toBeInTheDocument();
});
it("rejects incompatible topic capability, publication, empty Practice and malformed simulation references", async () => {
  for (const incompatible of [
    { ...topic, topic: { ...topic.topic, status: "published" } },
    { ...topic, questions: [] },
    { ...topic, topic: { ...topic.topic, capabilities: ["study"] } },
    { ...topic, topic: { ...topic.topic, simulationIds: "idempotency" } },
  ]) {
    vi.mocked(api.draftTopic).mockResolvedValueOnce(
      incompatible as unknown as TopicDetail,
    );
    const page = view();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "draft idempotency module is incompatible",
    );
    expect(
      screen.queryByRole("button", { name: "Run idempotency experiment" }),
    ).not.toBeInTheDocument();
    page.unmount();
  }
});
