import { useEffect, useState } from "react";
import { api, ApiClientError } from "../api/client";
import type { IdempotencyDescriptor, TopicDetail } from "../api/types";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { ModuleShell } from "../components/ModuleShell";
import { StudyView } from "../features/learning/StudyView";
import { PracticeView } from "../features/learning/PracticeView";
import { IdempotencyPlayground } from "../features/idempotency/IdempotencyPlayground";
import { IdempotencyGuided } from "../features/idempotency/IdempotencyGuided";
import { IdempotencyArchitectureView } from "../features/idempotency/IdempotencyArchitectureView";
import { IdempotencySequenceView } from "../features/idempotency/IdempotencySequenceView";
import { NotFoundPage } from "./NotFoundPage";
const id = "idempotency";
export function IdempotencyPage() {
  const [data, setData] = useState<{
    topic: TopicDetail;
    descriptor: IdempotencyDescriptor;
  } | null>(null);
  const [error, setError] = useState(""),
    [missing, setMissing] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([api.draftTopic(id), api.getIdempotency()])
      .then(async ([topic, descriptor]) => {
        if (!active) return;
        if (
          topic.topic?.id !== id ||
          topic.topic.kind !== "topic" ||
          topic.topic.status !== "draft" ||
          !Array.isArray(topic.topic.capabilities) ||
          !(["study", "simulation", "practice", "guided"] as const).every(
            (capability) => topic.topic.capabilities.includes(capability),
          ) ||
          !Array.isArray(topic.topic.simulationIds) ||
          !topic.topic.simulationIds.includes(id) ||
          typeof topic.lessonMarkdown !== "string" ||
          !topic.lessonMarkdown.trim() ||
          !Array.isArray(topic.questions) ||
          !topic.questions.length ||
          !Array.isArray(topic.checkpoints) ||
          !topic.checkpoints.length ||
          descriptor.id !== id ||
          !descriptor.presets.some(
            (preset) => preset.id === descriptor.defaultPresetId,
          )
        ) {
          setError(
            "This draft idempotency module is incompatible with this app. Refresh and try again.",
          );
          return;
        }
        const { assertIdempotencyCheckpoints } =
          await import("../api/idempotencyCompatibility");
        if (!active) return;
        assertIdempotencyCheckpoints(topic.checkpoints, descriptor);
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
        <LoadingState label="Loading the draft idempotency module" />
      </div>
    );
  return (
    <>
      <section
        className="page-width idem-draft"
        aria-label="Draft idempotency module"
      >
        <p className="eyebrow">Draft learning module</p>
        <p>
          Compare repeated effects with retained results, then change the key,
          payload or expiry boundary. Available by direct link while under
          review. Physical durability and external provider guarantees remain
          outside this model.
        </p>
      </section>
      <ModuleShell
        topic={data.topic.topic}
        tabs={[
          { id: "playground", label: "Playground" },
          { id: "guided", label: "Guided" },
          { id: "architecture", label: "Architecture" },
          { id: "sequence", label: "Call sequence" },
          { id: "study", label: "Study" },
          { id: "practice", label: "Practice" },
        ]}
        defaultView="playground"
        panels={{
          playground: (
            <IdempotencyPlayground
              key={`${data.topic.topic.contentVersion}/${data.descriptor.modelVersion}`}
              descriptor={data.descriptor}
            />
          ),
          guided: (
            <IdempotencyGuided
              checkpoints={data.topic.checkpoints}
              descriptor={data.descriptor}
              contentVersion={data.topic.topic.contentVersion}
            />
          ),
          architecture: <IdempotencyArchitectureView />,
          sequence: <IdempotencySequenceView descriptor={data.descriptor} />,
          study: (
            <StudyView
              markdown={data.topic.lessonMarkdown}
              title="Reuse a result without repeating its effect."
              guidance="Follow one lost response, then explain where the effect and retained receipt become public together."
            />
          ),
          practice: (
            <PracticeView
              questions={data.topic.questions}
              topicId={id}
              contentVersion={data.topic.topic.contentVersion}
              topicTitle={data.topic.topic.title}
              title="Explain the boundary of a safe retry"
              description="Use actual Java evidence to distinguish repeated calls, published effects and caller observations."
            />
          ),
        }}
      />
    </>
  );
}
