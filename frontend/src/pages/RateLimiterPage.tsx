import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ApiClientError } from "../api/client";
import type { RateLimiterDescriptor, TopicDetail } from "../api/types";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { ModuleShell, type ModuleTab } from "../components/ModuleShell";
import { PracticeView } from "../features/learning/PracticeView";
import { StudyView } from "../features/learning/StudyView";
import {
  RateLimiterArchitecture,
  RateLimiterSequence,
} from "../features/rate-limiter/RateLimiterArchitecture";
import { RateLimiterPlayground } from "../features/rate-limiter/RateLimiterPlayground";

type View = "playground" | "study" | "architecture" | "sequence" | "practice";
const tabs: ReadonlyArray<ModuleTab<View>> = [
  { id: "playground", label: "Playground" },
  { id: "study", label: "Study" },
  { id: "architecture", label: "Architecture" },
  { id: "sequence", label: "Decision flow" },
  { id: "practice", label: "Practice" },
];

export function RateLimiterPage() {
  const [data, setData] = useState<{
    topic: TopicDetail;
    descriptor: RateLimiterDescriptor;
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
    Promise.all([
      api.topic("distributed-rate-limiter"),
      api.rateLimiterDescriptor(),
    ])
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

  const panels: Record<View, ReactNode> = {
    playground: <RateLimiterPlayground descriptor={data.descriptor} />,
    study: (
      <StudyView
        markdown={data.topic.lessonMarkdown}
        title="Define identity and scope before choosing an algorithm."
        guidance="Run the shared and local presets after the worked example. Explain every difference using counter placement."
      />
    ),
    architecture: <RateLimiterArchitecture />,
    sequence: <RateLimiterSequence />,
    practice: (
      <PracticeView
        questions={data.topic.questions}
        title="Defend the enforcement boundary"
        description="Calculate overshoot, choose failure behavior, and give a two-minute distributed design."
      />
    ),
  };
  return (
    <ModuleShell topic={data.topic.topic} tabs={tabs} defaultView="playground">
      {(view) => panels[view]}
    </ModuleShell>
  );
}
