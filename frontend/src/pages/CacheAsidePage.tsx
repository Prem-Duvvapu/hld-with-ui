import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ApiClientError } from "../api/client";
import type { CacheAsideDescriptor, TopicDetail } from "../api/types";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { ModuleShell, type ModuleTab } from "../components/ModuleShell";
import { PracticeView } from "../features/learning/PracticeView";
import { StudyView } from "../features/learning/StudyView";
import { CacheAsidePlayground } from "../features/cache-aside/CacheAsidePlayground";
import { GuidedCheckpoints } from "../features/cache-aside/GuidedCheckpoints";

type View = "playground" | "guided" | "study" | "practice";
const allTabs: ReadonlyArray<ModuleTab<View>> = [
  { id: "playground", label: "Playground" },
  { id: "guided", label: "Guided" },
  { id: "study", label: "Study" },
  { id: "practice", label: "Practice" },
];

export function CacheAsidePage() {
  const [data, setData] = useState<{
    topic: TopicDetail;
    descriptor: CacheAsideDescriptor;
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
    Promise.all([api.topic("cache-aside"), api.cacheAsideDescriptor()])
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

  // The Guided tab exists only when the catalog advertises it and content
  // delivers checkpoints, so a missing capability stays visibly absent.
  const guided =
    data.topic.topic.capabilities.includes("guided") &&
    data.topic.checkpoints.length > 0;
  const tabs = allTabs.filter((tab) => tab.id !== "guided" || guided);
  const panels: Record<View, ReactNode> = {
    playground: <CacheAsidePlayground descriptor={data.descriptor} />,
    guided: guided && (
      <GuidedCheckpoints
        checkpoints={data.topic.checkpoints}
        descriptor={data.descriptor}
      />
    ),
    study: (
      <StudyView
        markdown={data.topic.lessonMarkdown}
        title="Trace every read through cache and origin."
        guidance="Run each preset after reading the worked example. Explain the stale read and cold burst using the event trace."
      />
    ),
    practice: (
      <PracticeView
        questions={data.topic.questions}
        title="Explain cache behavior under failure"
        description="Identify stale reads, calculate cold-start origin load, and design a mitigation for origin unavailability."
      />
    ),
  };
  return (
    <ModuleShell
      topic={data.topic.topic}
      tabs={tabs}
      defaultView="playground"
      panels={panels}
    />
  );
}
