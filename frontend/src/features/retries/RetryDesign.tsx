import { useId, useLayoutEffect, useRef, useState } from "react";
import type {
  RetryAttemptState,
  RetryEvent,
  RetryRequestState,
} from "../../api/types";
import {
  callerLabels,
  requestPhaseLabels,
  retryFailureLabels,
  workLabels,
} from "./retryLabels";
import "./RetryDesign.css";

const responsibilities = [
  {
    id: "caller",
    title: "Logical caller",
    subtitle: "One original request and its overall deadline",
    detail:
      "An original request can send several attempts but has one caller outcome. Its arrival-relative overall deadline stops waiting and future retry dispatch. A logical failure does not remove accepted server work.",
    takeaway:
      "Name the original caller outcome separately from the attempts it sent.",
  },
  {
    id: "attempt",
    title: "Attempt waiting",
    subtitle: "Each send has its own caller clock",
    detail:
      "An accepted attempt's timeout starts at send and includes queue waiting. Rejected attempts have no accepted-work timeout. A timeout ends that attempt's caller wait; its server work can remain queued, running or eventually completed.",
    takeaway:
      "Timed out and still running can both be true for the same attempt.",
  },
  {
    id: "policy",
    title: "Retry policy",
    subtitle: "Decide whether and when another send is allowed",
    detail:
      "The policy checks maximum attempts, then the shared finite-batch retry budget, then chooses a delay. A proposal at or beyond the overall deadline is not scheduled. A scheduled retry still rechecks the shared budget at actual dispatch; planning reserves no token.",
    takeaway:
      "A proposal, a scheduled retry and an actual sent attempt are three different facts.",
  },
  {
    id: "admission",
    title: "Server admission",
    subtitle: "Accept work only when the dependency can take it",
    detail:
      "An unavailable dependency or a full waiting queue rejects a send without accepting server work. Zero queue slots still permits an idle worker to start immediately. An attempt count includes rejected sends; accepted work is a separate population.",
    takeaway: "More sends do not necessarily mean more accepted server work.",
  },
  {
    id: "workers",
    title: "FIFO queue and workers",
    subtitle: "Accepted work belongs to the server until it drains",
    detail:
      "Workers take accepted work from the returned FIFO queue. A timed-out waiter keeps its place. Completion releases a worker, evaluates whether that actual attempt's caller still waits, then promotes existing FIFO work before new equal-time arrivals. Late completion cannot satisfy a newer attempt.",
    takeaway: "Ending caller patience is not a cancellation protocol.",
  },
  {
    id: "effects",
    title: "Business-effect boundary",
    subtitle: "Repeated server work does not define write safety",
    detail:
      "This model performs no business writes. Completed server attempts cannot prove that an order, payment or message happened twice, or that repeating it was safe. A real design needs a separate effect boundary, conflict handling and any required idempotency or durable deduplication mechanism.",
    takeaway:
      "Explain what the model proves, then identify the additional guarantee your real operation needs.",
  },
] as const;

