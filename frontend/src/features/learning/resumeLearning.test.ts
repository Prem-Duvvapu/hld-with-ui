import { describe, expect, it } from "vitest";
import catalog from "../../../../content/catalog.json";
import questions from "../../../../content/topics/request-flow/questions.json";
import checkpoints from "../../../../content/topics/cache-aside/checkpoints.json";
import workshop from "../../../../content/case-studies/url-shortener/workshop.json";
import type {
  CaseStudyDetail,
  CatalogEntry,
  TopicDetail,
} from "../../api/types";
import type { PracticeAnswer } from "./practiceStorage";
import {
  latestSavedWork,
  topicResumeTarget,
  workshopResumeTarget,
} from "./resumeLearning";

const entries = catalog as CatalogEntry[];
export const topic = {
  topic: entries.find((entry) => entry.id === "request-flow")!,
  questions,
  checkpoints: [],
  lessonMarkdown: "A lesson.",
} as TopicDetail;
const cache = {
  ...topic,
  topic: entries.find((entry) => entry.id === "cache-aside")!,
  questions: [],
  checkpoints,
} as TopicDetail;
export const caseStudy = {
  entry: entries.find((entry) => entry.id === "url-shortener")!,
  workshop,
} as CaseStudyDetail;
const saved: PracticeAnswer = {
  topicId: "request-flow",
  activityId: "request-flow-interview",
  contentVersion: "1.1.0",
  updatedAt: "2026-10-10T01:00:00.000Z",
  answer: { kind: "text", text: "My own reasoning." },
  referenceViewed: false,
};

describe("resume recorded learning work", () => {
  it("ignores empty unrevealed fields, keeps real choices/reference reading, and chooses one latest record per module without mutating data", () => {
    const records: PracticeAnswer[] = [
      saved,
      {
        ...saved,
        activityId: "empty",
        updatedAt: "2026-10-10T03:00:00.000Z",
        answer: { kind: "text", text: "  " },
      },
      {
        ...saved,
        activityId: "latest",
        updatedAt: "2026-10-10T02:00:00.000Z",
        answer: { kind: "choice", optionId: "a" },
      },
      {
        ...saved,
        topicId: "cache-aside",
        activityId: "warm-hit-prediction",
        answer: { kind: "text", text: "" },
        referenceViewed: true,
      },
      {
        ...saved,
        topicId: "ignored",
        answer: { kind: "choice", optionId: null },
      },
    ];
    const original = JSON.stringify(records);
    expect(latestSavedWork(records).map((record) => record.activityId)).toEqual(
      ["latest", "warm-hit-prediction"],
    );
    expect(JSON.stringify(records)).toBe(original);
    expect(latestSavedWork([])).toEqual([]);
  });
  it("breaks equal timestamps by stable semantic ID rather than imported array order", () => {
    const records = [
      saved,
      { ...saved, activityId: "a" },
      { ...saved, topicId: "cache-aside" },
    ];
    expect(latestSavedWork(records)).toEqual(
      latestSavedWork([...records].reverse()),
    );
    expect(latestSavedWork(records)[1]?.activityId).toBe("a");
  });
  it("resolves an actual practice question even when the saved content is older", () => {
    expect(
      topicResumeTarget({ ...saved, contentVersion: "0.9.0" }, topic),
    ).toMatchObject({
      path: "/topics/request-flow?view=practice&question=request-flow-interview",
      activity: questions.find((question) => question.id === saved.activityId)!
        .prompt,
      removed: false,
    });
  });
  it.each(["prediction", "tradeoff"])(
    "resolves the authored guided checkpoint from its %s record",
    (suffix) => {
      expect(
        topicResumeTarget(
          {
            ...saved,
            topicId: "cache-aside",
            activityId: `stale-hit-${suffix}`,
          },
          cache,
        ),
      ).toMatchObject({
        path: "/topics/cache-aside?view=guided&checkpoint=stale-hit",
        activity: "Stale hit",
        removed: false,
      });
    },
  );
  it("does not invent a destination when an activity or capability has been removed", () => {
    expect(
      topicResumeTarget({ ...saved, activityId: "retired-question" }, topic),
    ).toMatchObject({ path: "/topics/request-flow", removed: true });
    expect(
      topicResumeTarget(saved, {
        ...topic,
        topic: { ...topic.topic, capabilities: ["study"] },
      }),
    ).toMatchObject({ removed: true });
  });
  it("rejects unrelated or unpublished topic metadata", () => {
    expect(() =>
      topicResumeTarget({ ...saved, topicId: "different" }, topic),
    ).toThrow(/unavailable/);
    expect(() =>
      topicResumeTarget(saved, {
        ...topic,
        topic: { ...topic.topic, status: "draft" },
      }),
    ).toThrow(/unavailable/);
  });
  it.each(workshop.stages)(
    "resumes authored workshop stage $id using its original, revision and self-check records",
    (stage) => {
      for (const suffix of [
        "attempt",
        "revision",
        ...stage.rubric.map((item) => `check-${item.id}`),
      ]) {
        const result = workshopResumeTarget(
          {
            ...saved,
            topicId: workshop.id,
            activityId: `${stage.id}-${suffix}`,
          },
          caseStudy,
        );
        expect(result).toMatchObject({
          path: `/case-studies/url-shortener?stage=${stage.id}`,
          activity: stage.title,
          removed: false,
        });
        expect(result.entry.status).toBe("draft");
      }
    },
  );
  it("does not match unknown stage suffixes, prefix lookalikes, or retired rubrics", () => {
    for (const activityId of [
      "requirements-extra-attempt",
      "requirements-check-retired",
      "requirements-unknown",
      "retired-attempt",
    ])
      expect(
        workshopResumeTarget(
          { ...saved, topicId: workshop.id, activityId },
          caseStudy,
        ),
      ).toMatchObject({ path: "/case-studies/url-shortener", removed: true });
  });
  it("rejects mismatched case identity and content, and unimplemented planned workshops", () => {
    const record = { ...saved, topicId: workshop.id };
    expect(() =>
      workshopResumeTarget(record, {
        ...caseStudy,
        workshop: { ...caseStudy.workshop, id: "other" },
      }),
    ).toThrow(/incompatible/);
    expect(() =>
      workshopResumeTarget(record, {
        ...caseStudy,
        workshop: { ...caseStudy.workshop, contentVersion: "9.0.0" },
      }),
    ).toThrow(/incompatible/);
    expect(() =>
      workshopResumeTarget(record, {
        ...caseStudy,
        entry: {
          ...caseStudy.entry,
          status: "planned" as CatalogEntry["status"],
        },
      }),
    ).toThrow(/incompatible/);
  });
});
