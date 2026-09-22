import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ApiClientError } from "../api/client";
import type { CapacityEstimatorDescriptor, TopicDetail } from "../api/types";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { ModuleShell, type ModuleTab } from "../components/ModuleShell";
import { CapacityArchitectureView } from "../features/capacity-estimation/CapacityArchitectureView";
import { CapacityCalculator } from "../features/capacity-estimation/CapacityCalculator";
import { FormulaView } from "../features/capacity-estimation/FormulaView";
import { PracticeView } from "../features/learning/PracticeView";
import { StudyView } from "../features/learning/StudyView";

type CapacityView =
  "calculator" | "study" | "architecture" | "formulas" | "practice";
const tabs: ReadonlyArray<ModuleTab<CapacityView>> = [
  { id: "calculator", label: "Calculator" },
  { id: "study", label: "Study" },
  { id: "architecture", label: "Assumption map" },
  { id: "formulas", label: "Formula map" },
  { id: "practice", label: "Practice" },
];

export function CapacityEstimationPage() {
  const [data, setData] = useState<{
    topic: TopicDetail;
    descriptor: CapacityEstimatorDescriptor;
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
      api.topic("capacity-estimation"),
      api.estimator("capacity-estimation"),
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

  const panels: Record<CapacityView, ReactNode> = {
    calculator: <CapacityCalculator descriptor={data.descriptor} />,
    study: (
      <StudyView
        markdown={data.topic.lessonMarkdown}
        title="Estimate demand before choosing technology."
        guidance="Keep units visible. Change one assumption in the calculator after each section and explain which outputs should move."
      />
    ),
    architecture: <CapacityArchitectureView />,
    formulas: <FormulaView />,
    practice: (
      <PracticeView
        questions={data.topic.questions}
        title="Explain the estimate under interview pressure"
        description="Predict and calculate before revealing feedback. Finish by separating a steady-state estimate from burst behavior."
      />
    ),
  };
  return (
    <ModuleShell topic={data.topic.topic} tabs={tabs} defaultView="calculator">
      {(view) => panels[view]}
    </ModuleShell>
  );
}