export function RetryArchitectureView() {
  const scope = useId(),
    [selected, setSelected] = useState<string>("caller");
  const item = responsibilities.find((r) => r.id === selected)!;
  return (
    <div className="retry-design">
      <header className="retry-design-intro">
        <p className="eyebrow">Architecture · Ownership and boundaries</p>
        <h2>Who stops waiting, and who still owns the work?</h2>
        <p>
          The caller owns patience and retry decisions. The server owns admitted
          work. Inspect each responsibility before deciding what a timeout
          means.
        </p>
        <p className="retry-design-scope">
          Authored logical illustration · No Java run, actual network or
          deployed server
        </p>
      </header>
      <section className="retry-ownership" aria-label="Retry ownership diagram">
        {responsibilities.map((r, index) => (
          <button
            type="button"
            key={r.id}
            aria-label={`Inspect ${r.title}`}
            aria-pressed={selected === r.id}
            aria-controls={`${scope}-responsibility`}
            onClick={() => setSelected(r.id)}
          >
            <span className="eyebrow">0{index + 1} · Responsibility</span>
            <strong>{r.title}</strong>
            <span>{r.subtitle}</span>
            <small>Inspect this responsibility ↓</small>
          </button>
        ))}
      </section>
      <section
        className="retry-ownership-flow"
        aria-label="Retry ownership flow"
      >
        <p>
          <strong>Send and admission</strong> Logical caller → actual attempt →
          admission → worker or FIFO queue
        </p>
        <p>
          <strong>Caller timeout</strong> Stop waiting → retry policy; already
          accepted server work continues
        </p>
        <p>
          <strong>Server completion</strong> Current waiting attempt → caller
          success; an old timed-out attempt → late work only
        </p>
      </section>
      <section
        id={`${scope}-responsibility`}
        className="retry-design-card"
        aria-label="Selected retry responsibility"
        aria-live="polite"
      >
        <p className="eyebrow">{item.title}</p>
        <h3>{item.subtitle}</h3>
        <p>{item.detail}</p>
        <p className="retry-design-takeaway">{item.takeaway}</p>
      </section>
      <section
        className="retry-design-card"
        aria-label="Retry architecture text equivalent"
      >
        <h3>Follow the ownership in words</h3>
        <ol>
          <li>
            An original caller arrives with an overall deadline and sends an
            actual attempt.
          </li>
          <li>
            Server admission either rejects that attempt or accepts it into an
            idle worker or the finite FIFO queue.
          </li>
          <li>
            For accepted work, the caller's attempt timeout includes queue wait.
            Timeout stops that caller wait without cancelling accepted work.
          </li>
          <li>
            The retry policy checks attempt and budget limits, chooses a
            recorded delay, and distinguishes a blocked proposal from a
            scheduled dispatch.
          </li>
          <li>
            Dispatch rechecks the shared budget. Accepted work drains
            independently; only a response to the currently awaited attempt can
            succeed its caller.
          </li>
          <li>
            Business effects, safe write repetition, idempotency and durability
            need separate design evidence outside this model.
          </li>
        </ol>
      </section>
      <section className="retry-design-card">
        <h3>Explain it to a teammate or interviewer</h3>
        <p>
          “A timeout bounds how long we wait. It does not establish that the
          server stopped. Retrying can add another unit of work, so we need a
          total deadline, a bounded retry policy and enough server capacity. For
          writes, we must separately decide how repeated effects are prevented
          or handled.”
        </p>
        <p>
          Follow up: What if the queue is full? What if the operation charges
          money? Change the admission policy for the first question and define a
          business-effect boundary for the second.
        </p>
      </section>
    </div>
  );
}

