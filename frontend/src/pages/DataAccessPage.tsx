import { useEffect, useState } from "react";
import { api, ApiClientError } from "../api/client";
import type { DataAccessDescriptor, TopicDetail } from "../api/types";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { ModuleShell } from "../components/ModuleShell";
import { DataAccessPlayground } from "../features/data-access/DataAccessPlayground";
import { DataAccessGuided } from "../features/data-access/DataAccessGuided";
import {
  DataAccessArchitectureView,
  DataAccessSequenceView,
} from "../features/data-access/DataAccessConceptViews";
import { PracticeView } from "../features/learning/PracticeView";
import { StudyView } from "../features/learning/StudyView";
import { NotFoundPage } from "./NotFoundPage";
const id = "data-access-models";
export function DataAccessPage() {
  const [data, setData] = useState<{
    topic: TopicDetail;
    descriptor: DataAccessDescriptor;
  } | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([api.draftTopic(id), api.dataAccessDescriptor()])
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
          (topic.topic.capabilities.includes("guided")
            ? !topic.checkpoints.length
            : topic.checkpoints.length > 0)
        ) {
          setError(
            "This draft data-access module is incompatible with this app. Refresh and try again.",
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
        <LoadingState label="Loading the draft data-access module" />
      </div>
    );
  return (
    <>
      <section
        className="access-draft page-width"
        aria-label="Draft data-access module"
      >
        <p className="eyebrow">Draft learning module</p>
        <p>
          Choose keys from your reads and rules from your writes. Explore a
          simplified access-path model and compare storage choices in Study.
          Guided checkpoints use returned Java operation evidence. Architecture
          and Operation sequence are authored illustrations. Publication review
          remains pending.
        </p>
      </section>
      <ModuleShell
        topic={data.topic.topic}
        tabs={[
          { id: "playground", label: "Playground" },
          ...(data.topic.topic.capabilities.includes("guided")
            ? [{ id: "guided", label: "Guided" }]
            : []),
          { id: "architecture", label: "Architecture" },
          { id: "sequence", label: "Operation sequence" },
          { id: "study", label: "Study" },
          { id: "practice", label: "Practice" },
        ]}
        defaultView="playground"
        panels={{
          playground: (
            <DataAccessPlayground
              key={`${data.topic.topic.contentVersion}/${data.descriptor.modelVersion}`}
              descriptor={data.descriptor}
            />
          ),
          guided: data.topic.topic.capabilities.includes("guided") && (
            <DataAccessGuided
              checkpoints={data.topic.checkpoints}
              descriptor={data.descriptor}
              contentVersion={data.topic.topic.contentVersion}
            />
          ),
          architecture: <DataAccessArchitectureView />,
          sequence: <DataAccessSequenceView />,
          study: (
            <StudyView
              markdown={data.topic.lessonMarkdown}
              title="Start with the questions your data must answer."
              guidance="Trace one query and one insert. Use the modeled evidence to explain the access path, then compare data shapes and correctness boundaries."
            />
          ),
          practice: (
            <PracticeView
              questions={data.topic.questions}
              topicId={id}
              contentVersion={data.topic.topic.contentVersion}
              topicTitle={data.topic.topic.title}
              title="Defend the data shape and its rules"
              description="Explain the query, keys, evidence and tradeoff. A saved explanation is your own reasoning, not an automatic grade."
            />
          ),
        }}
      />
    </>
  );
}
