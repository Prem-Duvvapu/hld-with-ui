import catalog from "../../../content/catalog.json";
import checkpoints from "../../../content/topics/queues-delivery/checkpoints.json";
import questions from "../../../content/topics/queues-delivery/questions.json";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiClientError } from "../api/client";
import type { TopicDetail } from "../api/types";
import { descriptor } from "../features/delivery/deliveryTestFixtures";
import { DeliveryPage } from "./DeliveryPage";
vi.mock("../api/client", async (original) => ({
  ...(await original<typeof import("../api/client")>()),
  api: {
    draftTopic: vi.fn(),
    deliveryDescriptor: vi.fn(),
    runDelivery: vi.fn(),
  },
}));
const topic: TopicDetail = {
  topic: catalog.find(
    (entry) => entry.id === "queues-delivery",
  )! as TopicDetail["topic"],
  lessonMarkdown:
    "# Separate facts\n\nA committed effect does not confirm an ACK.",
  questions: questions as TopicDetail["questions"],
  checkpoints: checkpoints as TopicDetail["checkpoints"],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.draftTopic).mockResolvedValue(topic);
  vi.mocked(api.deliveryDescriptor).mockResolvedValue(descriptor);
});
function view(route = "/draft/topics/queues-delivery") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <DeliveryPage />
    </MemoryRouter>,
  );
}
it("offers exactly six implemented draft tabs, with no run or bookmark on load, and keeps edited inputs across tabs", async () => {
  view("/draft/topics/queues-delivery?view=study");
  expect(
    await screen.findByRole("region", { name: "Draft delivery module" }),
  ).toBeVisible();
  expect(screen.getAllByRole("tab")).toHaveLength(6);
  expect(screen.getByRole("tab", { name: /Study/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(
    screen.queryByRole("button", { name: "Save module" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /Playground/ }));
  fireEvent.change(screen.getByLabelText("Processing time (ms)"), {
    target: { value: "123" },
  });
  fireEvent.click(screen.getByRole("tab", { name: /Study/ }));
  fireEvent.click(screen.getByRole("tab", { name: /Playground/ }));
  expect(screen.getByLabelText("Processing time (ms)")).toHaveValue(123);
  expect(api.runDelivery).not.toHaveBeenCalled();
});
it("retries a genuine descriptor loading failure", async () => {
  vi.mocked(api.deliveryDescriptor).mockRejectedValueOnce(
    new ApiClientError("Model unavailable", 503),
  );
  view();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Model unavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("region", { name: "Draft delivery module" }),
  ).toBeVisible();
});
it("renders an unknown draft as a genuine missing route", async () => {
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
    screen.queryByRole("button", { name: "Run delivery simulation" }),
  ).not.toBeInTheDocument();
});
it("rejects a published payload instead of silently exposing it as this draft", async () => {
  vi.mocked(api.draftTopic).mockResolvedValue({
    ...topic,
    topic: { ...topic.topic, status: "published" },
  });
  view();
  expect(await screen.findByRole("alert")).toHaveTextContent("incompatible");
  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
});

it("does not expose a nonfunctional Guided tab when its advertised checkpoints are missing", async () => {
  vi.mocked(api.draftTopic).mockResolvedValue({ ...topic, checkpoints: [] });
  view();
  expect(await screen.findByRole("alert")).toHaveTextContent("incompatible");
  expect(screen.queryByRole("tab", { name: /Guided/ })).toBeNull();
});
it("honors a direct Guided checkpoint link without automatically running or revealing its explanation", async () => {
  const checkpoint = topic.checkpoints[0]!;
  view(`/draft/topics/queues-delivery?view=guided&checkpoint=${checkpoint.id}`);
  expect(
    await screen.findByRole("heading", { name: checkpoint.title, level: 2 }),
  ).toBeVisible();
  expect(screen.getByRole("tab", { name: /Guided/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.queryByText(checkpoint.explanation)).toBeNull();
  expect(api.runDelivery).not.toHaveBeenCalled();
});
