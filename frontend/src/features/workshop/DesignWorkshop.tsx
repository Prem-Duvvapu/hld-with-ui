import { useRef, useState, useSyncExternalStore } from "react";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
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
          Stage {String(index + 1).padStart(2, "0")} · Design decisions
        </p>
        <h2 id={`stage-${stage.id}`}>{stage.title}</h2>
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
          <span>Your original requirements</span>
          <textarea
            rows={7}
            maxLength={MAX_ANSWER_LENGTH}
            value={originalText}
            readOnly={reviewed}
            onChange={(event) =>
              save("attempt", { kind: "text", text: event.target.value })
            }
            placeholder="Describe the users, core actions, constraints, and the questions you would ask first…"
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
            {older
              ? "Review the current reference"
              : "Reveal reference requirements"}
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
              <span>Your revised requirements</span>
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
                placeholder="State the clarified scope, assumptions, and one justified tradeoff…"
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
          <h3>Connect the requirements to a working model</h3>
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
      {workshop.stages.map((stage, index) => (
        <Stage key={stage.id} stage={stage} workshop={workshop} index={index} />
      ))}
    </div>
  );
}
