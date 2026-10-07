import { useSyncExternalStore } from "react";
import type { Question } from "../../api/types";
import {
  getPracticeStore,
  MAX_ANSWER_LENGTH,
  serializeAnswers,
  type PracticeAnswer,
} from "./practiceStorage";
import "./PracticeView.css";

function download(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

type AnswerProps = {
  saved?: PracticeAnswer;
  contentVersion: string;
  save: (answer: PracticeAnswer["answer"], referenceViewed: boolean) => void;
};

function VersionNotice({
  saved,
  contentVersion,
}: Pick<AnswerProps, "saved" | "contentVersion">) {
  return saved && saved.contentVersion !== contentVersion ? (
    <p className="practice-version-note" role="note">
      Your answer was saved for content v{saved.contentVersion}. Review it
      against this lesson before comparing again.
    </p>
  ) : null;
}

function ChoiceQuestion({
  question,
  number,
  saved,
  contentVersion,
  save,
}: {
  question: Question;
  number: number;
} & AnswerProps) {
  const choice =
    saved?.answer.kind === "choice" ? (saved.answer.optionId ?? "") : "";
  const knownChoice = question.options?.some((option) => option.id === choice);
  const checked = Boolean(
    choice &&
    knownChoice &&
    saved?.referenceViewed &&
    saved.contentVersion === contentVersion,
  );
  const correct = choice === question.correctOptionId;
  return (
    <article className="question-card">
      <div className="question-number">
        QUESTION {String(number).padStart(2, "0")}
      </div>
      <h3>{question.prompt}</h3>
      <VersionNotice saved={saved} contentVersion={contentVersion} />
      {choice && !knownChoice && (
        <p className="practice-version-note">
          Your previous choice ({choice}) is no longer an option. Choose again
          to review this question.
        </p>
      )}
      <fieldset disabled={checked}>
        <legend className="sr-only">Choose one answer</legend>
        {question.options?.map((option) => (
          <label
            key={option.id}
            className={`answer-option ${checked && option.id === question.correctOptionId ? "correct" : ""} ${checked && option.id === choice && !correct ? "incorrect" : ""}`}
          >
            <input
              type="radio"
              name={question.id}
              value={option.id}
              checked={choice === option.id}
              onChange={() =>
                save({ kind: "choice", optionId: option.id }, true)
              }
            />
            <span>{option.id.toUpperCase()}</span>
            {option.label}
          </label>
        ))}
      </fieldset>
      {checked && (
        <div
          className={`answer-feedback ${correct ? "correct" : "incorrect"}`}
          role="status"
        >
          <strong>
            {correct ? "That reasoning holds." : "Recheck where time is spent."}
          </strong>
          <p>{question.explanation}</p>
          {question.followUp && (
            <p>
              <b>Go further:</b> {question.followUp}
            </p>
          )}
          <button
            type="button"
            onClick={() => save({ kind: "choice", optionId: null }, false)}
          >
            Try again
          </button>
        </div>
      )}
      {choice && knownChoice && !checked && (
        <button
          className="button secondary"
          type="button"
          onClick={() => save({ kind: "choice", optionId: choice }, true)}
        >
          Review saved choice
        </button>
      )}
    </article>
  );
}

function InterviewQuestion({
  question,
  number,
  saved,
  contentVersion,
  save,
}: {
  question: Question;
  number: number;
} & AnswerProps) {
  const answer = saved?.answer.kind === "text" ? saved.answer.text : "";
  const revealed = Boolean(
    saved?.referenceViewed && saved.contentVersion === contentVersion,
  );
  return (
    <article className="question-card interview-question">
      <div className="question-number">
        INTERVIEW PROMPT {String(number).padStart(2, "0")}
      </div>
      <h3>{question.prompt}</h3>
      <VersionNotice saved={saved} contentVersion={contentVersion} />
      <label>
        Your explanation
        <textarea
          rows={6}
          value={answer}
          maxLength={MAX_ANSWER_LENGTH}
          onChange={(e) =>
            save({ kind: "text", text: e.target.value }, revealed)
          }
          placeholder="State your assumptions, trace the request, and explain the tradeoff…"
        />
      </label>
      <p className="practice-answer-limit">
        {answer.length.toLocaleString()} / {MAX_ANSWER_LENGTH.toLocaleString()}{" "}
        characters
      </p>
      <button
        className="button primary"
        type="button"
        onClick={() => save({ kind: "text", text: answer }, true)}
      >
        Compare with a model answer
      </button>
      {revealed && (
        <div className="model-answer">
          <p className="eyebrow">Self-check</p>
          <ul>
            {question.rubric?.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <strong>Example answer</strong>
          <p>{question.modelAnswer}</p>
        </div>
      )}
    </article>
  );
}

export function PracticeView({
  questions,
  topicId,
  contentVersion,
  title = "Turn the model into interview language",
  description = "Answer before revealing the explanation. The final prompt asks you to make the reasoning clear without relying on the visual.",
}: {
  questions: Question[];
  topicId: string;
  contentVersion: string;
  title?: string;
  description?: string;
}) {
  const store = getPracticeStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const answerProps = (question: Question): AnswerProps => ({
    saved: snapshot.answers.find(
      (answer) =>
        answer.topicId === topicId && answer.activityId === question.id,
    ),
    contentVersion,
    save: (answer, referenceViewed) =>
      store.save({
        topicId,
        activityId: question.id,
        contentVersion,
        answer,
        referenceViewed,
      }),
  });
  return (
    <div className="practice-view">
      <div className="concept-intro">
        <p className="eyebrow">Recall and explain</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <section
        className={`practice-save-bar ${snapshot.issue ? "practice-save-warning" : ""}`}
        aria-label="Practice answer storage"
      >
        <div>
          <p className="practice-save-title" role="status">
            {snapshot.issue
              ? "Answers are kept for this session only"
              : "Saved on this browser"}
          </p>
          <p>
            {snapshot.issue
              ? `${snapshot.issue} Download your answers before leaving or reloading. Previous saved data has not been replaced.`
              : "Your choices and explanations save automatically. They stay on this browser and are not sent to the server. Saving an answer does not mark a module complete."}
          </p>
        </div>
        <div className="practice-save-actions">
          <button
            className="button secondary"
            type="button"
            disabled={snapshot.answers.length === 0}
            onClick={() =>
              download(
                serializeAnswers(snapshot.answers),
                "hld-practice-answers.json",
              )
            }
          >
            Download answers
          </button>
          {snapshot.previousData !== null && (
            <button
              className="button secondary"
              type="button"
              onClick={() =>
                download(
                  snapshot.previousData!,
                  "hld-practice-previous-data.json",
                )
              }
            >
              Download previous data
            </button>
          )}
        </div>
      </section>
      <div className="question-list">
        {questions.map((question, index) =>
          question.options ? (
            <ChoiceQuestion
              key={question.id}
              question={question}
              number={index + 1}
              {...answerProps(question)}
            />
          ) : (
            <InterviewQuestion
              key={question.id}
              question={question}
              number={index + 1}
              {...answerProps(question)}
            />
          ),
        )}
      </div>
    </div>
  );
}
