import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ApiClientError } from "../api/client";
import type { SimulationDescriptor, TopicDetail } from "../api/types";
import { ErrorState, LoadingState } from "../components/AsyncState";
import {
  ModuleShell,
  requestFlowTabs,
  type ModuleView,
} from "../components/ModuleShell";
import { ArchitectureView } from "../features/request-flow/ArchitectureView";
import { Playground } from "../features/request-flow/Playground";
import { PracticeView } from "../features/learning/PracticeView";
import { SequenceView } from "../features/request-flow/SequenceView";
import { StudyView } from "../features/learning/StudyView";

export function RequestFlowPage() {
  const [data, setData] = useState<{
    topic: TopicDetail;
    descriptor: SimulationDescriptor;
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setError("");
    setData(null);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([api.topic("request-flow"), api.descriptor("request-flow")])
      .then(([topic, descriptor]) => active && setData({ topic, descriptor }))
      .catch(
        (cause: unknown) =>
          active &&
          setError(
            cause instanceof ApiClientError
              ? cause.message
              : "Something went wrong.",
          ),
      );
    return () => {
      active = false;
    };
  }, [attempt]);

  if (error)
    return (
      <div className="page-width standalone-state">
        <ErrorState message={error} retry={retry} />
      </div>
    );
  if (!data)
    return (
      <div className="page-width standalone-state">
        <LoadingState />
      </div>
    );

  const views: Record<ModuleView, ReactNode> = {
    playground: <Playground descriptor={data.descriptor} />,
    study: <StudyView markdown={data.topic.lessonMarkdown} />,
    architecture: <ArchitectureView />,
    sequence: <SequenceView />,
    practice: <PracticeView questions={data.topic.questions} />,
  };
  return (
    <ModuleShell
      topic={data.topic.topic}
      tabs={requestFlowTabs}
      defaultView="playground"
    >
      {(view) => views[view]}
    </ModuleShell>
  );
}
