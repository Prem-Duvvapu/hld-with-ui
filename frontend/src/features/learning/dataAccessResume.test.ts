import { expect, it } from "vitest";
import catalog from "../../../../content/catalog.json";
import checkpoints from "../../../../content/topics/data-access-models/checkpoints.json";
import questions from "../../../../content/topics/data-access-models/questions.json";
import type { CatalogEntry, TopicDetail } from "../../api/types";
import {
  draftTopicResumeTarget,
  supportsDraftTopicResume,
} from "./resumeLearning";
it("resumes an actual data-access draft Practice answer at its authored question without advertising publication", () => {
  const topic: TopicDetail = {
    topic: catalog.find(
      (entry) => entry.id === "data-access-models",
    )! as CatalogEntry,
    lessonMarkdown: "A concrete access-pattern lesson.",
    questions: questions as TopicDetail["questions"],
    checkpoints: [],
  };
  const question = topic.questions[0]!;
  const target = draftTopicResumeTarget(
    {
      topicId: topic.topic.id,
      activityId: question.id,
      contentVersion: topic.topic.contentVersion,
      updatedAt: "2026-10-13T18:00:00.000Z",
      answer: { kind: "text", text: "My query and invariant explanation." },
      referenceViewed: false,
    },
    topic,
  );
  expect(supportsDraftTopicResume(topic.topic.id)).toBe(true);
  expect(target.path).toBe(
    `/draft/topics/data-access-models?view=practice&question=${question.id}`,
  );
  expect(target.entry.status).toBe("draft");
  expect(target.removed).toBe(false);
});

it("resumes an actual Guided prediction at its semantic checkpoint", () => {
  const topic: TopicDetail = {
    topic: catalog.find(
      (entry) => entry.id === "data-access-models",
    )! as CatalogEntry,
    lessonMarkdown: "Access evidence",
    questions: questions as TopicDetail["questions"],
    checkpoints: checkpoints as TopicDetail["checkpoints"],
  };
  const checkpoint = topic.checkpoints[4]!;
  const target = draftTopicResumeTarget(
    {
      topicId: topic.topic.id,
      activityId: `${checkpoint.id}-prediction`,
      contentVersion: topic.topic.contentVersion,
      updatedAt: "2026-10-13T19:00:00.000Z",
      answer: {
        kind: "text",
        text: "A primary ID differs from a business identity.",
      },
      referenceViewed: false,
    },
    topic,
  );
  expect(target.path).toBe(
    `/draft/topics/data-access-models?view=guided&checkpoint=${checkpoint.id}`,
  );
  expect(target.removed).toBe(false);
  expect(target.entry.status).toBe("draft");
});
