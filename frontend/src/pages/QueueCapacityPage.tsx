import { useEffect, useState } from "react";
import { api, ApiClientError } from "../api/client";
import type { QueueCapacityDescriptor, TopicDetail } from "../api/types";
import { LoadingState, ErrorState } from "../components/AsyncState";
import { ModuleShell } from "../components/ModuleShell";
import { StudyView } from "../features/learning/StudyView";
import { PracticeView } from "../features/learning/PracticeView";
import { QueuePlayground } from "../features/queues/QueuePlayground";
import { NotFoundPage } from "./NotFoundPage";
const id = "queues-tail-latency";
export function QueueCapacityPage() {
  const [data, setData] = useState<{
    topic: TopicDetail;
    descriptor: QueueCapacityDescriptor;
  } | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([api.draftTopic(id), api.queueDescriptor()])
      .then(([topic, descriptor]) => {
        if (!active) return;
        if (
          topic.topic?.id !== id ||
          topic.topic.kind !== "topic" ||
          topic.topic.status !== "draft" ||
          !(["study", "simulation", "practice"] as const).every((capability) =>
            topic.topic.capabilities?.includes(capability),
          ) ||
          !topic.topic.simulationIds?.includes(id) ||
          typeof topic.lessonMarkdown !== "string" ||
          !topic.lessonMarkdown.trim() ||
          !Array.isArray(topic.questions) ||
          !Array.isArray(topic.checkpoints)
        ) {
          setError(
            "This draft queue module is incompatible with this app. Refresh and try again.",
          );
          return;
        }
        setData({ topic, descriptor });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiClientError && cause.status === 404)
          setMissing(true);
        else
          setError(
            cause instanceof Error
              ? cause.message
              : "This draft could not be loaded. Try again.",
          );
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (missing) return <NotFoundPage />;
  if (error)
    return (
      <div className="page-width standalone-state">
        <ErrorState
          message={error}
          retry={() => {
            setData(null);
            setError("");
            setMissing(false);
            setAttempt((previous) => previous + 1);
          }}
        />
      </div>
    );
  if (!data)
    return (
      <div className="page-width standalone-state">
        <LoadingState label="Loading the draft queue module" />
      </div>
    );
  return (
    <>
      <section
        className="queue-draft page-width"
        aria-label="Draft queue module"
      >
        <p className="eyebrow">Draft learning module</p>
        <p>
          Explore shared queues and worker capacity. This module is still under
          review and is available by direct link. It models waiting and
          rejection, not durable message delivery.
        </p>
      </section>
      <ModuleShell
        topic={data.topic.topic}
        tabs={[
          { id: "playground", label: "Playground" },
          { id: "study", label: "Study" },
          { id: "practice", label: "Practice" },
        ]}
        defaultView="playground"
        panels={{
          playground: <QueuePlayground descriptor={data.descriptor} />,
          study: (
            <StudyView
              markdown={data.topic.lessonMarkdown}
              title="A buffer buys time; workers do the work."
              guidance="Follow the worked example, change one condition, then explain the tradeoff in your own words. This is a shared worker queue, not a durable broker."
            />
          ),
          practice: (
            <PracticeView
              questions={data.topic.questions}
              topicId={id}
              contentVersion={data.topic.topic.contentVersion}
              topicTitle={data.topic.topic.title}
              title="Explain waiting and defend a mitigation"
              description="Use the trace to separate queue delay from service time. State when you would add workers, add waiting slots or reject work."
            />
          ),
        }}
      />
    </>
  );
}
