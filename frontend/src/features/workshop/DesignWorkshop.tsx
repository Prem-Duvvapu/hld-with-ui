import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useSearchParams } from "react-router-dom";
import type { Workshop, WorkshopStage } from "../../api/types";
import { AnswerStorageControls } from "../learning/AnswerStorageControls";
import {
  getPracticeStore,
  MAX_ANSWER_LENGTH,
  type PracticeAnswer,
} from "../learning/practiceStorage";
import "./DesignWorkshop.css";

function Stage({
  stage,
  workshop,
  index,
}: {
  stage: WorkshopStage;
  workshop: Workshop;
  index: number;
}) {
  const store = getPracticeStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const reference = useRef<HTMLElement>(null);
  const [sessionReview, setSessionReview] = useState<{
    version: string;
    resetVersion: number;
  } | null>(null);
  const saved = (suffix: string) =>
    snapshot.answers.find(
      (answer) =>
        answer.topicId === workshop.id &&
        answer.activityId === `${stage.id}-${suffix}`,
    );
  const original = saved("attempt");
  const revision = saved("revision");
  const originalText =
    original?.answer.kind === "text" ? original.answer.text : "";
  const revisedText =
    revision?.answer.kind === "text" ? revision.answer.text : "";
  const reviewed = Boolean(
    (original?.referenceViewed &&
      original.contentVersion === workshop.contentVersion) ||
    (sessionReview?.version === workshop.contentVersion &&
      sessionReview.resetVersion === store.getResetVersion(workshop.id)),
  );
  const older = snapshot.answers.some(
    (answer) =>
      answer.topicId === workshop.id &&
      answer.activityId.startsWith(`${stage.id}-`) &&
      answer.contentVersion !== workshop.contentVersion,
  );
  function save(
    suffix: string,
    answer: PracticeAnswer["answer"],
    referenceViewed = false,
  ) {
    return store.save({
      topicId: workshop.id,
      activityId: `${stage.id}-${suffix}`,
      contentVersion: workshop.contentVersion,
      answer,
      referenceViewed,
    });
  }
  function reveal() {
    save("attempt", { kind: "text", text: originalText }, true);
    // Reading an explanation remains possible even if the bounded answer store
    // refuses a new record. This session-only reveal never claims a saved attempt.
    setSessionReview({
      version: workshop.contentVersion,
      resetVersion: store.getResetVersion(workshop.id),
    });
    window.requestAnimationFrame(() => reference.current?.focus());
  }
  return (
    <article className="workshop-stage" aria-labelledby={`stage-${stage.id}`}>
      <div className="workshop-stage-heading">
        <p className="eyebrow">
          Stage {String(index + 1).padStart(2, "0")} of{" "}
          {String(workshop.stages.length).padStart(2, "0")} · Design decisions
        </p>
        <h2 id={`stage-${stage.id}`} tabIndex={-1}>
          {stage.title}
        </h2>
        <p>Draft → compare → self-check → revise</p>
      </div>
      {older && (
        <p className="practice-version-note" role="note">
          Some answers were saved for an older lesson. They remain in your
          backup. Review the current reference and choose your self-checks
          again; earlier review does not prove mastery.
        </p>
      )}
      <section className="workshop-step">
        <h3>1. Write your first attempt</h3>
        <div className="prose">
          <ReactMarkdown>{stage.prompt}</ReactMarkdown>
        </div>
        <label className="workshop-answer">
          <span>Your original answer</span>
          <textarea
            rows={7}
            maxLength={MAX_ANSWER_LENGTH}
            value={originalText}
            readOnly={reviewed}
            onChange={(event) =>
              save("attempt", { kind: "text", text: event.target.value })
            }
            placeholder="Answer the stage prompt in your own words, with assumptions and reasoning…"
          />
        </label>
        <p className="workshop-hint">
          {originalText.length.toLocaleString()} /{" "}
          {MAX_ANSWER_LENGTH.toLocaleString()} characters ·{" "}
          {reviewed
            ? "Your original stays visible. Improve it in the revision below."
            : "Your first attempt saves locally as you type."}
        </p>
        {!reviewed && (
          <button className="button primary" type="button" onClick={reveal}>
            {older ? "Review the current reference" : "Reveal reference answer"}
          </button>
        )}
        {reviewed && (
          <p className="workshop-attempt-status" role="status">
            {originalText.trim()
              ? "Original attempt preserved. Compare the reasoning and revise below."
              : "Reference viewed without an original written attempt. Write your own reasoning in the revision below."}
          </p>
        )}
      </section>
      {reviewed && (
        <>
          <section
            ref={reference}
            tabIndex={-1}
            className="workshop-step workshop-reference"
            aria-labelledby={`reference-${stage.id}`}
          >
            <p className="eyebrow">One reasonable answer</p>
            <h3 id={`reference-${stage.id}`}>2. Compare with the reference</h3>
            <div className="prose">
              <ReactMarkdown>{stage.reference}</ReactMarkdown>
            </div>
            <p className="workshop-hint">
              This is a design example under stated assumptions. Other choices
              can be valid when you explain their tradeoffs.
            </p>
          </section>
          <section
            className="workshop-step"
            aria-labelledby={`checks-${stage.id}`}
          >
            <h3 id={`checks-${stage.id}`}>3. Check your reasoning</h3>
            <p>
              Record what your answer covers. These are your judgments, with no
              automatic score or completion.
            </p>
            <div className="workshop-checks">
              {stage.rubric.map((item) => {
                const check = saved(`check-${item.id}`);
                const choice =
                  check?.contentVersion === workshop.contentVersion &&
                  check.answer.kind === "choice"
                    ? check.answer.optionId
                    : null;
                return (
                  <fieldset key={item.id} className="workshop-check">
                    <legend>{item.prompt}</legend>
                    {check &&
                      check.contentVersion !== workshop.contentVersion && (
                        <p className="workshop-hint">
                          Earlier self-check preserved in your backup; review
                          this lesson before choosing again.
                        </p>
                      )}
                    <div>
                      {[
                        { id: "yes", label: "Covered in my answer" },
                        { id: "revisit", label: "Needs a revision" },
                      ].map((option) => (
                        <label key={option.id}>
                          <input
                            type="radio"
                            name={`${stage.id}-check-${item.id}`}
                            checked={choice === option.id}
                            onChange={() =>
                              save(
                                `check-${item.id}`,
                                { kind: "choice", optionId: option.id },
                                true,
                              )
                            }
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </section>
          <section className="workshop-step">
            <h3>4. Revise and explain</h3>
            <p>
              Keep your first attempt above. Write an improved answer, then
              explain one decision and what would make you change it.
            </p>
            <label className="workshop-answer">
              <span>Your revised answer</span>
              <textarea
                rows={7}
                maxLength={MAX_ANSWER_LENGTH}
                value={revisedText}
                onChange={(event) =>
                  save(
                    "revision",
                    { kind: "text", text: event.target.value },
                    true,
                  )
                }
                placeholder="Improve your answer and explain one decision you would change under different assumptions…"
              />
            </label>
            <p className="workshop-hint">
              {revisedText.length.toLocaleString()} /{" "}
              {MAX_ANSWER_LENGTH.toLocaleString()} characters · Saved on this
              browser when storage is available.
            </p>
          </section>
        </>
      )}
      {stage.experimentLinks.length > 0 && (
        <aside className="workshop-transfer" aria-label="Related experiments">
          <h3>Explore this decision in a working model</h3>
          <p>
            These modules open separately. Your notes are saved locally; no
            assumptions are transferred automatically.
          </p>
          {stage.experimentLinks.map((experiment) => (
            <div key={experiment.topicId}>
              <Link to={`/topics/${experiment.topicId}`}>
                {experiment.label} →
              </Link>
              <p>{experiment.instruction}</p>
            </div>
          ))}
        </aside>
      )}
    </article>
  );
}

export function DesignWorkshop({
  workshop,
  title,
  draft,
}: {
  workshop: Workshop;
  title: string;
  draft: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("stage");
  const requestedIndex = workshop.stages.findIndex(
    (stage) => stage.id === requested,
  );
  const activeIndex = requestedIndex < 0 ? 0 : requestedIndex;
  const active = workshop.stages[activeIndex]!;
  const stagePanels = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  // Router navigation may commit after an animation frame. Focus only after
  // the selected panel becomes visible, and only for explicit stage actions.
  useLayoutEffect(() => {
    if (pendingFocus.current !== active.id) return;
    pendingFocus.current = null;
    stagePanels.current
      ?.querySelector<HTMLHeadingElement>(`#stage-${active.id}`)
      ?.focus();
  }, [active.id, requested]);
  function navigate(index: number) {
    const stage = workshop.stages[index];
    if (!stage) return;
    if (index !== activeIndex || (requested !== null && requestedIndex < 0)) {
      pendingFocus.current = stage.id;
      const next = new URLSearchParams(params);
      next.set("stage", stage.id);
      setParams(next, { replace: index === activeIndex });
    } else {
      stagePanels.current
        ?.querySelector<HTMLHeadingElement>(`#stage-${stage.id}`)
        ?.focus();
    }
  }
  return (
    <div className="design-workshop">
      {draft && (
        <section className="workshop-draft" aria-label="Draft workshop">
          <p className="eyebrow">
            Draft · {workshop.stages.length} authored{" "}
            {workshop.stages.length === 1 ? "stage" : "stages"}
          </p>
          <h2>Start with the problem you are solving.</h2>
          <p>
            This draft includes{" "}
            {workshop.stages.map((stage) => stage.title).join(", ")}. Remaining
            design stages are still being built. This is a learning exercise; it
            does not create short links.
          </p>
        </section>
      )}
      <div className="workshop-orientation">
        <div className="prose">
          <ReactMarkdown>{workshop.introduction}</ReactMarkdown>
        </div>
        <aside>
          <p className="eyebrow">Keep this true</p>
          <p>{workshop.invariant}</p>
        </aside>
      </div>
      <AnswerStorageControls
        topicId={workshop.id}
        topicTitle={title}
        label="Workshop answer storage"
      />
      <nav className="workshop-navigation" aria-label="Workshop stages">
        <div className="workshop-navigation-heading">
          <p className="eyebrow">Choose a design stage</p>
          <p>Each stage keeps its own answer and self-checks.</p>
        </div>
        <ol>
          {workshop.stages.map((stage, index) => (
            <li key={stage.id}>
              <button
                type="button"
                aria-current={index === activeIndex ? "step" : undefined}
                onClick={() => navigate(index)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                {stage.title}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {requested !== null && requestedIndex < 0 && (
        <p className="workshop-stage-notice" role="status">
          The requested stage is unavailable. Showing {active.title}, the first
          authored stage. Choose a stage above to continue.
        </p>
      )}
      <div ref={stagePanels}>
        {workshop.stages.map((stage, index) => (
          <div key={stage.id} hidden={index !== activeIndex}>
            <Stage stage={stage} workshop={workshop} index={index} />
          </div>
        ))}
      </div>
      <div className="workshop-stage-actions" aria-label="Stage navigation">
        <button
          type="button"
          className="button"
          disabled={activeIndex === 0}
          onClick={() => navigate(activeIndex - 1)}
        >
          Previous stage
        </button>
        <p>
          Stage {activeIndex + 1} of {workshop.stages.length} · {active.title}
        </p>
        <button
          type="button"
          className="button"
          disabled={activeIndex === workshop.stages.length - 1}
          onClick={() => navigate(activeIndex + 1)}
        >
          Next stage
        </button>
      </div>
    </div>
  );
}
