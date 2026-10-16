import atomicityInput from "../../../contracts/examples/transaction-atomicity-baseline-input.json";
import protectedInput from "../../../contracts/examples/transaction-atomicity-protected-input.json";
import conflictInput from "../../../contracts/examples/transaction-atomicity-conflict-input.json";
import atomicityResult from "../../../contracts/examples/transaction-atomicity-baseline-result.json";
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
import type { AtomicityDescriptor, TopicDetail } from "../api/types";
import {
  descriptor,
  protectedResult as reservationProtectedResult,
} from "../features/reservations/reservationTestFixtures";
import { protectedResult as atomicityProtectedResult } from "../features/atomicity/atomicityTestFixtures";
import { createPracticeStore } from "../features/learning/practiceStorage";
let store: ReturnType<typeof createPracticeStore>;
vi.mock("../features/learning/practiceStorage", async (original) => ({
  ...(await original<typeof import("../features/learning/practiceStorage")>()),
  getPracticeStore: () => store,
}));
import { ReservationPage } from "./ReservationPage";

vi.mock("../api/client", async (original) => ({
  ...(await original<typeof import("../api/client")>()),
  api: {
    draftTopic: vi.fn(),
    reservationDescriptor: vi.fn(),
    runReservation: vi.fn(),
    atomicityDescriptor: vi.fn(),
    runAtomicity: vi.fn(),
  },
}));
const atomicityDescriptor = {
  id: "transaction-atomicity",
  title: "Atomicity & Abort",
  kind: "simulation",
  modelVersion: "1.0.0",
  description: "Inspect related writes and abort.",
  limits: {
    maxInitialUnits: 20,
    minTransactions: 1,
    maxTransactions: 3,
    maxQuantity: 20,
    minSteps: 2,
    maxSteps: 12,
    maxIdLength: 32,
  },
  presets: [
    {
      id: "baseline",
      title: "Abort between separate writes",
      description: "What remains after stock changes?",
      input: atomicityInput,
    },
    {
      id: "protected-baseline",
      title: "Discard unpublished stock work",
      description: "What does private abort discard?",
      input: protectedInput,
    },
    {
      id: "protected-conflict",
      title: "Two private proposals share one base",
      description: "Which proposal can publish?",
      input: conflictInput,
    },
  ],
  assumptions: atomicityResult.assumptions,
} as AtomicityDescriptor;
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
  store = createPracticeStore(() => ({
    getItem: () => null,
    setItem: () => {},
  }));
  vi.mocked(api.draftTopic).mockResolvedValue(topic);
  vi.mocked(api.reservationDescriptor).mockResolvedValue(descriptor);
  vi.mocked(api.atomicityDescriptor).mockResolvedValue(atomicityDescriptor);
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
    await screen.findByRole("region", { name: "Draft transaction module" }),
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
  await waitFor(() =>
    expect(document.title).toContain("Study · Transactions & Isolation"),
  );
});

