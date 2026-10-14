import checkpoints from "../../../content/topics/transactions-isolation/checkpoints.json";
import catalog from "../../../content/catalog.json";
import questions from "../../../content/topics/transactions-isolation/questions.json";
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
import { descriptor } from "../features/reservations/reservationTestFixtures";
import { ReservationPage } from "./ReservationPage";

vi.mock("../api/client", async (original) => ({
  ...(await original<typeof import("../api/client")>()),
  api: {
    draftTopic: vi.fn(),
    reservationDescriptor: vi.fn(),
    runReservation: vi.fn(),
  },
}));
const topic: TopicDetail = {
  topic: catalog.find(
    (entry) => entry.id === "transactions-isolation",
  )! as TopicDetail["topic"],
  lessonMarkdown:
    "# One unit, two readers\n\nKeep remaining stock and allocations consistent.",
  questions: questions as TopicDetail["questions"],
  checkpoints: checkpoints as TopicDetail["checkpoints"],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.draftTopic).mockResolvedValue(topic);
  vi.mocked(api.reservationDescriptor).mockResolvedValue(descriptor);
});
function view(route = "/draft/topics/transactions-isolation") {
  const router = createMemoryRouter(
    [
      {
        path: "/draft/topics/transactions-isolation",
        element: <ReservationPage />,
      },
    ],
    { initialEntries: [route] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

it("offers exactly six implemented draft views without auto-running or exposing a bookmark", async () => {
  view("/draft/topics/transactions-isolation?view=study");
  expect(
    await screen.findByRole("region", { name: "Draft reservation module" }),
  ).toBeVisible();
  expect(screen.getAllByRole("tab")).toHaveLength(6);
  expect(screen.getByRole("tab", { name: "Playground" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Practice" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Study" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(
    screen.getByRole("heading", { name: "One unit, two readers" }),
  ).toBeVisible();
  expect(screen.getByRole("tab", { name: "Guided" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Architecture" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Operation sequence" })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Save module" }),
  ).not.toBeInTheDocument();
  expect(api.draftTopic).toHaveBeenCalledExactlyOnceWith(
    "transactions-isolation",
  );
  expect(api.reservationDescriptor).toHaveBeenCalledTimes(1);
  expect(api.runReservation).not.toHaveBeenCalled();
  expect(document.title).toContain("Study · Transactions & Isolation");
});

it("preserves edited design and prediction across tabs and browser history without refetching", async () => {
  const router = view();
  await screen.findByRole("region", { name: "Draft reservation module" });
  fireEvent.change(screen.getByLabelText("Reservation 1 ID"), {
    target: { value: "team-a" },
  });
  fireEvent.change(screen.getByLabelText("Reservation 1 quantity"), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "A cannot reserve two from one unit." },
  });
  fireEvent.click(screen.getByRole("tab", { name: "Study" }));
  expect(router.state.location.search).toBe("?view=study");
  fireEvent.click(screen.getByRole("tab", { name: "Practice" }));
  expect(
    screen.getByRole("heading", {
      name: "Explain the race and defend the boundary",
    }),
  ).toBeVisible();
  expect(screen.getAllByLabelText("Your explanation")).toHaveLength(8);
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.getByRole("tab", { name: "Study" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.getByLabelText("Reservation 1 ID")).toHaveValue("team-a");
  expect(screen.getByLabelText("Reservation 1 quantity")).toHaveValue("2");
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "A cannot reserve two from one unit.",
  );
  expect(api.draftTopic).toHaveBeenCalledTimes(1);
  expect(api.reservationDescriptor).toHaveBeenCalledTimes(1);
  expect(api.runReservation).not.toHaveBeenCalled();
});

it("waits for both metadata requests and retries a genuine descriptor failure", async () => {
  let reject!: (reason: unknown) => void;
  vi.mocked(api.reservationDescriptor).mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  view();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Loading the draft reservation module",
  );
  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  await act(async () => reject(new ApiClientError("Model unavailable", 503)));
  expect(screen.getByRole("alert")).toHaveTextContent("Model unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("region", { name: "Draft reservation module" }),
  ).toBeVisible();
  expect(api.draftTopic).toHaveBeenCalledTimes(2);
  expect(api.reservationDescriptor).toHaveBeenCalledTimes(2);
  expect(api.runReservation).not.toHaveBeenCalled();
});

it("renders a missing draft as a real 404 without reservation controls", async () => {
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
  expect(
    screen.queryByRole("button", { name: "Run reservation schedule" }),
  ).not.toBeInTheDocument();
  expect(api.runReservation).not.toHaveBeenCalled();
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
    name: "case-study kind",
    value: { ...topic, topic: { ...topic.topic, kind: "case-study" } },
  },
  {
    name: "missing simulation capability",
    value: {
      ...topic,
      topic: { ...topic.topic, capabilities: ["study", "practice"] },
    },
  },
  {
    name: "missing practice capability",
    value: {
      ...topic,
      topic: { ...topic.topic, capabilities: ["study", "simulation"] },
    },
  },
  {
    name: "wrong simulator reference",
    value: {
      ...topic,
      topic: { ...topic.topic, simulationIds: ["data-access-models"] },
    },
  },
  {
    name: "advertised Guided without checkpoints",
    value: {
      ...topic,
      topic: {
        ...topic.topic,
        capabilities: topic.topic.capabilities,
      },
      checkpoints: [],
    },
  },
  {
    name: "checkpoints without Guided",
    value: {
      ...topic,
      topic: {
        ...topic.topic,
        capabilities: ["study", "simulation", "practice"],
      },
    },
  },
  { name: "empty lesson", value: { ...topic, lessonMarkdown: " " } },
  { name: "empty Practice", value: { ...topic, questions: [] } },
])(
  "rejects incompatible $name rather than advertising unavailable work",
  async ({ value }) => {
    vi.mocked(api.draftTopic).mockResolvedValue(value as TopicDetail);
    view();
    expect(await screen.findByRole("alert")).toHaveTextContent("incompatible");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Run reservation schedule" }),
    ).not.toBeInTheDocument();
    expect(api.runReservation).not.toHaveBeenCalled();
  },
);

it.each(["unknown"])(
  "normalizes unsupported %s deep links to Playground without executing Java",
  async (requested) => {
    const router = view(
      `/draft/topics/transactions-isolation?view=${requested}`,
    );
    await screen.findByRole("region", { name: "Draft reservation module" });
    expect(screen.getByRole("tab", { name: "Playground" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(api.runReservation).not.toHaveBeenCalled();
  },
);

it("ignores loading completion after a page unmount", async () => {
  let resolve!: (value: typeof descriptor) => void;
  vi.mocked(api.reservationDescriptor).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const old = render(
    <RouterProvider
      router={createMemoryRouter(
        [
          {
            path: "/draft/topics/transactions-isolation",
            element: <ReservationPage />,
          },
        ],
        { initialEntries: ["/draft/topics/transactions-isolation"] },
      )}
    />,
  );
  old.unmount();
  view();
  await screen.findByRole("region", { name: "Draft reservation module" });
  await act(async () => resolve(descriptor));
  expect(
    screen.getAllByRole("region", { name: "Draft reservation module" }),
  ).toHaveLength(1);
  expect(api.runReservation).not.toHaveBeenCalled();
});
