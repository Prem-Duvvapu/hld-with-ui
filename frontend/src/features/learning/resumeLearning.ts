import type {
  CaseStudyDetail,
  CatalogEntry,
  TopicDetail,
} from "../../api/types";
import type { PracticeAnswer } from "./practiceStorage";

export type ResumeTarget = {
  entry: CatalogEntry;
  path: string;
  activity: string;
  removed: boolean;
};

// A visit and an empty, unrevealed field are not recorded learning work.
export function latestSavedWork(answers: readonly PracticeAnswer[]) {
  const meaningful = answers.filter(
    (record) =>
      record.referenceViewed ||
      (record.answer.kind === "text"
        ? record.answer.text.trim().length > 0
        : record.answer.optionId !== null),
  );
  const sorted = [...meaningful].sort((a, b) =>
    a.updatedAt === b.updatedAt
      ? `${a.topicId}/${a.activityId}` < `${b.topicId}/${b.activityId}`
        ? -1
        : 1
      : a.updatedAt > b.updatedAt
        ? -1
        : 1,
  );
  return sorted.filter(
    (record, index) =>
      sorted.findIndex((other) => other.topicId === record.topicId) === index,
  );
}

export function topicResumeTarget(
  saved: PracticeAnswer,
  detail: TopicDetail,
): ResumeTarget {
  const entry = detail?.topic;
  if (
    !entry ||
    entry.id !== saved.topicId ||
    entry.kind !== "topic" ||
    entry.status !== "published" ||
    !Array.isArray(entry.capabilities) ||
    !Array.isArray(detail.questions) ||
    !Array.isArray(detail.checkpoints)
  )
    throw new Error("This saved module is unavailable in the current catalog.");
  const base = `/topics/${encodeURIComponent(entry.id)}`;
  const question =
    entry.capabilities.includes("practice") &&
    detail.questions.find((item) => item.id === saved.activityId);
  if (question)
    return {
      entry,
      path: `${base}?${new URLSearchParams({ view: "practice", question: question.id })}`,
      activity: question.prompt,
      removed: false,
    };
  const checkpoint =
    entry.capabilities.includes("guided") &&
    detail.checkpoints.find((item) =>
      ["prediction", "tradeoff"].some(
        (suffix) => saved.activityId === `${item.id}-${suffix}`,
      ),
    );
  if (checkpoint)
    return {
      entry,
      path: `${base}?${new URLSearchParams({ view: "guided", checkpoint: checkpoint.id })}`,
      activity: checkpoint.title,
      removed: false,
    };
  return {
    entry,
    path: base,
    activity: "Open the current module",
    removed: true,
  };
}

export function workshopResumeTarget(
  saved: PracticeAnswer,
  detail: CaseStudyDetail,
): ResumeTarget {
  const entry = detail?.entry;
  const workshop = detail?.workshop;
  if (
    !entry ||
    !workshop ||
    !Array.isArray(entry.capabilities) ||
    !Array.isArray(workshop.stages) ||
    entry.id !== saved.topicId ||
    entry.kind !== "case-study" ||
    !entry.capabilities.includes("case-study") ||
    workshop.id !== entry.id ||
    workshop.schemaVersion !== 1 ||
    workshop.contentVersion !== entry.contentVersion ||
    workshop.stages.length === 0 ||
    !["draft", "published"].includes(entry.status)
  )
    throw new Error(
      "This saved workshop is unavailable or incompatible with this app.",
    );
  const base = `/case-studies/${encodeURIComponent(entry.id)}`;
  const stage = workshop.stages.find((item) =>
    [
      "attempt",
      "revision",
      ...(item.rubric ?? []).map((check) => `check-${check.id}`),
    ].some((suffix) => saved.activityId === `${item.id}-${suffix}`),
  );
  return {
    entry,
    path: stage ? `${base}?${new URLSearchParams({ stage: stage.id })}` : base,
    activity: stage?.title ?? "Open the current workshop",
    removed: !stage,
  };
}
