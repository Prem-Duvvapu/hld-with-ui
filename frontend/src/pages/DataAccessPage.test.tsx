import catalog from "../../../content/catalog.json";
import questions from "../../../content/topics/data-access-models/questions.json";
import checkpoints from "../../../content/topics/data-access-models/checkpoints.json";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiClientError } from "../api/client";
import type { TopicDetail } from "../api/types";
import { descriptor } from "../features/data-access/dataAccessTestFixtures";
import { DataAccessPage } from "./DataAccessPage";

vi.mock("../api/client", async (original) => ({
  ...(await original<typeof import("../api/client")>()),
  api: {
    draftTopic: vi.fn(),
    dataAccessDescriptor: vi.fn(),
    runDataAccess: vi.fn(),
  },
}));
const topic: TopicDetail = {
  topic: catalog.find(
    (entry) => entry.id === "data-access-models",
  )! as TopicDetail["topic"],
  lessonMarkdown:
    "# Access patterns\n\nA query needs an access path; a write needs a rule.",
  questions: questions as TopicDetail["questions"],
  checkpoints: checkpoints as TopicDetail["checkpoints"],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.draftTopic).mockResolvedValue(topic);
  vi.mocked(api.dataAccessDescriptor).mockResolvedValue(descriptor);
});
function view(route = "/draft/topics/data-access-models") {
  const router = createMemoryRouter(
    [{ path: "/draft/topics/data-access-models", element: <DataAccessPage /> }],
    { initialEntries: [route] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

it("loads exactly six working draft views without running Java or exposing a bookmark", async () => {
  view("/draft/topics/data-access-models?view=study");
  expect(
    await screen.findByRole("region", { name: "Draft data-access module" }),
  ).toBeVisible();
  expect(screen.getAllByRole("tab")).toHaveLength(6);
  expect(screen.getByRole("tab", { name: /Architecture/ })).toBeVisible();
  expect(screen.getByRole("tab", { name: /Operation sequence/ })).toBeVisible();
  expect(screen.getByRole("tab", { name: /Guided/ })).toBeVisible();
  expect(screen.getByRole("tab", { name: /Playground/ })).toBeVisible();
  expect(screen.getByRole("tab", { name: /Practice/ })).toBeVisible();
  expect(screen.getByRole("tab", { name: /Study/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(
    screen.getByRole("heading", { name: "Access patterns" }),
  ).toBeVisible();
  expect(api.draftTopic).toHaveBeenCalledWith("data-access-models");
  expect(api.dataAccessDescriptor).toHaveBeenCalledTimes(1);
  expect(api.runDataAccess).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "Save module" }),
  ).not.toBeInTheDocument();
  await waitFor(() =>
    expect(document.title).toContain("Study · Data Models & Access Patterns"),
  );
});

it("keeps unsaved design and prediction through tabs and browser history without refetching", async () => {
  const router = view();
  await screen.findByRole("region", { name: "Draft data-access module" });
  fireEvent.change(screen.getByLabelText("Range end"), {
    target: { value: "40" },
  });
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Three matching records with the wider range." },
  });
  fireEvent.click(screen.getByRole("tab", { name: /Study/ }));
  expect(router.state.location.search).toBe("?view=study");
  fireEvent.click(screen.getByRole("tab", { name: /Practice/ }));
  expect(
    screen.getByRole("heading", {
      name: "Defend the data shape and its rules",
    }),
  ).toBeVisible();
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.getByRole("tab", { name: /Study/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.getByLabelText("Range end")).toHaveValue(40);
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Three matching records with the wider range.",
  );
  expect(api.draftTopic).toHaveBeenCalledTimes(1);
  expect(api.dataAccessDescriptor).toHaveBeenCalledTimes(1);
  expect(api.runDataAccess).not.toHaveBeenCalled();
});

it("shows loading until metadata arrives and retries a genuine descriptor failure", async () => {
  let reject!: (reason: unknown) => void;
  vi.mocked(api.dataAccessDescriptor).mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  view();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Loading the draft data-access module",
  );
  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  await act(async () => reject(new ApiClientError("Model unavailable", 503)));
  expect(screen.getByRole("alert")).toHaveTextContent("Model unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("region", { name: "Draft data-access module" }),
  ).toBeVisible();
  expect(api.draftTopic).toHaveBeenCalledTimes(2);
  expect(api.dataAccessDescriptor).toHaveBeenCalledTimes(2);
  expect(api.runDataAccess).not.toHaveBeenCalled();
});

it("renders a missing draft as a 404 instead of a broken playground", async () => {
  vi.mocked(api.draftTopic).mockRejectedValue(
    new ApiClientError("Unknown draft", 404),
  );
  view();
  expect(
    await screen.findByRole("heading", {
      name: "That route is outside the system.",
    }),
  ).toBeVisible();
  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  expect(api.runDataAccess).not.toHaveBeenCalled();
});

it.each([
  {
    name: "published metadata",
    value: { ...topic, topic: { ...topic.topic, status: "published" } },
  },
  {
    name: "another topic ID",
    value: { ...topic, topic: { ...topic.topic, id: "another-topic" } },
  },
  {
    name: "missing simulation capability",
    value: {
      ...topic,
      topic: { ...topic.topic, capabilities: ["study", "practice"] },
    },
  },
  {
    name: "missing advertised Guided checkpoints",
    value: { ...topic, checkpoints: [] },
  },
  { name: "empty lesson", value: { ...topic, lessonMarkdown: " " } },
])(
  "rejects incompatible $name without exposing controls",
  async ({ value }) => {
    vi.mocked(api.draftTopic).mockResolvedValue(value as TopicDetail);
    view();
    expect(await screen.findByRole("alert")).toHaveTextContent("incompatible");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Run access analysis" }),
    ).not.toBeInTheDocument();
    expect(api.runDataAccess).not.toHaveBeenCalled();
  },
);

it("normalizes an unavailable Guided deep link to Playground without running a model", async () => {
  vi.mocked(api.draftTopic).mockResolvedValue({
    ...topic,
    topic: {
      ...topic.topic,
      capabilities: topic.topic.capabilities.filter(
        (capability) => capability !== "guided",
      ),
    },
    checkpoints: [],
  });
  const router = view("/draft/topics/data-access-models?view=guided");
  await screen.findByRole("region", { name: "Draft data-access module" });
  expect(screen.getByRole("tab", { name: /Playground/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await waitFor(() => expect(router.state.location.search).toBe(""));
  expect(screen.queryByRole("tab", { name: /Guided/ })).not.toBeInTheDocument();
  expect(api.runDataAccess).not.toHaveBeenCalled();
});

it("opens an authored Guided deep link without running or revealing Java evidence", async () => {
  const checkpoint = topic.checkpoints[0]!;
  view(
    `/draft/topics/data-access-models?view=guided&checkpoint=${checkpoint.id}`,
  );
  expect(
    await screen.findByRole("heading", { name: checkpoint.title, level: 2 }),
  ).toBeVisible();
  expect(screen.getByRole("tab", { name: /Guided/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.queryByText(checkpoint.explanation)).not.toBeInTheDocument();
  expect(api.runDataAccess).not.toHaveBeenCalled();
});
