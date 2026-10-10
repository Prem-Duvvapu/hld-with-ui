import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiClientError } from "../api/client";
import type { LearningPath } from "../api/types";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { usePageTitle } from "../hooks/usePageTitle";
import { getPracticeStore } from "../features/learning/practiceStorage";
import {
  pathEvidence,
  pathModuleLink,
} from "../features/learning/pathEvidence";
import "../features/learning/LearningPath.css";
import { getCompletionStore } from "../features/learning/completionStorage";
import { CompletionControls } from "../features/learning/CompletionControls";
import { CompletionTools } from "../features/learning/CompletionTools";

type State = {
  id: string;
  attempt: number;
  path?: LearningPath;
  error?: string;
  missing?: boolean;
};
export function LearningPathPage() {
  const { id = "" } = useParams();
  const [state, setState] = useState<State>({ id, attempt: 0 });
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const retryFocus = useRef<string | null>(null);
  const store = getPracticeStore();
  const saved = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const completionStore = getCompletionStore();
  const completion = useSyncExternalStore(
    completionStore.subscribe,
    completionStore.getSnapshot,
  );
  const current = state.id === id && state.attempt === attempt;
  const path = current ? state.path : undefined;
  usePageTitle(`${path?.title ?? "Learning path"} · HLD with UI`);
  useEffect(() => {
    let active = true;
    void api
      .learningPath(id)
      .then((data) => {
        if (
          !data ||
          data.id !== id ||
          data.schemaVersion !== 1 ||
          !Array.isArray(data.steps) ||
          data.steps.length === 0 ||
          !Array.isArray(data.optionalModules) ||
          data.steps.some(
            (step) =>
              !Array.isArray(step.activities) ||
              (step.available &&
                (!step.entry ||
                  step.entry.id !== step.moduleId ||
                  step.entry.status !== "published")),
          )
        )
          throw new Error(
            "This learning path is incompatible with the current app. No destinations have been opened.",
          );
        if (active) setState({ id, attempt, path: data });
      })
      .catch((cause: unknown) => {
        if (active)
          setState({
            id,
            attempt,
            error:
              cause instanceof Error
                ? cause.message
                : "This learning path could not be loaded.",
            missing: cause instanceof ApiClientError && cause.status === 404,
          });
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  useLayoutEffect(() => {
    if (retryFocus.current === id && current && (path || state.missing)) {
      heading.current?.focus({ preventScroll: true });
      retryFocus.current = null;
    }
  }, [id, current, path, state.missing]);
  const available =
    path?.steps.filter(
      (step) => step.available && step.entry?.status === "published",
    ) ?? [];
  const evidence = new Map(
    available.map((step) => [
      step.moduleId,
      pathEvidence(step, saved.answers, completion.records),
    ]),
  );
  const withAnswers = available.filter(
    (step) => evidence.get(step.moduleId)!.answered > 0,
  ).length;
  const readCount = available.filter(
    (step) => evidence.get(step.moduleId)!.reading,
  ).length;
  const reviewedCount = available.reduce(
    (sum, step) => sum + evidence.get(step.moduleId)!.reviewed,
    0,
  );
  const suggested =
    available.find((step) => evidence.get(step.moduleId)!.answered === 0) ??
    available[0];
  const entries = new Map(
    [...available.map((step) => step.entry!), ...(path?.optionalModules ?? [])]
      .filter((entry) => entry.status === "published")
      .map((entry) => [entry.id, entry]),
  );
  return (
    <section
      className="learning-path-page page-width"
      aria-labelledby="path-title"
    >
      <Link className="back-link" to="/">
        ← All modules
      </Link>
      <p className="eyebrow">One decision at a time</p>
      <h1 id="path-title" ref={heading} tabIndex={-1}>
        {path?.title ??
          (current && state.missing
            ? "Learning path not found"
            : "Learning path")}
      </h1>
      {current && state.error ? (
        state.missing ? (
          <p>
            This path is unavailable. Choose the first path from home; your
            saved answers are kept.
          </p>
        ) : (
          <ErrorState
            message={state.error}
            retry={() => {
              retryFocus.current = id;
              setAttempt((value) => value + 1);
            }}
          />
        )
      ) : !path ? (
        <LoadingState label="Loading learning path" />
      ) : (
        <>
          <p className="path-intro">{path.summary}</p>
          <div
            className="path-summary"
            aria-label="Path availability and saved reasoning"
          >
            <span>
              <strong>
                {available.length} / {path.steps.length}
              </strong>{" "}
              steps available
            </span>
            <span>
              <strong>{withAnswers}</strong>{" "}
              {withAnswers === 1 ? "step has" : "steps have"} saved answers
            </span>
          </div>
          <div
            className="path-summary"
            aria-label="Explicit reading and practice progress"
          >
            <span>
              <strong>{readCount}</strong>{" "}
              {readCount === 1 ? "lesson marked" : "lessons marked"} read
            </span>
            <span>
              <strong>{reviewedCount}</strong>{" "}
              {reviewedCount === 1 ? "answer marked" : "answers marked"}{" "}
              reviewed
            </span>
          </div>
          <p className="path-evidence-note">
            Saved answers and reference views describe work on this browser.
            Reading and practice reviews are recorded only when you choose to
            mark them. They do not certify mastery.
          </p>
          {saved.issue && (
            <p className="path-notice" role="note">
              Your new answers are kept for this session only. {saved.issue} Use
              Continue learning on home to download or manage your answers
              before leaving. Previous saved data has not been replaced.
            </p>
          )}
          {completion.issue && (
            <p className="path-notice" role="note">
              Completion storage needs attention. {completion.issue} Download
              your marks before leaving; previous saved data has not been
              replaced.
            </p>
          )}
          <CompletionTools />
          {suggested?.entry ? (
            <aside
              className="path-suggestion"
              aria-labelledby="path-suggestion-title"
            >
              <div>
                <p className="eyebrow">
                  {withAnswers === available.length
                    ? "Revisit your reasoning"
                    : withAnswers
                      ? "Suggested next exercise"
                      : "A clear starting point"}
                </p>
                <h2 id="path-suggestion-title">{suggested.entry.title}</h2>
                <p>
                  {withAnswers === available.length
                    ? "Every available step has saved reasoning. Revisit a failure and explain what changes."
                    : "Start with its explanation, change one condition in the experiment, then write why the result changed."}
                </p>
              </div>
              <Link
                className="button primary"
                to={pathModuleLink(suggested.entry)}
              >
                Open suggested module <span aria-hidden="true">→</span>
              </Link>
            </aside>
          ) : (
            <p className="path-notice" role="note">
              No steps are published yet. Your saved answers are kept; browse
              the available modules from home.
            </p>
          )}
          <ol className="path-steps" aria-label="Learning path steps">
            {path.steps.map((step, index) => {
              const entry =
                step.available && step.entry?.status === "published"
                  ? step.entry
                  : undefined;
              const work = evidence.get(step.moduleId);
              return (
                <li
                  className={`path-step ${entry ? "" : "path-step-unavailable"}`}
                  key={step.moduleId}
                >
                  <span className="path-step-number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="path-step-content">
                    <p className="eyebrow">
                      {entry
                        ? `${entry.category} · ${entry.level}`
                        : "Upcoming path step · Unavailable"}
                    </p>
                    <h2>{entry?.title ?? step.purpose}</h2>
                    <p>
                      {entry
                        ? step.purpose
                        : "This step is awaiting publication review. The published concepts above remain available."}
                    </p>
                    {entry && (
                      <>
                        <div className="path-prerequisites">
                          <strong>Before this:</strong>
                          {entry.prerequisites.length ? (
                            <ul aria-label={`Prerequisites for ${entry.title}`}>
                              {entry.prerequisites.map((prerequisite) => {
                                const related = entries.get(prerequisite);
                                return (
                                  <li key={prerequisite}>
                                    {related ? (
                                      <Link to={pathModuleLink(related)}>
                                        {related.title}
                                      </Link>
                                    ) : (
                                      "Prerequisite unavailable"
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <span>No earlier module needed</span>
                          )}
                        </div>
                        <div className="path-work">
                          <span>
                            {work!.answered
                              ? `${work!.answered} saved ${work!.answered === 1 ? "answer" : "answers"}`
                              : "No current answers saved"}
                          </span>
                          <span>
                            {work!.viewed} reference{" "}
                            {work!.viewed === 1 ? "view" : "views"} recorded
                          </span>
                        </div>
                        <div className="path-work">
                          <span>
                            {work!.reading
                              ? "Reading marked complete"
                              : "Reading not marked complete"}
                          </span>
                          <span>
                            {work!.reviewed} / {work!.answered} saved answers
                            marked reviewed
                          </span>
                        </div>
                        <CompletionControls step={step} />
                        {!!work!.earlier && (
                          <p className="path-notice" role="note">
                            {work!.earlier} earlier or unavailable activity{" "}
                            {work!.earlier === 1 ? "record is" : "records are"}{" "}
                            kept in your backup. Review the current lesson
                            before using that reasoning.
                          </p>
                        )}
                        <Link className="path-open" to={pathModuleLink(entry)}>
                          Open module{" "}
                          <span className="sr-only">{entry.title}</span>
                          <span aria-hidden="true">→</span>
                        </Link>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {!!path.optionalModules.filter(
            (entry) => entry.status === "published",
          ).length && (
            <section className="path-optional" aria-labelledby="optional-title">
              <p className="eyebrow">Optional depth</p>
              <h2 id="optional-title">Protect the shared capacity</h2>
              <p>
                Explore this after the foundations when you want to reason about
                bursts and enforcement. These modules are outside the main path.
              </p>
              <ul>
                {path.optionalModules
                  .filter((entry) => entry.status === "published")
                  .map((entry) => (
                    <li key={entry.id}>
                      <Link to={pathModuleLink(entry)}>{entry.title}</Link>
                      <p>{entry.summary}</p>
                    </li>
                  ))}
              </ul>
            </section>
          )}
          <p className="path-footer">
            Already working on an answer?{" "}
            <Link to="/#continue-learning">
              Continue saved reasoning on home
            </Link>
            . <Link to="/bookmarks">Open your saved modules</Link>.
          </p>
        </>
      )}
    </section>
  );
}
