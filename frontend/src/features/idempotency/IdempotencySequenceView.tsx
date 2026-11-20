import { useId, useLayoutEffect, useRef, useState } from "react";
import type {
  IdempotencyDescriptor,
  IdempotencyOutcome,
  IdempotencyState,
} from "../../api/types";
import authored from "./idempotencyAuthoredPaths.json";
import { IdempotencyStateView } from "./IdempotencyStateView";
import { outcomeLabels } from "./idempotencyLabels";
import { modeLabels } from "./idempotencyForm";
import "./Idempotency.css";
import "./IdempotencyDesign.css";

type AuthoredStep = {
  id: string;
  title: string;
  from: string;
  to: string;
  detail: string;
  sequence: number;
  timeMs: number;
  kind?: IdempotencyOutcome["kind"];
  callId?: string;
  state: IdempotencyState;
};
type AuthoredPath = {
  id: string;
  title: string;
  presetId: string;
  summary: string;
  takeaway: string;
  steps: AuthoredStep[];
};
/** Authored repository content; Java and fixture tests verify every state against its named preset. */
export const authoredIdempotencyPaths = authored as AuthoredPath[];

export function IdempotencySequenceView({
  descriptor,
}: {
  descriptor: IdempotencyDescriptor;
}) {
  const scope = useId();
  const [pathId, setPathId] = useState(authoredIdempotencyPaths[0]!.id),
    [position, setPosition] = useState(0);
  const previous = useRef<HTMLButtonElement>(null),
    next = useRef<HTMLButtonElement>(null);
  const path = authoredIdempotencyPaths.find((entry) => entry.id === pathId)!,
    step = path.steps[position]!;
  const preset = descriptor.presets.find((entry) => entry.id === path.presetId);
  const movedWithFocus = useRef<"previous" | "next" | null>(null);
  useLayoutEffect(() => {
    if (movedWithFocus.current === "next" && next.current?.disabled)
      previous.current?.focus();
    else if (
      movedWithFocus.current === "previous" &&
      previous.current?.disabled
    )
      next.current?.focus();
    movedWithFocus.current = null;
  }, [position]);
  function move(direction: -1 | 1) {
    const control = direction === -1 ? previous.current : next.current;
    if (document.activeElement === control)
      movedWithFocus.current = direction === -1 ? "previous" : "next";
    setPosition((current) =>
      Math.max(0, Math.min(path.steps.length - 1, current + direction)),
    );
  }
  if (!preset)
    return (
      <p role="alert">
        This authored path has no matching scenario in the current idempotency
        model. Refresh the module and try again.
      </p>
    );
  return (
    <div className="idem-design">
      <header className="idem-design-intro">
        <p className="eyebrow">
          Call sequence · Publication, receipt and response
        </p>
        <h2>Trace a lost response and two racing calls</h2>
        <p>
          Walk through a protected retry, a split-write race, and the atomic
          publication recheck. Follow the public ledger and retained receipt
          alongside each call's observation.
        </p>
        <p className="idem-design-scope">
          Authored illustrations · Manual causal steps · No live Java run or
          animation clock · Use Playground or Guided for returned Java evidence
        </p>
      </header>
      <fieldset className="idem-path-choice">
        <legend>Choose an authored idempotency path</legend>
        {authoredIdempotencyPaths.map((entry) => (
          <label key={entry.id}>
            <input
              type="radio"
              name={`${scope}-path`}
              checked={entry.id === pathId}
              onChange={() => {
                setPathId(entry.id);
                setPosition(0);
              }}
            />
            <span>{entry.title}</span>
          </label>
        ))}
      </fieldset>
      <section
        className="idem-design-card"
        aria-label="Selected idempotency path step"
      >
        <div className="idem-scene-heading">
          <p className="eyebrow">
            Snapshot {position + 1} of {path.steps.length} · {step.id}
          </p>
          <span>Authored state · {step.timeMs} ms virtual time</span>
        </div>
        <h3>{step.title}</h3>
        <p className="idem-path-edge">
          {step.from} → {step.to}
        </p>
        <p>{step.detail}</p>
        <p className="idem-design-scope">
          {step.kind
            ? `${outcomeLabels[step.kind]} · ${step.kind} · call ${step.callId}`
            : "Initial state before the first authored action"}
        </p>
        <div className="idem-path-controls">
          <button
            ref={previous}
            type="button"
            disabled={!position}
            onClick={() => move(-1)}
          >
            Previous idempotency path step
          </button>
          <button
            ref={next}
            type="button"
            disabled={position === path.steps.length - 1}
            onClick={() => move(1)}
          >
            Next idempotency path step
          </button>
          <button type="button" onClick={() => setPosition(0)}>
            Reset idempotency path
          </button>
        </div>
        <p className="idem-design-scope" role="status">
          Selected authored snapshot {position + 1} of {path.steps.length} at{" "}
          {step.timeMs} ms.
        </p>
        <IdempotencyStateView
          input={preset.input}
          state={step.state}
          selectedCallId={step.callId}
        />
      </section>
      <section
        className="idem-design-card"
        aria-label="Authored idempotency path explanation"
      >
        <h3>{path.title}</h3>
        <p>{path.summary}</p>
        <p className="idem-design-takeaway">{path.takeaway}</p>
        <p className="idem-design-scope">
          Illustrates scenario {path.presetId} · {modeLabels[preset.input.mode]}{" "}
          · retention {preset.input.retentionMs} ms. The retained key protects a
          bounded lookup scope; it does not establish physical durability or
          external provider guarantees.
        </p>
      </section>
      <details className="idem-full-sequence">
        <summary>Full idempotency text sequence</summary>
        <section aria-label="Authored idempotency sequence">
          <h3>Every authored step in order</h3>
          <ol>
            {path.steps.map((entry, index) => (
              <li
                key={entry.id}
                aria-current={index === position ? "step" : undefined}
              >
                <p className="eyebrow">
                  {entry.id} · {entry.timeMs} ms virtual time
                </p>
                <h4>{entry.title}</h4>
                <p>
                  {entry.from} → {entry.to}. {entry.detail}
                </p>
                <p className="idem-design-scope">
                  {entry.kind
                    ? `${entry.kind} · call ${entry.callId}`
                    : "Initial state"}{" "}
                  · published units {entry.state.publishedUnits} · active keys{" "}
                  {entry.state.activeKeyCount} · expired keys{" "}
                  {entry.state.expiredKeyCount}
                </p>
                <details className="idem-authored-snapshot">
                  <summary>Call and receipt details for {entry.id}</summary>
                  <IdempotencyStateView
                    input={preset.input}
                    state={entry.state}
                    selectedCallId={entry.callId}
                  />
                </details>
              </li>
            ))}
          </ol>
        </section>
      </details>
    </div>
  );
}
