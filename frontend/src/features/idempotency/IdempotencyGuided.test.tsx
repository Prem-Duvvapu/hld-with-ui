import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import authored from "../../../../content/topics/idempotency/checkpoints.json";
import { api } from "../../api/client";
import {
  descriptor,
  input,
  result,
  pairs,
} from "../../api/idempotencyTestFixtures";
import type { GuidedCheckpoint, IdempotencyResult } from "../../api/types";
import { createPracticeStore } from "../learning/practiceStorage";
import { IdempotencyGuided } from "./IdempotencyGuided";
import { resolveIdempotencyCheckpoint } from "./checkpoints";
let store: ReturnType<typeof createPracticeStore>;
vi.mock("../learning/practiceStorage", async (original) => ({
  ...(await original<typeof import("../learning/practiceStorage")>()),
  getPracticeStore: () => store,
}));
vi.mock("../../api/client", () => ({ api: { runIdempotency: vi.fn() } }));
const checkpoints = authored as GuidedCheckpoint[],
  first = checkpoints[0]!;
const reveal = () =>
  fireEvent.click(screen.getByRole("button", { name: "Run and reveal" }));
const guided = (items = [first], contentVersion = "1.1.0") => (
  <IdempotencyGuided
    checkpoints={items}
    descriptor={descriptor}
    contentVersion={contentVersion}
  />
);
const fact = (scope: HTMLElement, label: string) =>
  within(scope)
    .getByText(label, { exact: true })
    .parentElement!.querySelector("dd")!;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.runIdempotency).mockResolvedValue(result);
  let raw: string | null = null;
  store = createPracticeStore(() => ({
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
    },
  }));
});
it("reveals only the selected lost-response prefix without future retry effects or whole-run metrics", async () => {
  render(guided());
  expect(api.runIdempotency).not.toHaveBeenCalled();
  reveal();
  await screen.findByText(first.explanation);
  expect(api.runIdempotency).toHaveBeenCalledExactlyOnceWith(input);
  expect(
    screen.getByRole("region", {
      name: "Selected idempotency checkpoint step",
    }),
  ).toHaveTextContent(result.outcomes[3]!.explanation);
  const snapshot = screen.getByRole("region", {
    name: "Selected idempotency snapshot",
  });
  expect(fact(snapshot, "Published units")).toHaveTextContent(/^1$/);
  expect(
    within(snapshot).getByRole("article", { name: "Call a" }),
  ).toHaveTextContent("No response received (lost)");
  expect(
    within(snapshot).getByRole("article", { name: "Call b" }),
  ).toHaveTextContent("Not started");
  expect(
    within(snapshot).queryByRole("listitem", { name: "Effect effect-b" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("region", {
      name: "Whole idempotency experiment summary",
    }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  expect(store.getSnapshot().answers[0]?.topicId).toBe("idempotency");
});
it.each(checkpoints)(
  "selects the actual Java state for $id by semantic step and kind",
  async (checkpoint) => {
    const pair = pairs.find((entry) => entry.id === checkpoint.presetId)!;
    vi.mocked(api.runIdempotency).mockResolvedValue(pair.result);
    render(guided([checkpoint]));
    reveal();
    await screen.findByText(checkpoint.explanation);
    expect(api.runIdempotency).toHaveBeenCalledExactlyOnceWith(pair.input);
    const position = resolveIdempotencyCheckpoint(
        pair.result.outcomes,
        checkpoint.target,
      ),
      outcome = pair.result.outcomes[position]!;
    const evidence = screen.getByRole("region", {
      name: "Selected idempotency checkpoint step",
    });
    expect(evidence).toHaveTextContent(outcome.stepId);
    expect(evidence).toHaveTextContent(outcome.kind);
    expect(evidence).toHaveTextContent(outcome.explanation);
    const snapshot = screen.getByRole("region", {
      name: "Selected idempotency snapshot",
    });
    expect(fact(snapshot, "Published units")).toHaveTextContent(
      new RegExp(`^${outcome.postState.publishedUnits}$`),
    );
    expect(fact(snapshot, "Active retained keys")).toHaveTextContent(
      new RegExp(`^${outcome.postState.activeKeyCount}$`),
    );
    expect(fact(snapshot, "Expired historical keys")).toHaveTextContent(
      new RegExp(`^${outcome.postState.expiredKeyCount}$`),
    );
    expect(
      within(snapshot)
        .getByRole("region", { name: "Public effect ledger" })
        .querySelectorAll("li"),
    ).toHaveLength(outcome.postState.effects.length);
  },
);
it("reuses one preset run while predictions remain separate activities", async () => {
  const repeated = {
    ...first,
    id: "idem-test-same-preset",
    title: "Explain the same lost response again",
  };
  render(guided([first, repeated]));
  reveal();
  await screen.findByText(first.explanation);
  fireEvent.click(screen.getByRole("button", { name: "Next checkpoint →" }));
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "The public write remains uncertain to its caller." },
  });
  reveal();
  await screen.findByRole("heading", {
    name: "Java evidence at this checkpoint",
  });
  expect(api.runIdempotency).toHaveBeenCalledTimes(1);
  expect(
    store
      .getSnapshot()
      .answers.some(
        (answer) => answer.activityId === `${repeated.id}-prediction`,
      ),
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "← Previous checkpoint" }),
  );
  expect(
    screen.getByLabelText(
      "Your prediction (revise it after seeing the evidence)",
    ),
  ).toHaveValue("");
});
it("withholds authored explanations and tradeoffs when the semantic target is missing", async () => {
  render(
    guided([
      {
        ...first,
        target: { stepId: "not-present", kind: "RESPONSE_LOST", occurrence: 1 },
      },
    ]),
  );
  reveal();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "no longer matches the Java evidence",
  );
  expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
  expect(screen.queryByText("4. Choose a tradeoff")).not.toBeInTheDocument();
  expect(store.getSnapshot().answers).toHaveLength(0);
});
it("discards pending evidence after topic reset and requires another explicit reveal", async () => {
  let resolve!: (value: IdempotencyResult) => void;
  vi.mocked(api.runIdempotency).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(guided());
  reveal();
  expect(
    screen.getByRole("button", { name: "Running the Java model…" }),
  ).toBeDisabled();
  act(() => {
    expect(store.resetTopic("idempotency").ok).toBe(true);
  });
  await act(async () => resolve(result));
  expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
  expect(store.getSnapshot().answers).toHaveLength(0);
  reveal();
  await screen.findByText(first.explanation);
  expect(api.runIdempotency).toHaveBeenCalledTimes(2);
});
it("preserves reasoning through an execution error and retries explicitly", async () => {
  vi.mocked(api.runIdempotency).mockRejectedValueOnce(
    new Error("The idempotency model is busy"),
  );
  render(guided());
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "A lost response cannot undo the public effect." },
  });
  reveal();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The idempotency model is busy",
  );
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "A lost response cannot undo the public effect.",
  );
  reveal();
  await screen.findByText(first.explanation);
  expect(api.runIdempotency).toHaveBeenCalledTimes(2);
});
it("restores local reasoning without a trace after remount and invalidates prior evidence on content version change", async () => {
  const page = render(guided());
  fireEvent.change(screen.getByLabelText("Your prediction (optional)"), {
    target: { value: "Keep my earlier explanation." },
  });
  reveal();
  await screen.findByText(first.explanation);
  page.rerender(guided([first], "1.2.0"));
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Keep my earlier explanation.",
  );
  expect(screen.getByRole("note")).toHaveTextContent("content v1.1.0");
  expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
  reveal();
  await screen.findByText(first.explanation);
  page.unmount();
  render(guided([first], "1.2.0"));
  expect(screen.getByLabelText("Your prediction (optional)")).toHaveValue(
    "Keep my earlier explanation.",
  );
  expect(screen.queryByText(first.explanation)).not.toBeInTheDocument();
  expect(api.runIdempotency).toHaveBeenCalledTimes(2);
});