type Target = {
  kind: RetryEvent["kind"];
  requestId: string;
  attemptId?: string;
  occurrence: 1;
};
type AttemptFact = Pick<RetryAttemptState, "id" | "callerState" | "workState">;
type Facts = {
  phase: RetryRequestState["phase"];
  attemptsSent: number;
  activeAttemptId?: string;
  nextRetryAtMs?: number;
  finishedAtMs?: number;
  failureReason?: RetryRequestState["failureReason"];
  queue: string[];
  workerAttemptId?: string;
  budget: number;
  attempts: AttemptFact[];
  proposedRetryAtMs?: number;
};
type AuthoredStep = {
  id: string;
  title: string;
  detail: string;
  from: string;
  to: string;
  timeMs: number;
  target?: Target;
  facts: Facts;
};
const target = (kind: RetryEvent["kind"], attemptId?: string): Target => ({
  kind,
  requestId: "a",
  ...(attemptId ? { attemptId } : {}),
  occurrence: 1,
});
const attempt = (
  id: string,
  callerState: RetryAttemptState["callerState"],
  workState: RetryAttemptState["workState"],
): AttemptFact => ({ id, callerState, workState });
// Fixed authored facts, checked against semantic targets in the actual Java goldens.
// These helpers assemble illustrations; no behavior, schedule or outcomes are computed.
const initial: AuthoredStep = {
  id: "initial",
  title: "Before the original arrives",
  detail:
    "No attempt has been sent. The server is idle and all 48 retry tokens remain.",
  from: "Submitted workload",
  to: "Initial caller and server state",
  timeMs: 0,
  facts: {
    phase: "NOT_ARRIVED",
    attemptsSent: 0,
    queue: [],
    budget: 48,
    attempts: [],
  },
};
export const authoredRetryPaths: readonly {
  id: string;
  title: string;
  presetId: string;
  summary: string;
  takeaway: string;
  steps: readonly AuthoredStep[];
}[] = [
  {
    id: "late-work",
    title: "A timeout leaves accepted work running",
    presetId: "late-work",
    summary:
      "One worker · 2 waiting slots · 80 ms service · 50 ms attempt timeout · 500 ms overall timeout · at most 2 attempts · immediate retry.",
    takeaway:
      "The caller fails at 100 ms, but accepted work finishes draining at 160 ms. A caller outcome and server completion answer different questions.",
    steps: [
      initial,
      {
        id: "first-start",
        title: "The original starts on the worker",
        detail:
          "At 0 ms, a-a1 starts. Its caller waits for this actual attempt; no retry exists.",
        from: "Original send",
        to: "Worker owns a-a1",
        timeMs: 0,
        target: target("WORK_STARTED", "a-a1"),
        facts: {
          phase: "WAITING",
          attemptsSent: 1,
          activeAttemptId: "a-a1",
          queue: [],
          workerAttemptId: "a-a1",
          budget: 48,
          attempts: [attempt("a-a1", "WAITING", "RUNNING")],
        },
      },
      {
        id: "timeout",
        title: "Caller patience ends; server work continues",
        detail:
          "At 50 ms, a-a1 times out for its caller. The worker keeps running it. This snapshot is the retry-decision microstep, before a new send.",
        from: "Attempt deadline",
        to: "Caller stops waiting; worker unchanged",
        timeMs: 50,
        target: target("ATTEMPT_TIMED_OUT", "a-a1"),
        facts: {
          phase: "DECIDING_RETRY",
          attemptsSent: 1,
          queue: [],
          workerAttemptId: "a-a1",
          budget: 48,
          attempts: [attempt("a-a1", "TIMED_OUT", "RUNNING")],
        },
      },
      {
        id: "retry-queued",
        title: "The retry joins the queue",
        detail:
          "An immediate retry spends one token and sends a-a2 at 50 ms. The original still owns the worker, so a-a2 waits in FIFO. Its own timeout starts at this send, not at service start.",
        from: "Retry dispatch",
        to: "a-a2 accepted into FIFO",
        timeMs: 50,
        target: target("WORK_QUEUED", "a-a2"),
        facts: {
          phase: "WAITING",
          attemptsSent: 2,
          activeAttemptId: "a-a2",
          queue: ["a-a2"],
          workerAttemptId: "a-a1",
          budget: 47,
          attempts: [
            attempt("a-a1", "TIMED_OUT", "RUNNING"),
            attempt("a-a2", "WAITING", "QUEUED"),
          ],
        },
      },
      {
        id: "late-original",
        title: "The original finishes late; the retry starts",
        detail:
          "At 80 ms, a-a1 completes without satisfying a-a2's caller. The same completion callback promotes queued a-a2 onto the worker. No extra elapsed gap is implied.",
        from: "Late original completion",
        to: "FIFO promotion of a-a2",
        timeMs: 80,
        target: target("WORK_STARTED", "a-a2"),
        facts: {
          phase: "WAITING",
          attemptsSent: 2,
          activeAttemptId: "a-a2",
          queue: [],
          workerAttemptId: "a-a2",
          budget: 47,
          attempts: [
            attempt("a-a1", "TIMED_OUT", "COMPLETED"),
            attempt("a-a2", "WAITING", "RUNNING"),
          ],
        },
      },
      {
        id: "caller-fails",
        title: "The caller fails while the retry still runs",
        detail:
          "At 100 ms, a-a2's caller timeout expires. The policy has used both allowed attempts and fails the original request. The worker still owns a-a2.",
        from: "Second caller timeout",
        to: "Maximum attempts reached",
        timeMs: 100,
        target: target("REQUEST_FAILED"),
        facts: {
          phase: "FAILED",
          attemptsSent: 2,
          finishedAtMs: 100,
          failureReason: "ATTEMPTS_EXHAUSTED",
          queue: [],
          workerAttemptId: "a-a2",
          budget: 47,
          attempts: [
            attempt("a-a1", "TIMED_OUT", "COMPLETED"),
            attempt("a-a2", "TIMED_OUT", "RUNNING"),
          ],
        },
      },
      {
        id: "server-drained",
        title: "Server work drains after caller failure",
        detail:
          "At 160 ms, a-a2 completes late. The caller remains failed at its recorded 100 ms finish; no completion revives it. Both attempts consumed server work, not modeled business effects.",
        from: "Late retry completion",
        to: "Idle server; caller still failed",
        timeMs: 160,
        target: target("WORK_COMPLETED", "a-a2"),
        facts: {
          phase: "FAILED",
          attemptsSent: 2,
          finishedAtMs: 100,
          failureReason: "ATTEMPTS_EXHAUSTED",
          queue: [],
          budget: 47,
          attempts: [
            attempt("a-a1", "TIMED_OUT", "COMPLETED"),
            attempt("a-a2", "TIMED_OUT", "COMPLETED"),
          ],
        },
      },
    ],
  },
  {
    id: "backoff",
    title: "Backoff reaches a recovered dependency",
    presetId: "backoff-recovery",
    summary:
      "Unavailable until 60 ms · 20 ms service · base delay 40 ms, cap 80 ms, no jitter · 200 ms overall timeout · at most 3 attempts.",
    takeaway:
      "The sends occur at 0, 40 and 120 ms. Delay is relative to each failure, so the successful third send crosses recovery in this workload; this is not a universal improvement guarantee.",
    steps: [
      initial,
      {
        id: "first-rejection",
        title: "The first rejected send schedules 40 ms",
        detail:
          "At 0 ms the dependency rejects a-a1. No server work is accepted. A 40 ms delay schedules the next send at 40 ms without yet spending a retry token.",
        from: "Unavailable dependency",
        to: "Scheduled retry at 40 ms",
        timeMs: 0,
        target: target("RETRY_SCHEDULED", "a-a1"),
        facts: {
          phase: "BACKING_OFF",
          attemptsSent: 1,
          nextRetryAtMs: 40,
          queue: [],
          budget: 48,
          attempts: [attempt("a-a1", "REJECTED", "NOT_ACCEPTED")],
        },
      },
      {
        id: "second-rejection",
        title: "The next 80 ms delay lands at 120 ms",
        detail:
          "At 40 ms, a-a2 dispatches and spends one token, but the dependency is still unavailable. The next delay is 80 ms from this failure: 40 + 80 = 120 ms.",
        from: "Second rejection at 40 ms",
        to: "Scheduled retry at 120 ms",
        timeMs: 40,
        target: target("RETRY_SCHEDULED", "a-a2"),
        facts: {
          phase: "BACKING_OFF",
          attemptsSent: 2,
          nextRetryAtMs: 120,
          queue: [],
          budget: 47,
          attempts: [
            attempt("a-a1", "REJECTED", "NOT_ACCEPTED"),
            attempt("a-a2", "REJECTED", "NOT_ACCEPTED"),
          ],
        },
      },
      {
        id: "recovered-start",
        title: "The third send starts after recovery",
        detail:
          "At 120 ms, a-a3 spends the second retry token and is admitted onto the idle worker. Only this third attempt contributes accepted server work.",
        from: "Retry dispatch after 60 ms recovery",
        to: "Worker starts a-a3",
        timeMs: 120,
        target: target("WORK_STARTED", "a-a3"),
        facts: {
          phase: "WAITING",
          attemptsSent: 3,
          activeAttemptId: "a-a3",
          queue: [],
          workerAttemptId: "a-a3",
          budget: 46,
          attempts: [
            attempt("a-a1", "REJECTED", "NOT_ACCEPTED"),
            attempt("a-a2", "REJECTED", "NOT_ACCEPTED"),
            attempt("a-a3", "WAITING", "RUNNING"),
          ],
        },
      },
      {
        id: "success",
        title: "The current response succeeds the caller",
        detail:
          "At 140 ms, a-a3 completes while its own caller is still waiting. The explicit success decision marks it responded and succeeds the original; earlier rejected attempts remain rejected history.",
        from: "Current attempt response",
        to: "Caller succeeds at 140 ms",
        timeMs: 140,
        target: target("REQUEST_SUCCEEDED"),
        facts: {
          phase: "SUCCEEDED",
          attemptsSent: 3,
          finishedAtMs: 140,
          queue: [],
          budget: 46,
          attempts: [
            attempt("a-a1", "REJECTED", "NOT_ACCEPTED"),
            attempt("a-a2", "REJECTED", "NOT_ACCEPTED"),
            attempt("a-a3", "RESPONDED", "COMPLETED"),
          ],
        },
      },
    ],
  },
  {
    id: "deadline",
    title: "A retry proposal cannot extend the deadline",
    presetId: "deadline-before-retry",
    summary:
      "Same unavailable-until-60 ms workload and 40/80 ms delays · overall timeout shortened to 100 ms.",
    takeaway:
      "At 40 ms the policy rejects a proposed send at 120 ms. No third attempt is scheduled or sent; the caller actually fails at 100 ms.",
    steps: [
      initial,
      {
        id: "first-retry",
        title: "The first retry still fits",
        detail:
          "At 0 ms the first send is rejected and a 40 ms retry is scheduled. That dispatch fits the 100 ms overall deadline.",
        from: "First rejected send",
        to: "Scheduled dispatch at 40 ms",
        timeMs: 0,
        target: target("RETRY_SCHEDULED", "a-a1"),
        facts: {
          phase: "BACKING_OFF",
          attemptsSent: 1,
          nextRetryAtMs: 40,
          queue: [],
          budget: 48,
          attempts: [attempt("a-a1", "REJECTED", "NOT_ACCEPTED")],
        },
      },
      {
        id: "blocked-proposal",
        title: "The proposed 120 ms retry is blocked",
        detail:
          "At 40 ms, a-a2 is rejected. The 80 ms delay proposes 120 ms, at or beyond the overall deadline. The caller awaits its actual deadline; no retry callback or future attempt row is created.",
        from: "40 ms failure + 80 ms proposed delay",
        to: "No scheduled retry; await 100 ms deadline",
        timeMs: 40,
        target: target("RETRY_BLOCKED_BY_DEADLINE", "a-a2"),
        facts: {
          phase: "AWAITING_DEADLINE",
          attemptsSent: 2,
          queue: [],
          budget: 47,
          proposedRetryAtMs: 120,
          attempts: [
            attempt("a-a1", "REJECTED", "NOT_ACCEPTED"),
            attempt("a-a2", "REJECTED", "NOT_ACCEPTED"),
          ],
        },
      },
      {
        id: "actual-deadline",
        title: "The actual deadline ends the caller wait",
        detail:
          "At 100 ms, the logical request fails for its overall deadline. Its two rejected sends remain historical facts. There was no accepted server work and no third attempt.",
        from: "Overall deadline at 100 ms",
        to: "Caller fails without another send",
        timeMs: 100,
        target: target("REQUEST_FAILED"),
        facts: {
          phase: "FAILED",
          attemptsSent: 2,
          finishedAtMs: 100,
          failureReason: "OVERALL_DEADLINE",
          queue: [],
          budget: 47,
          attempts: [
            attempt("a-a1", "REJECTED", "NOT_ACCEPTED"),
            attempt("a-a2", "REJECTED", "NOT_ACCEPTED"),
          ],
        },
      },
    ],
  },
];

