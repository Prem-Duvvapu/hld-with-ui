import { useEffect, useState } from "react";
import { api, ApiClientError } from "../api/client";
import type { ReservationDescriptor, TopicDetail } from "../api/types";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { ModuleShell } from "../components/ModuleShell";
import { ReservationPlayground } from "../features/reservations/ReservationPlayground";
import { PracticeView } from "../features/learning/PracticeView";
import { StudyView } from "../features/learning/StudyView";
import { NotFoundPage } from "./NotFoundPage";
const id = "transactions-isolation";
export function ReservationPage() {
  const [data, setData] = useState<{
    topic: TopicDetail;
    descriptor: ReservationDescriptor;
  } | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([api.draftTopic(id), api.reservationDescriptor()])
      .then(([topic, descriptor]) => {
        if (!active) return;
        if (
          topic.topic?.id !== id ||
          topic.topic.kind !== "topic" ||
          topic.topic.status !== "draft" ||
          !Array.isArray(topic.topic.capabilities) ||
          !(["study", "simulation", "practice"] as const).every((capability) =>
            topic.topic.capabilities.includes(capability),
          ) ||
          !topic.topic.simulationIds?.includes(id) ||
          typeof topic.lessonMarkdown !== "string" ||
          !topic.lessonMarkdown.trim() ||
          !Array.isArray(topic.questions) ||
          !Array.isArray(topic.checkpoints) ||
          topic.checkpoints.length > 0 ||
          topic.topic.capabilities.includes("guided") ||
          topic.questions.length === 0
        ) {
          setError(
            "This draft reservation module is incompatible with this app. Refresh and try again.",
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
            setAttempt((value) => value + 1);
          }}
        />
      </div>
    );
  if (!data)
    return (
      <div className="page-width standalone-state">
        <LoadingState label="Loading the draft reservation module" />
      </div>
    );
  return (
    <>
      <section
        className="reservation-draft page-width"
        aria-label="Draft reservation module"
      >
        <p className="eyebrow">Draft learning module</p>
        <p>
          Compare an earlier read with a current-state atomic reservation. Edit
          quantities and step order, inspect Java snapshots, then explain the
          rule each strategy preserves. This is a bounded logical model;
          publication review remains pending.
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
            <ReservationPlayground
              key={`${data.topic.topic.contentVersion}/${data.descriptor.modelVersion}`}
              descriptor={data.descriptor}
            />
          ),
          study: (
            <StudyView
              markdown={data.topic.lessonMarkdown}
              title="Start with the rule the write must preserve."
              guidance="Trace an earlier observation and a later reservation attempt. Explain the check, the shared-state change, and the unmodeled guarantees."
            />
          ),
          practice: (
            <PracticeView
              questions={data.topic.questions}
              topicId={id}
              contentVersion={data.topic.topic.contentVersion}
              topicTitle={data.topic.topic.title}
              title="Explain the race and defend the boundary"
              description="Explain the observation, acceptance check, evidence and tradeoff. A saved explanation is your own reasoning, not an automatic grade."
            />
          ),
        }}
      />
    </>
  );
}
