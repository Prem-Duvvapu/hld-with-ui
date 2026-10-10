import type { CatalogEntry, LearningPathStep } from "../../api/types";
import type { PracticeAnswer } from "./practiceStorage";

export function pathEvidence(
  step: LearningPathStep,
  answers: readonly PracticeAnswer[],
) {
  let answered = 0,
    viewed = 0,
    earlier = 0;
  if (!step.available || step.entry?.status !== "published")
    return { answered, viewed, earlier };
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
    )
      answered++;
  }
  return { answered, viewed, earlier };
}

export function pathModuleLink(entry: CatalogEntry) {
  const base = `/${entry.kind === "topic" ? "topics" : "case-studies"}/${encodeURIComponent(entry.id)}`;
  return entry.kind === "topic" && entry.capabilities.includes("study")
    ? `${base}?view=study`
    : base;
}
