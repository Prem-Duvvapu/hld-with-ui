import { useState } from "react";
import type { Question } from "../../api/types";

function ChoiceQuestion({
  question,
  number,
}: {
  question: Question;
  number: number;
}) {
  const [choice, setChoice] = useState("");
  const checked = choice !== "";
  const correct = choice === question.correctOptionId;
  return (
    <article className="question-card">
      <div className="question-number">
        QUESTION {String(number).padStart(2, "0")}
      </div>
      <h3>{question.prompt}</h3>
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
              onChange={() => setChoice(option.id)}
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
          <button type="button" onClick={() => setChoice("")}>
            Try again
          </button>
        </div>
      )}
    </article>
  );
}

function InterviewQuestion({
  question,
  number,
}: {
  question: Question;
  number: number;
}) {
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  return (
    <article className="question-card interview-question">
      <div className="question-number">
        INTERVIEW PROMPT {String(number).padStart(2, "0")}
      </div>
      <h3>{question.prompt}</h3>
      <label>
        Your explanation
        <textarea
          rows={6}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="State your assumptions, trace the request, and explain the tradeoff…"
        />
      </label>
      <button
        className="button primary"
        type="button"
        disabled={!answer.trim()}
        onClick={() => setRevealed(true)}
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
  title = "Turn the model into interview language",
  description = "Answer before revealing the explanation. The final prompt asks you to make the reasoning clear without relying on the visual.",
}: {
  questions: Question[];
  title?: string;
  description?: string;
}) {
  return (
    <div className="practice-view">
      <div className="concept-intro">
        <p className="eyebrow">Recall and explain</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="question-list">
        {questions.map((question, index) =>
          question.options ? (
            <ChoiceQuestion
              key={question.id}
              question={question}
              number={index + 1}
            />
          ) : (
            <InterviewQuestion
              key={question.id}
              question={question}
              number={index + 1}
            />
          ),
        )}
      </div>
    </div>
  );
}
