import {
  useEffect,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Link } from "react-router-dom";
import { api, ApiClientError } from "../../api/client";
import type { CatalogEntry } from "../../api/types";
import { getPracticeStore, type PracticeAnswer } from "./practiceStorage";
import { AnswerStorageControls } from "./AnswerStorageControls";
import {
  latestSavedWork,
  topicResumeTarget,
  workshopResumeTarget,
  type ResumeTarget,
} from "./resumeLearning";
import "./ContinueLearning.css";

function SavedWork({
  saved,
  onResolved,
}: {
  saved: PracticeAnswer;
  onResolved: (entry: CatalogEntry) => void;
}) {
  const [target, setTarget] = useState<ResumeTarget | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        let next: ResumeTarget;
        try {
          next = topicResumeTarget(saved, await api.topic(saved.topicId));
        } catch (cause) {
          // The saved-answer schema has no module kind. Ask Java rather than
          // inferring a topic/case registry from a browser's stored ID.
          if (!(cause instanceof ApiClientError) || cause.status !== 404)
            throw cause;
          next = workshopResumeTarget(
            saved,
            await api.caseStudy(saved.topicId),
          );
        }
        if (active) {
          setTarget(next);
          onResolved(next.entry);
        }
      } catch (cause) {
        if (!active) return;
        if (cause instanceof ApiClientError && cause.status === 404)
          setMissing(true);
        else
          setError(
            cause instanceof Error
              ? cause.message
              : "Your saved module could not be checked.",
          );
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [saved, attempt, onResolved]);

  return (
    <div className="continue-card">
      {missing ? (
        <p role="note">
          This saved module is no longer available. Your answers remain in your
          backup. Choose another saved module or browse the foundations below.
        </p>
      ) : error ? (
        <div>
          <p role="alert">{error} Your saved answers have not changed.</p>
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : !target ? (
        <p role="status">Checking your saved module…</p>
      ) : (
        <>
          <div>
            <p className="eyebrow">
              {target.entry.status === "draft"
                ? "Draft workshop · Saved work"
                : "Your saved work"}
            </p>
            <h3>{target.entry.title}</h3>
            <p>{target.activity}</p>
            <p className="continue-evidence">
              {saved.answer.kind === "text" && saved.answer.text.trim()
                ? "Written reasoning saved"
                : saved.answer.kind === "choice" &&
                    saved.answer.optionId !== null
                  ? "A choice or self-check is saved"
                  : "Reference viewed without a written attempt"}{" "}
              · No completion or mastery inferred.
            </p>
            {saved.contentVersion !== target.entry.contentVersion && (
              <p className="practice-version-note" role="note">
                Content has changed since this answer was saved. Your earlier
                reasoning is kept; review it against the current lesson.
              </p>
            )}
            {target.removed && (
              <p role="note">
                This saved activity is no longer in the module. Open its current
                version; the earlier answer remains in your backup.
              </p>
            )}
            {target.path.includes("checkpoint=") && (
              <p className="continue-evidence">
                Run and reveal again to load Java evidence. Saved predictions do
                not contain a simulation trace.
              </p>
            )}
          </div>
          <Link className="button primary" to={target.path}>
            {target.removed ? "Open current module" : "Continue saved work"}
            <span aria-hidden="true">→</span>
          </Link>
        </>
      )}
    </div>
  );
}

export function ContinueLearning({
  entries = [],
}: {
  entries?: CatalogEntry[];
}) {
  const store = getPracticeStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const work = latestSavedWork(snapshot.answers);
  const [selection, setSelection] = useState("");
  const [resolvedTitles, setResolvedTitles] = useState<Record<string, string>>(
    {},
  );
  const onResolved = useCallback((entry: CatalogEntry) => {
    setResolvedTitles((previous) =>
      previous[entry.id] === entry.title
        ? previous
        : { ...previous, [entry.id]: entry.title },
    );
  }, []);
  const titleFor = (id: string) =>
    entries.find((entry) => entry.id === id)?.title ?? resolvedTitles[id] ?? id;
  const saved = work.find((record) => record.topicId === selection) ?? work[0];
  const heading = useRef<HTMLHeadingElement>(null);
  const previousModule = useRef(saved?.topicId);
  useLayoutEffect(() => {
    // A confirmed reset can remove the controls that held keyboard focus.
    if (
      previousModule.current &&
      previousModule.current !== saved?.topicId &&
      document.activeElement === document.body
    ) {
      const target = saved
        ? heading.current
        : document.getElementById("modules");
      target?.focus({ preventScroll: true });
    }
    previousModule.current = saved?.topicId;
  }, [saved]);
  if (!saved && !snapshot.issue) return null;
  return (
    <section
      id="continue-learning"
      className="continue-learning page-width"
      aria-labelledby="continue-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Pick up your reasoning</p>
          <h2 id="continue-title" ref={heading} tabIndex={-1}>
            Continue learning
          </h2>
        </div>
        <p>
          Return to a saved answer, prediction, or design decision. Opening a
          page does not record completion.
        </p>
      </div>
      {snapshot.issue && (
        <p className="practice-version-note" role="note">
          Your new answers are kept for this session only. {snapshot.issue} Open
          the backup tools to download your work before leaving or reloading.
          Previous saved data has not been replaced.
        </p>
      )}
      {work.length > 1 && (
        <label className="continue-select">
          Saved module
          <select
            value={saved?.topicId ?? ""}
            onChange={(event) => setSelection(event.target.value)}
          >
            {work.map((record) => (
              <option key={record.topicId} value={record.topicId}>
                {titleFor(record.topicId)}
              </option>
            ))}
          </select>
        </label>
      )}
      {saved && (
        <SavedWork
          key={`${saved.topicId}/${saved.activityId}/${saved.contentVersion}/${saved.updatedAt}`}
          saved={saved}
          onResolved={onResolved}
        />
      )}
      <details className="continue-backups">
        <summary>Back up or manage saved answers</summary>
        <AnswerStorageControls
          key={saved?.topicId ?? "saved-work"}
          topicId={saved?.topicId ?? "saved-work"}
          topicTitle={saved ? titleFor(saved.topicId) : "saved work"}
          label="Continue learning answer storage"
        />
      </details>
    </section>
  );
}
