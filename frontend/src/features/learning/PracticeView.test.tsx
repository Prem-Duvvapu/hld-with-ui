import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Question } from "../../api/types";
import {
  createPracticeStore,
  serializeAnswers,
  type PracticeAnswer,
} from "./practiceStorage";
import { PracticeView } from "./PracticeView";

let store: ReturnType<typeof createPracticeStore>;
vi.mock("./practiceStorage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./practiceStorage")>()),
  getPracticeStore: () => store,
}));

const choice: Question = {
  id: "queue-question",
  topicId: "request-flow",
  level: "beginner",
  kind: "prediction",
  prompt: "Why does a request wait?",
  options: [
    { id: "a", label: "Finite workers" },
    { id: "b", label: "Unlimited workers" },
  ],
  correctOptionId: "a",
  explanation: "Workers are occupied.",
};
const interview: Question = {
  id: "interview-question",
  topicId: "request-flow",
  level: "intermediate",
  kind: "design-decision",
  prompt: "Explain the tradeoff.",
  modelAnswer: "A bounded queue can reject overload.",
  rubric: ["State a failure."],
};
const record: PracticeAnswer = {
  topicId: "request-flow",
  activityId: interview.id,
  contentVersion: "1.0.0",
  updatedAt: "2026-10-07T00:00:00.000Z",
  answer: { kind: "text", text: "My saved explanation" },
  referenceViewed: true,
};
function makeStore(raw: string | null = null) {
  let current = raw;
  return createPracticeStore(() => ({
    getItem: () => current,
    setItem: (_key, value) => {
      current = value;
    },
  }));
}
const view = () => (
  <PracticeView
    topicId="request-flow"
    contentVersion="1.1.0"
    questions={[choice, interview]}
  />
);
beforeEach(() => {
  store = makeStore();
});

describe("saved practice answers", () => {
  it("restores revised explanations and reference state after unmount, without grading free text", () => {
    const rendered = render(view());
    fireEvent.change(screen.getByLabelText("Your explanation"), {
      target: { value: "The queue absorbs bursts." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Compare with a model answer" }),
    );
    fireEvent.change(screen.getByLabelText("Your explanation"), {
      target: { value: "Finite queues can reject overload." },
    });
    rendered.unmount();
    render(view());
    expect(screen.getByLabelText("Your explanation")).toHaveValue(
      "Finite queues can reject overload.",
    );
    expect(screen.getByText(interview.modelAnswer!)).toBeVisible();
    expect(screen.queryByText("That reasoning holds.")).not.toBeInTheDocument();
  });
  it("allows reading a reference without claiming a written attempt", () => {
    render(view());
    fireEvent.click(
      screen.getByRole("button", { name: "Compare with a model answer" }),
    );
    expect(store.getSnapshot().answers[0]?.answer).toEqual({
      kind: "text",
      text: "",
    });
    expect(screen.getByText(interview.modelAnswer!)).toBeVisible();
  });
  it("restores a chosen option and permits a fresh attempt", () => {
    const rendered = render(view());
    fireEvent.click(screen.getByRole("radio", { name: /Finite workers/ }));
    rendered.unmount();
    render(view());
    expect(screen.getByRole("radio", { name: /Finite workers/ })).toBeChecked();
    expect(screen.getByText("Workers are occupied.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      screen.getByRole("radio", { name: /Finite workers/ }),
    ).not.toBeChecked();
    expect(screen.queryByText("Workers are occupied.")).not.toBeInTheDocument();
  });
  it("keeps older text but requires a new reference comparison for the current content", () => {
    store = makeStore(serializeAnswers([record]));
    render(view());
    expect(screen.getByLabelText("Your explanation")).toHaveValue(
      record.answer.kind === "text" ? record.answer.text : "",
    );
    expect(screen.getByRole("note")).toHaveTextContent("content v1.0.0");
    expect(screen.queryByText(interview.modelAnswer!)).not.toBeInTheDocument();
    expect(store.getSnapshot().answers[0]?.contentVersion).toBe("1.0.0");
    fireEvent.click(
      screen.getByRole("button", { name: "Compare with a model answer" }),
    );
    expect(store.getSnapshot().answers[0]?.contentVersion).toBe("1.1.0");
    expect(screen.getByText(interview.modelAnswer!)).toBeVisible();
  });
  it("preserves retired choices and offers an explicit review of still-valid older choices", () => {
    store = makeStore(
      serializeAnswers([
        {
          ...record,
          activityId: choice.id,
          answer: { kind: "choice", optionId: "retired-option" },
        },
      ]),
    );
    const rendered = render(view());
    expect(
      screen.getByText(/previous choice \(retired-option\)/),
    ).toBeVisible();
    expect(screen.queryByText("Workers are occupied.")).not.toBeInTheDocument();
    rendered.unmount();
    store = makeStore(
      serializeAnswers([
        {
          ...record,
          activityId: choice.id,
          answer: { kind: "choice", optionId: "a" },
        },
      ]),
    );
    render(view());
    expect(screen.queryByText("Workers are occupied.")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Review saved choice" }),
    );
    expect(screen.getByText("Workers are occupied.")).toBeVisible();
  });
  it("makes storage failures visible while editing remains usable", () => {
    store = createPracticeStore(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    render(view());
    expect(
      screen.getByText("Answers are kept for this session only"),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Your explanation"), {
      target: { value: "Keep this answer in memory." },
    });
    expect(
      screen.getByRole("button", { name: "Download answers" }),
    ).toBeEnabled();
    expect(screen.getByLabelText("Your explanation")).toHaveValue(
      "Keep this answer in memory.",
    );
  });
});
