import checkpointFixture from "../../../content/topics/queues-tail-latency/checkpoints.json";
import catalogFixture from "../../../content/catalog.json";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiClientError } from "../api/client";
import type { TopicDetail } from "../api/types";
import { descriptor } from "../features/queues/queueTestFixtures";
import { QueueCapacityPage } from "./QueueCapacityPage";
vi.mock("../api/client", async (original) => ({
  ...(await original<typeof import("../api/client")>()),
  api: { draftTopic: vi.fn(), queueDescriptor: vi.fn(), runQueue: vi.fn() },
}));
const topic: TopicDetail = {
  topic: catalogFixture.find(
    (entry) => entry.id === "queues-tail-latency",
  )! as TopicDetail["topic"],
  lessonMarkdown: "# Queues\n\nA buffer buys time; workers do the work.",
  questions: [],
  checkpoints: checkpointFixture as TopicDetail["checkpoints"],
};
function view(route = "/draft/topics/queues-tail-latency") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <QueueCapacityPage />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.draftTopic).mockResolvedValue(topic);
  vi.mocked(api.queueDescriptor).mockResolvedValue(descriptor);
});
it("exposes all six implemented draft tabs with no bookmark or automatic run", async () => {
  view();
  expect(
    await screen.findByRole("region", { name: "Draft queue module" }),
  ).toBeVisible();
  expect(screen.getAllByRole("tab")).toHaveLength(6);
  expect(
    screen.queryByRole("button", { name: "Save module" }),
  ).not.toBeInTheDocument();
  expect(api.runQueue).not.toHaveBeenCalled();
  expect(api.draftTopic).toHaveBeenCalledWith("queues-tail-latency");
});
it("keeps an edited workload and prediction across tab navigation and honors a Study deep link", async () => {
  view("/draft/topics/queues-tail-latency?view=study");
  expect(
    await screen.findByRole("heading", {
      name: "A buffer buys time; workers do the work.",
    }),
  ).toBeVisible();
  expect(screen.getByRole("tab", { name: /Study/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  fireEvent.click(screen.getByRole("tab", { name: /Playground/ }));
  fireEvent.change(screen.getByLabelText("Workers", { exact: true }), {
    target: { value: "3" },
  });
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Less waiting with more workers." },
  });
  fireEvent.click(screen.getByRole("tab", { name: /Study/ }));
  fireEvent.click(screen.getByRole("tab", { name: /Playground/ }));
  expect(screen.getByLabelText("Workers", { exact: true })).toHaveValue(3);
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Less waiting with more workers.",
  );
  expect(api.runQueue).not.toHaveBeenCalled();
});
it("shows missing draft as not found and retries genuine loading errors", async () => {
  vi.mocked(api.draftTopic).mockRejectedValueOnce(
    new ApiClientError("Content could not load.", 503),
  );
  view();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Content could not load",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("region", { name: "Draft queue module" }),
  ).toBeVisible();
});
it("renders a 404 instead of a substitute topic", async () => {
  vi.mocked(api.draftTopic).mockRejectedValue(
    new ApiClientError("Unknown draft", 404),
  );
  view();
  expect(
    await screen.findByRole("heading", {
      name: "That route is outside the system.",
    }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Run queue simulation" }),
  ).not.toBeInTheDocument();
});
it("rejects a published or wrong-topic payload at the draft boundary", async () => {
  vi.mocked(api.draftTopic).mockResolvedValue({
    ...topic,
    topic: { ...topic.topic, status: "published" },
  });
  view();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "draft queue module is incompatible",
  );
  expect(
    screen.queryByRole("button", { name: "Run queue simulation" }),
  ).not.toBeInTheDocument();
});
