import catalog from "../../../content/catalog.json";
import questions from "../../../content/topics/timeouts-retries/questions.json";
import checkpoints from "../../../content/topics/timeouts-retries/checkpoints.json";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiClientError } from "../api/client";
import type { TopicDetail } from "../api/types";
import { descriptor } from "../api/retryTestFixtures";
import { RetryPage } from "./RetryPage";
vi.mock("../api/client", async (original) => ({
  ...(await original<typeof import("../api/client")>()),
  api: { draftTopic: vi.fn(), retryDescriptor: vi.fn(), runRetry: vi.fn() },
}));
const topic: TopicDetail = {
  topic: catalog.find(
    (entry) => entry.id === "timeouts-retries",
  )! as TopicDetail["topic"],
  lessonMarkdown: "# Timeouts\n\nCaller patience and server work are separate.",
  questions: questions as TopicDetail["questions"],
  checkpoints: checkpoints as TopicDetail["checkpoints"],
};
const view = (route = "/draft/topics/timeouts-retries") =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <RetryPage />
    </MemoryRouter>,
  );
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.draftTopic).mockResolvedValue(topic);
  vi.mocked(api.retryDescriptor).mockResolvedValue(descriptor);
});
it("shows all six implemented draft views and never runs on load", async () => {
  view();
  expect(
    await screen.findByRole("region", { name: "Draft retry module" }),
  ).toBeVisible();
  expect(screen.getAllByRole("tab")).toHaveLength(6);
  for (const label of ["Guided", "Architecture", "Request sequence"])
    expect(screen.getByRole("tab", { name: label })).toBeVisible();
  expect(api.runRetry).not.toHaveBeenCalled();
  expect(api.draftTopic).toHaveBeenCalledWith("timeouts-retries");
});
it("honors Study deep links and retains edited input and prediction across tabs", async () => {
  view("/draft/topics/timeouts-retries?view=study");
  expect(
    await screen.findByRole("heading", {
      name: "A caller timeout does not cancel accepted server work.",
    }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: /Playground/ }));
  fireEvent.change(screen.getByLabelText("Attempt timeout (ms)"), {
    target: { value: "100" },
  });
  fireEvent.change(screen.getByLabelText("Your retry prediction (optional)"), {
    target: { value: "No retry is needed here." },
  });
  fireEvent.click(screen.getByRole("tab", { name: /Practice/ }));
  fireEvent.click(screen.getByRole("tab", { name: /Playground/ }));
  expect(screen.getByLabelText("Attempt timeout (ms)")).toHaveValue(100);
  expect(screen.getByLabelText("Your retry prediction (optional)")).toHaveValue(
    "No retry is needed here.",
  );
  expect(api.runRetry).not.toHaveBeenCalled();
});
it("retains a local loading error and retries descriptor/content together", async () => {
  vi.mocked(api.retryDescriptor).mockRejectedValueOnce(
    new Error("Retry descriptor unavailable"),
  );
  view();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Retry descriptor unavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("region", { name: "Draft retry module" }),
  ).toBeVisible();
});
it("shows a missing draft without substituting a module", async () => {
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
    screen.queryByRole("button", { name: "Run retry experiment" }),
  ).not.toBeInTheDocument();
});
it("rejects incompatible topic publication or a non-array simulation reference", async () => {
  vi.mocked(api.draftTopic).mockResolvedValueOnce({
    ...topic,
    topic: { ...topic.topic, simulationIds: "timeouts-retries" },
  } as unknown as TopicDetail);
  view();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "draft retry module is incompatible",
  );
  expect(
    screen.queryByRole("button", { name: "Run retry experiment" }),
  ).not.toBeInTheDocument();
});

it("rejects an empty Practice payload instead of advertising an unusable Practice view", async () => {
  vi.mocked(api.draftTopic).mockResolvedValueOnce({ ...topic, questions: [] });
  view();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "draft retry module is incompatible",
  );
  expect(
    screen.queryByRole("tab", { name: /Practice/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Run retry experiment" }),
  ).not.toBeInTheDocument();
});

it("rejects missing Guided capability and empty or wrong-model checkpoints", async () => {
  for (const incompatible of [
    {
      ...topic,
      topic: {
        ...topic.topic,
        capabilities: topic.topic.capabilities.filter(
          (capability) => capability !== "guided",
        ),
      },
    },
    { ...topic, checkpoints: [] },
    {
      ...topic,
      checkpoints: [
        { ...topic.checkpoints[0]!, simulationId: "queues-tail-latency" },
      ],
    },
  ]) {
    vi.mocked(api.draftTopic).mockResolvedValueOnce(incompatible);
    const page = view();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "draft retry module is incompatible",
    );
    expect(
      screen.queryByRole("button", { name: "Run retry experiment" }),
    ).not.toBeInTheDocument();
    page.unmount();
  }
});
it("opens authored design deep links without running Java", async () => {
  view("/draft/topics/timeouts-retries?view=sequence");
  expect(
    await screen.findByRole("region", { name: "Selected retry path step" }),
  ).toBeVisible();
  expect(screen.getByRole("tab", { name: "Request sequence" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(api.runRetry).not.toHaveBeenCalled();
});