function AuthoredFacts({ facts }: { facts: Facts }) {
  return (
    <div className="retry-authored-facts">
      <dl className="retry-authored-values">
        <div>
          <dt>Logical caller</dt>
          <dd>{requestPhaseLabels[facts.phase]}</dd>
        </div>
        <div>
          <dt>Actual attempts sent</dt>
          <dd>{facts.attemptsSent}</dd>
        </div>
        <div>
          <dt>Active caller attempt</dt>
          <dd>{facts.activeAttemptId ?? "None"}</dd>
        </div>
        <div>
          <dt>Scheduled retry</dt>
          <dd>
            {facts.nextRetryAtMs === undefined
              ? "None scheduled"
              : `${facts.nextRetryAtMs} ms`}
          </dd>
        </div>
        <div>
          <dt>Worker owns</dt>
          <dd>{facts.workerAttemptId ?? "Idle"}</dd>
        </div>
        <div>
          <dt>FIFO waiting</dt>
          <dd>{facts.queue.length ? facts.queue.join(" → ") : "Empty"}</dd>
        </div>
        <div>
          <dt>Retry tokens remaining</dt>
          <dd>{facts.budget}</dd>
        </div>
        <div>
          <dt>Caller finished</dt>
          <dd>
            {facts.finishedAtMs === undefined
              ? "Not finished"
              : `${facts.finishedAtMs} ms`}
          </dd>
        </div>
        {facts.failureReason && (
          <div>
            <dt>Logical failure reason</dt>
            <dd>{retryFailureLabels[facts.failureReason]}</dd>
          </div>
        )}
        {facts.proposedRetryAtMs !== undefined && (
          <div>
            <dt>Blocked proposal</dt>
            <dd>{facts.proposedRetryAtMs} ms · not scheduled</dd>
          </div>
        )}
      </dl>
      {facts.attempts.length ? (
        <ul className="retry-authored-attempts">
          {facts.attempts.map((a) => (
            <li key={a.id}>
              <strong>{a.id}</strong>
              <span>Caller: {callerLabels[a.callerState]}</span>
              <span>Server work: {workLabels[a.workState]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>No actual attempts yet.</p>
      )}
    </div>
  );
}
export function RetrySequenceView() {
  const scope = useId(),
    [pathId, setPathId] = useState("late-work"),
    [position, setPosition] = useState(0);
  const previous = useRef<HTMLButtonElement>(null),
    next = useRef<HTMLButtonElement>(null);
  const path = authoredRetryPaths.find((p) => p.id === pathId)!,
    step = path.steps[position]!;
  useLayoutEffect(() => {
    if (document.activeElement === next.current && next.current?.disabled)
      previous.current?.focus();
    else if (
      document.activeElement === previous.current &&
      previous.current?.disabled
    )
      next.current?.focus();
  }, [position]);
  return (
    <div className="retry-design">
      <header className="retry-design-intro">
        <p className="eyebrow">
          Request sequence · Caller decisions and server work
        </p>
        <h2>Trace the wait, the retry and the work separately</h2>
        <p>
          Compare a timeout that adds queued work, a delay that crosses
          recovery, and a proposal blocked by the overall deadline.
        </p>
        <p className="retry-design-scope">
          Authored illustrations · Manual causal steps · No live Java run or
          animation clock · Use Playground or Guided for returned Java evidence
        </p>
      </header>
      <fieldset className="retry-path-choice">
        <legend>Choose an authored retry path</legend>
        {authoredRetryPaths.map((p) => (
          <label key={p.id}>
            <input
              type="radio"
              name={`${scope}-path`}
              checked={p.id === pathId}
              onChange={() => {
                setPathId(p.id);
                setPosition(0);
              }}
            />
            <span>{p.title}</span>
          </label>
        ))}
      </fieldset>
      <section
        className="retry-design-card"
        aria-label="Selected retry path step"
        aria-live="polite"
      >
        <div className="retry-scene-heading">
          <p className="eyebrow">
            Step {position + 1} of {path.steps.length} · {step.id}
          </p>
          <span>Authored state · {step.timeMs} ms virtual time</span>
        </div>
        <h3>{step.title}</h3>
        <p className="retry-path-edge">
          {step.from} → {step.to}
        </p>
        <p>{step.detail}</p>
        <AuthoredFacts facts={step.facts} />
        <div className="retry-path-controls">
          <button
            ref={previous}
            type="button"
            disabled={!position}
            onClick={() => setPosition(position - 1)}
          >
            Previous retry path step
          </button>
          <button
            ref={next}
            type="button"
            disabled={position === path.steps.length - 1}
            onClick={() => setPosition(position + 1)}
          >
            Next retry path step
          </button>
          <button type="button" onClick={() => setPosition(0)}>
            Reset retry path
          </button>
        </div>
      </section>
      <section
        className="retry-design-card"
        aria-label="Authored retry path explanation"
      >
        <h3>{path.title}</h3>
        <p>{path.summary}</p>
        <p className="retry-design-takeaway">{path.takeaway}</p>
        <p className="retry-design-scope">
          Illustrates preset {path.presetId}. Server completion is modeled work,
          not a business effect. No cancellation, write-safety, idempotency or
          durability guarantee is established.
        </p>
      </section>
      <details className="retry-full-sequence">
        <summary>Full retry text sequence</summary>
        <section aria-label="Authored retry sequence">
          <h3>Every authored step in order</h3>
          <ol>
            {path.steps.map((s, index) => (
              <li
                key={s.id}
                aria-current={index === position ? "step" : undefined}
              >
                <p className="eyebrow">
                  {s.id} · {s.timeMs} ms virtual time
                </p>
                <h4>{s.title}</h4>
                <p>
                  {s.from} → {s.to}. {s.detail}
                </p>
                <AuthoredFacts facts={s.facts} />
              </li>
            ))}
          </ol>
        </section>
      </details>
    </div>
  );
}
