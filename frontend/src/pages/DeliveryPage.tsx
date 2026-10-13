import { useEffect, useState } from "react";
import { api, ApiClientError } from "../api/client";
import type { DeliveryDescriptor, TopicDetail } from "../api/types";
import { LoadingState, ErrorState } from "../components/AsyncState";
import { ModuleShell } from "../components/ModuleShell";
import { StudyView } from "../features/learning/StudyView";
import { PracticeView } from "../features/learning/PracticeView";
import { DeliveryGuided } from "../features/delivery/DeliveryGuided";
import {
  DeliveryArchitectureView,
  DeliverySequenceView,
} from "../features/delivery/DeliveryConceptViews";
import { DeliveryPlayground } from "../features/delivery/DeliveryPlayground";
import { NotFoundPage } from "./NotFoundPage";
const id = "queues-delivery";
export function DeliveryPage() {
  const [data, setData] = useState<{
    topic: TopicDetail;
    descriptor: DeliveryDescriptor;
  } | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([api.draftTopic(id), api.deliveryDescriptor()])
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
          (topic.topic.capabilities.includes("guided") &&
            !topic.checkpoints.length)
        ) {
          setError(
            "This draft delivery module is incompatible with this app. Refresh and try again.",
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
        <LoadingState label="Loading the draft delivery module" />
      </div>
    );
  return (
    <>
      <section
        className="delivery-draft page-width"
        aria-label="Draft delivery module"
      >
        <p className="eyebrow">Draft learning module</p>
        <p>
          Explore broker delivery, ACKs and repeated effects. This module is
          still under review and available by direct link. It illustrates
          separate broker and ledger boundaries, with no duplicate protection.
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
          { id: "sequence", label: "Message sequence" },
          { id: "study", label: "Study" },
          { id: "practice", label: "Practice" },
        ]}
        defaultView="playground"
        panels={{
          playground: (
            <DeliveryPlayground
              key={`${data.topic.topic.contentVersion}/${data.descriptor.modelVersion}`}
              descriptor={data.descriptor}
            />
          ),
          guided: data.topic.topic.capabilities.includes("guided") && (
            <DeliveryGuided
              checkpoints={data.topic.checkpoints}
              descriptor={data.descriptor}
              contentVersion={data.topic.topic.contentVersion}
            />
          ),
          architecture: <DeliveryArchitectureView />,
          sequence: <DeliverySequenceView />,
          study: (
            <StudyView
              markdown={data.topic.lessonMarkdown}
              title="Delivery, work and confirmation are different facts."
              guidance="Follow one message before adding more. Compare the actual ledger entries with broker ACK status, then defend the tradeoff in your own words."
            />
          ),
          practice: (
            <PracticeView
              questions={data.topic.questions}
              topicId={id}
              contentVersion={data.topic.topic.contentVersion}
              topicTitle={data.topic.topic.title}
              title="Explain duplicates and defend an ACK policy"
              description="Use the observed trace to distinguish deliveries, committed effects and confirmations. State the boundary a real duplicate-protection mechanism would need."
            />
          ),
        }}
      />
    </>
  );
}
