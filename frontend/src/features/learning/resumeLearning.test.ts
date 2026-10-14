import reservationQuestions from "../../../../content/topics/transactions-isolation/questions.json";
import { describe, expect, it } from "vitest";
import catalog from "../../../../content/catalog.json";
import questions from "../../../../content/topics/request-flow/questions.json";
import checkpoints from "../../../../content/topics/cache-aside/checkpoints.json";
import queueCheckpoints from "../../../../content/topics/queues-tail-latency/checkpoints.json";
import deliveryCheckpoints from "../../../../content/topics/queues-delivery/checkpoints.json";
import deliveryQuestions from "../../../../content/topics/queues-delivery/questions.json";
import queueQuestions from "../../../../content/topics/queues-tail-latency/questions.json";
import workshop from "../../../../content/case-studies/url-shortener/workshop.json";
import type {
  CaseStudyDetail,
  CatalogEntry,
  TopicDetail,
} from "../../api/types";
import type { PracticeAnswer } from "./practiceStorage";
import {
  latestSavedWork,
  draftTopicResumeTarget,
  supportsDraftTopicResume,
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
const queue = {
  topic: entries.find((entry) => entry.id === "queues-tail-latency")!,
  questions: queueQuestions,
  checkpoints: queueCheckpoints,
  lessonMarkdown: "An explicit draft queue lesson.",
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
  it("resumes only the supported draft topic at its exact authored practice question", () => {
    const record = {
      ...saved,
      topicId: queue.topic.id,
      activityId: queue.questions[0]!.id,
    };
    expect(supportsDraftTopicResume(record.topicId)).toBe(true);
    expect(draftTopicResumeTarget(record, queue)).toMatchObject({
      path: `/draft/topics/queues-tail-latency?view=practice&question=${record.activityId}`,
      activity: queue.questions[0]!.prompt,
      removed: false,
    });
    expect(
      draftTopicResumeTarget({ ...record, activityId: "retired" }, queue),
    ).toMatchObject({
      path: "/draft/topics/queues-tail-latency",
      removed: true,
    });
    expect(() => topicResumeTarget(record, queue)).toThrow(/unavailable/);
  });
  it("resumes a saved delivery Practice answer only at its authored draft destination", () => {
    const delivery = {
      topic: entries.find((entry) => entry.id === "queues-delivery")!,
      questions: deliveryQuestions,
      checkpoints: [],
      lessonMarkdown: "Separate broker and ledger boundaries.",
    } as TopicDetail;
    const record = {
      ...saved,
      topicId: "queues-delivery",
      activityId: delivery.questions[0]!.id,
    };
    expect(supportsDraftTopicResume(record.topicId)).toBe(true);
    expect(draftTopicResumeTarget(record, delivery)).toMatchObject({
      path: `/draft/topics/queues-delivery?view=practice&question=${record.activityId}`,
      removed: false,
    });
    expect(
      draftTopicResumeTarget(
        { ...record, activityId: "nonexistent-guided-prediction" },
        delivery,
      ),
    ).toMatchObject({ path: "/draft/topics/queues-delivery", removed: true });
    expect(() => topicResumeTarget(record, delivery)).toThrow(/unavailable/);
  });
  it.each(["prediction", "tradeoff"])(
    "resumes exact delivery checkpoint %s records without treating unknown suffixes as authored work",
    (suffix) => {
      const delivery = {
        topic: entries.find((entry) => entry.id === "queues-delivery")!,
        questions: deliveryQuestions,
        checkpoints: deliveryCheckpoints,
        lessonMarkdown: "Separate broker and ledger boundaries.",
      } as TopicDetail;
      const checkpoint = delivery.checkpoints[0]!;
      const record = {
        ...saved,
        topicId: delivery.topic.id,
        activityId: `${checkpoint.id}-${suffix}`,
      };
      expect(draftTopicResumeTarget(record, delivery)).toMatchObject({
        path: `/draft/topics/queues-delivery?view=guided&checkpoint=${checkpoint.id}`,
        activity: checkpoint.title,
        removed: false,
      });
      expect(
        draftTopicResumeTarget(
          { ...record, activityId: `${checkpoint.id}-extra-${suffix}` },
          delivery,
        ),
      ).toMatchObject({ path: "/draft/topics/queues-delivery", removed: true });
      expect(
        draftTopicResumeTarget(record, {
          ...delivery,
          topic: {
            ...delivery.topic,
            capabilities: ["study", "simulation", "practice"],
          },
        }),
      ).toMatchObject({ removed: true });
    },
  );
  it.each(["prediction", "tradeoff"])(
    "resumes the supported draft queue checkpoint from its %s record",
    (suffix) => {
      const checkpoint = queue.checkpoints[0]!;
      expect(
        draftTopicResumeTarget(
          {
            ...saved,
            topicId: queue.topic.id,
            activityId: `${checkpoint.id}-${suffix}`,
          },
          queue,
        ),
      ).toMatchObject({
        path: `/draft/topics/queues-tail-latency?view=guided&checkpoint=${checkpoint.id}`,
        activity: checkpoint.title,
        removed: false,
      });
      for (const activityId of [
        `${checkpoint.id}-extra-prediction`,
        `${checkpoint.id}-unknown`,
      ])
        expect(
          draftTopicResumeTarget(
            { ...saved, topicId: queue.topic.id, activityId },
            queue,
          ),
        ).toMatchObject({ removed: true });
    },
  );
  it("does not manufacture draft destinations from unsupported IDs or incompatible metadata", () => {
    const record = {
      ...saved,
      topicId: queue.topic.id,
      activityId: queue.questions[0]!.id,
    };
    expect(supportsDraftTopicResume("future-queue")).toBe(false);
    for (const status of ["published", "planned"] as const) {
      expect(() =>
        draftTopicResumeTarget(record, {
          ...queue,
          topic: { ...queue.topic, status },
        } as unknown as TopicDetail),
      ).toThrow(/unavailable/);
    }
    expect(() =>
      draftTopicResumeTarget(
        { ...record, topicId: "future-queue" },
        {
          ...queue,
          topic: { ...queue.topic, id: "future-queue" },
        },
      ),
    ).toThrow(/unavailable/);
    expect(() =>
      draftTopicResumeTarget(record, {
        ...queue,
        topic: { ...queue.topic, capabilities: ["study"] },
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

it("resumes an actual reservation draft question through its implemented route", () => {
  const reservation = {
    topic: entries.find((entry) => entry.id === "transactions-isolation")!,
    questions: reservationQuestions,
    checkpoints: [],
    lessonMarkdown: "Reservation evidence.",
  } as TopicDetail;
  const record = {
    ...saved,
    topicId: reservation.topic.id,
    activityId: reservationQuestions[1]!.id,
    contentVersion: "1.0.0",
  };
  expect(supportsDraftTopicResume(record.topicId)).toBe(true);
  expect(draftTopicResumeTarget(record, reservation)).toMatchObject({
    path: `/draft/topics/transactions-isolation?view=practice&question=${record.activityId}`,
    activity: reservationQuestions[1]!.prompt,
    removed: false,
  });
});
