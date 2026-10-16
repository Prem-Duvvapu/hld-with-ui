import { useEffect, useState } from "react";
import { api, ApiClientError } from "../api/client";
import type { RetryDescriptor, TopicDetail } from "../api/types";
import { LoadingState, ErrorState } from "../components/AsyncState";
import { ModuleShell } from "../components/ModuleShell";
import { StudyView } from "../features/learning/StudyView";
import { PracticeView } from "../features/learning/PracticeView";
import { RetryPlayground } from "../features/retries/RetryPlayground";
import { NotFoundPage } from "./NotFoundPage";
const id = "timeouts-retries";
export function RetryPage() {
  const [data, setData] = useState<{
    topic: TopicDetail;
    descriptor: RetryDescriptor;
  } | null>(null);
  const [error, setError] = useState(""),
    [missing, setMissing] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([api.draftTopic(id), api.retryDescriptor()])
      .then(([topic, descriptor]) => {
        if (!active) return;
        if (
          topic.topic?.id !== id ||
          topic.topic.kind !== "topic" ||
          topic.topic.status !== "draft" ||
          !Array.isArray(topic.topic.capabilities) ||
          !(["study", "simulation", "practice"] as const).every((c) =>
            topic.topic.capabilities.includes(c),
          ) ||
          !Array.isArray(topic.topic.simulationIds) ||
          !topic.topic.simulationIds.includes(id) ||
          typeof topic.lessonMarkdown !== "string" ||
          !topic.lessonMarkdown.trim() ||
          !Array.isArray(topic.questions) ||
          topic.questions.length === 0 ||
          !Array.isArray(topic.checkpoints) ||
          descriptor.id !== id ||
          !descriptor.presets.some((p) => p.id === "late-work")
        ) {
          setError(
            "This draft retry module is incompatible with this app. Refresh and try again.",
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
            setAttempt((p) => p + 1);
          }}
        />
      </div>
    );
  if (!data)
    return (
      <div className="page-width standalone-state">
        <LoadingState label="Loading the draft retry module" />
      </div>
    );
  return (
    <>
      <section
        className="page-width retry-draft"
        aria-label="Draft retry module"
      >
        <p className="eyebrow">Draft learning module</p>
        <p>
          Explore timeouts, retry load and independent server work. Available by
          direct link while under review; no cancellation, idempotency or
          business effects are modeled.
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
          playground: (
            <RetryPlayground
              key={`${data.topic.topic.contentVersion}/${data.descriptor.modelVersion}`}
              descriptor={data.descriptor}
            />
          ),
          study: (
            <StudyView
              markdown={data.topic.lessonMarkdown}
              title="A caller timeout does not cancel accepted server work."
              guidance="Follow one caller and its actual attempts. Explain the deadline, the retry decision and the server work separately."
            />
          ),
          practice: (
            <PracticeView
              questions={data.topic.questions}
              topicId={id}
              contentVersion={data.topic.topic.contentVersion}
              topicTitle={data.topic.topic.title}
              title="Explain caller patience and retry load"
              description="Use actual Java evidence, state the modeled boundary and defend one changed policy."
            />
          ),
        }}
      />
    </>
  );
}
