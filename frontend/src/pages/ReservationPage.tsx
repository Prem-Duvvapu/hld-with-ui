import { useEffect, useState } from "react";
import { api, ApiClientError } from "../api/client";
import type { ReservationDescriptor, TopicDetail } from "../api/types";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { ModuleShell } from "../components/ModuleShell";
import { TransactionExperiments } from "../features/reservations/TransactionExperiments";
import { ReservationGuided } from "../features/reservations/ReservationGuided";
import {
  ReservationArchitectureView,
  ReservationSequenceView,
} from "../features/reservations/ReservationConceptViews";
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
          !Array.isArray(topic.topic.simulationIds) ||
          !topic.topic.simulationIds?.includes(id) ||
          typeof topic.lessonMarkdown !== "string" ||
          !topic.lessonMarkdown.trim() ||
          !Array.isArray(topic.questions) ||
          !Array.isArray(topic.checkpoints) ||
          (topic.topic.capabilities.includes("guided")
            ? !topic.checkpoints.length
            : topic.checkpoints.length > 0) ||
          topic.questions.length === 0
        ) {
          setError(
            "This draft transaction module is incompatible with this app. Refresh and try again.",
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
        <LoadingState label="Loading the draft transaction module" />
      </div>
    );
  return (
    <>
      <section
        className="reservation-draft page-width"
        aria-label="Draft transaction module"
      >
        <p className="eyebrow">Draft learning module</p>
        <p>
          Explore a reservation race and the publication or abort of related
          writes. Edit quantities and action order, inspect Java snapshots, then
          explain the boundary each model protects. These are bounded logical
          models; publication review remains pending.
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
            <TransactionExperiments
              key={`${data.topic.topic.contentVersion}/${data.descriptor.modelVersion}`}
              reservation={data.descriptor}
              atomicityAvailable={data.topic.topic.simulationIds.includes(
                "transaction-atomicity",
              )}
            />
          ),
          guided: data.topic.topic.capabilities.includes("guided") && (
            <>
              <ReservationScope view="Guided checkpoints" />
              <ReservationGuided
                checkpoints={data.topic.checkpoints}
                descriptor={data.descriptor}
                contentVersion={data.topic.topic.contentVersion}
              />
            </>
          ),
          architecture: (
            <>
              <ReservationScope view="Architecture" />
              <ReservationArchitectureView />
            </>
          ),
          sequence: (
            <>
              <ReservationScope view="Operation sequences" />
              <ReservationSequenceView />
            </>
          ),
          study: (
            <StudyView
              markdown={data.topic.lessonMarkdown}
              title="Choose the boundary the operation needs."
              guidance="Trace an earlier read, or related writes that commit or abort. Explain published state, private work, and the guarantees each model leaves unmodeled."
            />
          ),
          practice: (
            <PracticeView
              questions={data.topic.questions}
              topicId={id}
              contentVersion={data.topic.topic.contentVersion}
              topicTitle={data.topic.topic.title}
              title="Explain the race and defend the boundary"
              description="Explain reservation decisions and atomicity using the named experiment in each prompt. A saved explanation is your own reasoning, not an automatic grade."
            />
          ),
        }}
      />
    </>
  );
}

function ReservationScope({ view }: { view: string }) {
  return (
    <aside
      className="transaction-reservation-scope"
      aria-label={`${view} experiment scope`}
    >
      <p>
        <strong>Reservation race.</strong> This view teaches the original
        reservation experiment. Explore Atomicity &amp; abort in Playground,
        Study, and Practice; its Guided and design views are pending.
      </p>
    </aside>
  );
}