it("preserves edited design and prediction across tabs and browser history without refetching", async () => {
  const router = view();
  await screen.findByRole("region", { name: "Draft transaction module" });
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
  expect(screen.getAllByLabelText("Your explanation")).toHaveLength(
    questions.length,
  );
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
    "Loading the draft transaction module",
  );
  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  await act(async () => reject(new ApiClientError("Model unavailable", 503)));
  expect(screen.getByRole("alert")).toHaveTextContent("Model unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("region", { name: "Draft transaction module" }),
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
    name: "non-array simulator references",
    value: {
      ...topic,
      topic: {
        ...topic.topic,
        simulationIds: "transactions-isolation,transaction-atomicity",
      },
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
    await screen.findByRole("region", { name: "Draft transaction module" });
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
  await screen.findByRole("region", { name: "Draft transaction module" });
  await act(async () => resolve(descriptor));
  expect(
    screen.getAllByRole("region", { name: "Draft transaction module" }),
  ).toHaveLength(1);
  expect(api.runReservation).not.toHaveBeenCalled();
});

it("loads atomicity only when selected and preserves independent experiment drafts through history", async () => {
  const router = view();
  await screen.findByRole("region", { name: "Draft transaction module" });
  expect(api.atomicityDescriptor).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Reservation 1 quantity"), {
    target: { value: "2" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Atomicity & abort/ }));
  const actor = await screen.findByLabelText("Transaction 1 quantity");
  fireEvent.change(actor, { target: { value: "3" } });
  expect(router.state.location.search).toBe("?experiment=atomicity");
  expect(api.atomicityDescriptor).toHaveBeenCalledTimes(1);
  expect(api.runAtomicity).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /^Reservation race/ }));
  expect(screen.getByLabelText("Reservation 1 quantity")).toHaveValue("2");
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.getByLabelText("Transaction 1 quantity")).toHaveValue("3");
  fireEvent.click(screen.getByRole("tab", { name: "Study" }));
  expect(router.state.location.search).toBe("?experiment=atomicity&view=study");
  fireEvent.click(screen.getByRole("tab", { name: "Playground" }));
  expect(screen.getByLabelText("Transaction 1 quantity")).toHaveValue("3");
  expect(api.atomicityDescriptor).toHaveBeenCalledTimes(1);
});

it("keeps reservation available when atomicity loading fails and retries only its descriptor", async () => {
  vi.mocked(api.atomicityDescriptor).mockRejectedValueOnce(
    new ApiClientError("Atomicity offline", 503),
  );
  view("/draft/topics/transactions-isolation?experiment=atomicity");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Atomicity offline",
  );
  fireEvent.click(screen.getByRole("button", { name: /^Reservation race/ }));
  expect(
    screen.getByRole("button", { name: "Run reservation schedule" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /^Atomicity & abort/ }));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByLabelText("Transaction 1 quantity")).toHaveValue(
    "1",
  );
  expect(api.reservationDescriptor).toHaveBeenCalledTimes(1);
  expect(api.draftTopic).toHaveBeenCalledTimes(1);
  expect(api.atomicityDescriptor).toHaveBeenCalledTimes(2);
});

it("explains an older backend's missing atomicity capability without fetching or substituting a model", async () => {
  vi.mocked(api.draftTopic).mockResolvedValue({
    ...topic,
    topic: { ...topic.topic, simulationIds: ["transactions-isolation"] },
  });
  view("/draft/topics/transactions-isolation?experiment=atomicity");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Atomicity is unavailable in this backend",
  );
  expect(api.atomicityDescriptor).not.toHaveBeenCalled();
  expect(api.runAtomicity).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "Run reservation schedule" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Reservation race/ }));
  expect(
    screen.getByRole("button", { name: "Run reservation schedule" }),
  ).toBeVisible();
});

it("keeps an unknown experiment visible as unavailable until an explicit choice", async () => {
  const router = view("/draft/topics/transactions-isolation?experiment=other");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This experiment is unavailable",
  );
  expect(router.state.location.search).toBe("?experiment=other");
  expect(api.atomicityDescriptor).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "Run reservation schedule" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Reservation race/ }));
  expect(router.state.location.search).toBe("");
});

