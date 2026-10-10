import type { CatalogEntry, LearningPathStep } from "../../api/types";
import type { CompletionRecord } from "./completionStorage";
import type { PracticeAnswer } from "./practiceStorage";

export function pathEvidence(
  step: LearningPathStep,
  answers: readonly PracticeAnswer[],
  records: readonly CompletionRecord[] = [],
) {
  let answered = 0,
    viewed = 0,
    earlier = 0,
    reviewed = 0;
  const reading = Boolean(
    step.available &&
    step.entry?.status === "published" &&
    records.some(
      (record) =>
        record.kind === "reading" &&
        record.moduleId === step.moduleId &&
        record.contentVersion === step.entry?.contentVersion,
    ),
  );
  if (!step.available || step.entry?.status !== "published")
    return { answered, viewed, earlier, reading, reviewed };
  for (const saved of answers) {
    if (saved.topicId !== step.moduleId) continue;
    const meaningful =
      saved.referenceViewed ||
      (saved.answer.kind === "text"
        ? saved.answer.text.trim().length > 0
        : saved.answer.optionId !== null);
    if (!meaningful) continue;
    const activity = step.activities.find(
      (item) => item.id === saved.activityId,
    );
    const compatible =
      activity &&
      saved.answer.kind === activity.kind &&
      (saved.answer.kind === "text" ||
        saved.answer.optionId === null ||
        activity.optionIds.includes(saved.answer.optionId));
    if (!compatible || saved.contentVersion !== step.entry.contentVersion) {
      earlier++;
      continue;
    }
    if (saved.referenceViewed) viewed++;
    if (
      saved.answer.kind === "text"
        ? saved.answer.text.trim().length > 0
        : saved.answer.optionId !== null
    ) {
      answered++;
      if (
        records.some(
          (record) =>
            record.kind === "practice" &&
            sameReviewedAnswer(record.answer, saved),
        )
      )
        reviewed++;
    }
  }
  return { answered, viewed, earlier, reading, reviewed };
}

export function pathModuleLink(entry: CatalogEntry) {
  const base = `/${entry.kind === "topic" ? "topics" : "case-studies"}/${encodeURIComponent(entry.id)}`;
  return entry.kind === "topic" && entry.capabilities.includes("study")
    ? `${base}?view=study`
    : base;
}

function sameReviewedAnswer(a: PracticeAnswer, b: PracticeAnswer) {
  return (
    a.topicId === b.topicId &&
    a.activityId === b.activityId &&
    a.contentVersion === b.contentVersion &&
    a.updatedAt === b.updatedAt &&
    a.referenceViewed === b.referenceViewed &&
    (a.answer.kind === "text" && b.answer.kind === "text"
      ? a.answer.text === b.answer.text
      : a.answer.kind === "choice" &&
        b.answer.kind === "choice" &&
        a.answer.optionId === b.answer.optionId)
  );
}
export function currentPathAnswers(
  step: LearningPathStep,
  answers: readonly PracticeAnswer[],
) {
  if (!step.available || step.entry?.status !== "published") return [];
  return answers.filter((saved) => {
    const activity = step.activities.find(
      (item) => item.id === saved.activityId,
    );
    return (
      saved.topicId === step.moduleId &&
      saved.contentVersion === step.entry?.contentVersion &&
      activity &&
      saved.answer.kind === activity.kind &&
      (saved.answer.kind === "text"
        ? saved.answer.text.trim().length > 0
        : saved.answer.optionId !== null &&
          activity.optionIds.includes(saved.answer.optionId))
    );
  });
}