it("opens atomicity architecture without fetching a descriptor or running either model", async () => {
  view(
    "/draft/topics/transactions-isolation?view=architecture&experiment=atomicity",
  );
  expect(
    await screen.findByRole("button", { name: /^Atomicity & abort/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await waitFor(() =>
    expect(screen.queryByRole("status")).not.toBeInTheDocument(),
  );
  expect(api.atomicityDescriptor).not.toHaveBeenCalled();
  expect(api.runAtomicity).not.toHaveBeenCalled();
  expect(api.runReservation).not.toHaveBeenCalled();
});

it("resumes an atomicity checkpoint without an experiment parameter and never auto-runs", async () => {
  const checkpoint = topic.checkpoints.find(
    (item) => item.simulationId === "transaction-atomicity",
  )!;
  const router = view(
    `/draft/topics/transactions-isolation?view=guided&checkpoint=${checkpoint.id}`,
  );
  expect(
    await screen.findByRole("heading", { name: checkpoint.title }),
  ).toBeVisible();
  expect(router.state.location.search).toContain("experiment=atomicity");
  expect(api.atomicityDescriptor).toHaveBeenCalledTimes(1);
  expect(api.runAtomicity).not.toHaveBeenCalled();
  expect(api.runReservation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("tab", { name: "Playground" }));
  expect(await screen.findByLabelText("Transaction 1 quantity")).toBeVisible();
  expect(api.atomicityDescriptor).toHaveBeenCalledTimes(1);
});

it("retains sibling Guided evidence without mixing identical protected-baseline preset IDs", async () => {
  vi.mocked(api.runReservation).mockResolvedValue(reservationProtectedResult);
  vi.mocked(api.runAtomicity).mockResolvedValue(atomicityProtectedResult);
  const reservation = topic.checkpoints.find(
    (item) => item.id === "read-is-preview",
  )!;
  const atomicity = topic.checkpoints.find(
    (item) =>
      item.simulationId === "transaction-atomicity" &&
      item.presetId === "protected-baseline",
  )!;
  const router = view(
    `/draft/topics/transactions-isolation?view=guided&checkpoint=${reservation.id}`,
  );
  await screen.findByRole("heading", { name: reservation.title });
  fireEvent.change(screen.getByRole("textbox", { name: /^Your prediction/ }), {
    target: { value: "The observation has not reserved stock." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
  await screen.findByRole("region", { name: "Selected reservation snapshot" });
  await act(async () => {
    await router.navigate(
      `/draft/topics/transactions-isolation?view=guided&experiment=atomicity&checkpoint=${atomicity.id}`,
    );
  });
  await screen.findByRole("heading", { name: atomicity.title });
  expect(
    screen.queryByRole("region", { name: "Selected atomicity snapshot" }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: /^Your prediction/ }), {
    target: { value: "Discard only private work." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
  await screen.findByRole("region", { name: "Selected atomicity snapshot" });
  expect(api.runReservation).toHaveBeenCalledTimes(1);
  expect(api.runAtomicity).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: /^Reservation race/ }));
  expect(
    screen.getByRole("region", { name: "Selected reservation snapshot" }),
  ).toBeVisible();
  expect(screen.getByRole("textbox", { name: /^Your prediction/ })).toHaveValue(
    "The observation has not reserved stock.",
  );
  fireEvent.click(screen.getByRole("button", { name: /^Atomicity & abort/ }));
  expect(
    screen.getByRole("region", { name: "Selected atomicity snapshot" }),
  ).toBeVisible();
  expect(screen.getByRole("textbox", { name: /^Your prediction/ })).toHaveValue(
    "Discard only private work.",
  );
  expect(api.atomicityDescriptor).toHaveBeenCalledTimes(1);
  expect(api.runAtomicity).toHaveBeenCalledTimes(1);
  expect(
    store
      .getSnapshot()
      .answers.every((answer) => answer.topicId === "transactions-isolation"),
  ).toBe(true);
});

it("shares a pending descriptor between Playground and Guided and keeps failures local", async () => {
  let resolve!: (value: AtomicityDescriptor) => void;
  vi.mocked(api.atomicityDescriptor).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  view("/draft/topics/transactions-isolation?experiment=atomicity");
  await screen.findByRole("tab", { name: "Guided" });
  fireEvent.click(screen.getByRole("tab", { name: "Guided" }));
  expect(api.atomicityDescriptor).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: /^Reservation race/ }));
  await act(async () => resolve(atomicityDescriptor));
  fireEvent.click(screen.getByRole("button", { name: /^Atomicity & abort/ }));
  expect(
    await screen.findByRole("heading", {
      name: topic.checkpoints.find(
        (item) => item.simulationId === "transaction-atomicity",
      )!.title,
    }),
  ).toBeVisible();
  expect(api.atomicityDescriptor).toHaveBeenCalledTimes(1);
  expect(api.runAtomicity).not.toHaveBeenCalled();
});
