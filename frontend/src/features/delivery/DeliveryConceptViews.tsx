import { useId, useState } from "react";
import "./DeliveryConceptViews.css";
const boundaries = [
  {
    id: "broker",
    label: "Inspect broker confirmation",
    title: "Broker · who may receive?",
    subtitle: "Ready → leased → acknowledged or dead letter",
    detail:
      "The broker assigns an attempt and a fresh lease token. An accepted ACK closes its current lease. Expiry makes another delivery possible; neither ACK nor dead-letter status writes or erases the ledger.",
    takeaway:
      "Check the current token and deadline before deciding whether an ACK is accepted. This model rejects an ACK at the deadline.",
  },
  {
    id: "consumer",
    label: "Inspect consumer processing",
    title: "Consumer · who is doing work?",
    subtitle: "Processing and ACK transport are separate actions",
    detail:
      "Each consumer has one processing slot. Committing an effect frees that slot, even while its ACK is pending. A crash cancels remaining local processing and ACK work; it preserves an effect that already committed.",
    takeaway:
      "A completed processing slot does not prove broker confirmation. A lost ACK does not undo the work.",
  },
  {
    id: "ledger",
    label: "Inspect ledger effects",
    title: "Ledger · what actually committed?",
    subtitle: "Durable append · no duplicate protection",
    detail:
      "Each observed effect appends an independent record. Repeating delivery can append a second record for the same message. The lease token protects the broker's confirmation decision; it does not fence a running ledger write.",
    takeaway:
      "An expired attempt can still commit. A later protection design must name the atomic identity-and-effect boundary, and the limits of an external provider.",
  },
] as const;
export function DeliveryArchitectureView() {
  const prefix = useId();
  const [selected, setSelected] =
    useState<(typeof boundaries)[number]["id"]>("broker");
  const boundary = boundaries.find((item) => item.id === selected)!;
  return (
    <div className="delivery-concepts">
      <header className="delivery-concept-intro">
        <p className="eyebrow">Architecture · Three owners, three facts</p>
        <h2>Who knows delivery, work and confirmation?</h2>
        <p>
          A broker controls delivery eligibility, a consumer performs work, and
          a ledger records effects. An ACK carries confirmation back to the
          broker.
        </p>
        <p className="delivery-concept-scope">
          Authored illustrative diagram · No new Java run · No shared
          transaction or duplicate protection · Not a broker emulator
        </p>
      </header>
      <section
        className="delivery-boundary-diagram"
        aria-label="Broker consumer ledger ownership diagram"
      >
        {boundaries.map((item, index) => (
          <div className="delivery-boundary-part" key={item.id}>
            <button
              type="button"
              className={`delivery-boundary ${selected === item.id ? "selected" : ""}`}
              aria-label={item.label}
              aria-pressed={selected === item.id}
              aria-controls={`${prefix}-boundary`}
              onClick={() => setSelected(item.id)}
            >
              <span className="eyebrow">0{index + 1} · Ownership</span>
              <strong>{item.title}</strong>
              <span>{item.subtitle}</span>
              <span className="delivery-inspect-hint">
                Inspect this boundary ↓
              </span>
            </button>
            {index < 2 && (
              <div className="delivery-boundary-edge" aria-hidden="true">
                <span className="delivery-edge-horizontal">
                  {index === 0 ? "Deliver → · ← ACK" : "Commit →"}
                </span>
                <span className="delivery-edge-vertical">
                  {index === 0 ? "Deliver ↓ · ↑ ACK" : "Commit ↓"}
                </span>
              </div>
            )}
          </div>
        ))}
      </section>
      <section
        id={`${prefix}-boundary`}
        className="delivery-concept-inspector"
        aria-label="Selected delivery boundary"
        aria-live="polite"
      >
        <p className="eyebrow">{boundary.title}</p>
        <h3>{boundary.subtitle}</h3>
        <p>{boundary.detail}</p>
        <p className="delivery-concept-takeaway">{boundary.takeaway}</p>
      </section>
      <section
        className="delivery-concept-text"
        aria-label="Delivery ownership text equivalent"
      >
        <h3>Follow the boundaries in words</h3>
        <ol>
          <li>
            The broker gives a consumer a message attempt and a lease token.
          </li>
          <li>
            The consumer commits an effect to the ledger and sends an ACK, in
            the configured order.
          </li>
          <li>
            The broker receives a delivered ACK and checks the current token
            strictly before the lease deadline.
          </li>
          <li>
            A lost ACK or cancelled local work can leave the message eligible
            for redelivery.
          </li>
          <li>
            The new attempt may append another effect. Broker confirmation does
            not make those appends one atomic operation.
          </li>
        </ol>
      </section>
      <div className="delivery-concept-notes">
        <section>
          <h3>State the boundary before the guarantee</h3>
          <p>
            The model keeps the broker and ledger durable across consumer
            crashes. It excludes producer failures, broker replication, lease
            extension and provider behavior. Its strict stale-token policy is
            illustrative.
          </p>
        </section>
        <section>
          <h3>Explain it to a teammate</h3>
          <p>
            “The ledger already has a record, but the broker did not receive
            confirmation. A retry can perform the work again. We need evidence
            for delivery attempts, durable mutations and ambiguous provider
            responses separately.”
          </p>
        </section>
      </div>
    </div>
  );
}
type Step = {
  time: number;
  from: string;
  to: string;
  title: string;
  explanation: string;
};
const paths: readonly {
  id: string;
  label: string;
  title: string;
  summary: string;
  takeaway: string;
  steps: readonly Step[];
}[] = [
  {
    id: "baseline",
    label: "Baseline · effect then ACK",
    title: "Work commits before confirmation",
    summary:
      "ACK-after · processing 50 ms · ACK delay 5 ms · lease 100 ms · one consumer · three attempts allowed.",
    takeaway:
      "One delivery, one committed effect and one accepted ACK. Between 50 and 55 ms, the ledger and broker know different facts.",
    steps: [
      {
        time: 0,
        from: "Broker",
        to: "Consumer c1",
        title: "Deliver attempt m1-a1",
        explanation:
          "The message is enqueued, then delivered with a fresh token and a deadline of 100 ms. Processing and ACK remain unobserved.",
      },
      {
        time: 50,
        from: "Consumer c1",
        to: "Ledger",
        title: "Commit the effect",
        explanation:
          "The ledger records the first effect and the consumer's processing slot clears. The broker is still leased and its ACK is pending.",
      },
      {
        time: 55,
        from: "Consumer c1",
        to: "Broker",
        title: "Send and accept the ACK",
        explanation:
          "The current token reaches the broker before its deadline. The broker acknowledges the message and invalidates the remaining lease timer.",
      },
    ],
  },
  {
    id: "lost-ack",
    label: "Lost ACK · repeated effect",
    title: "A missing confirmation permits repeated work",
    summary:
      "Same ACK-after baseline, with the ACK for attempt 1 deliberately lost in transport.",
    takeaway:
      "Two deliveries and two durable records: one extra effect. The first effect survived the lost confirmation.",
    steps: [
      {
        time: 0,
        from: "Broker",
        to: "Consumer c1",
        title: "Deliver attempt m1-a1",
        explanation:
          "The broker leases the message to its first attempt, with a 100 ms deadline.",
      },
      {
        time: 50,
        from: "Consumer c1",
        to: "Ledger",
        title: "Commit the first effect",
        explanation:
          "The first ledger append is durable. Broker confirmation is still pending.",
      },
      {
        time: 55,
        from: "Consumer c1",
        to: "Transport",
        title: "Send an ACK that is lost",
        explanation:
          "The configured transport loss drops the ACK before token validation. The broker still has no confirmation; the ledger record remains.",
      },
      {
        time: 100,
        from: "Broker",
        to: "Consumer c1",
        title: "Expire and redeliver as m1-a2",
        explanation:
          "Expiry makes the message ready again. The next delivery receives a different attempt and fresh token.",
      },
      {
        time: 150,
        from: "Consumer c1",
        to: "Ledger",
        title: "Commit a second effect",
        explanation:
          "Without duplicate protection, the same logical message appends another record. The new ACK is still pending.",
      },
      {
        time: 155,
        from: "Consumer c1",
        to: "Broker",
        title: "Accept the second ACK",
        explanation:
          "The second token reaches the broker within its lease. The broker settles one message, while both effects remain.",
      },
    ],
  },
  {
    id: "early-ack-crash",
    label: "Early ACK · cancelled work",
    title: "Confirmation can precede work that never commits",
    summary:
      "ACK-before · processing 50 ms · ACK delay 5 ms · crash at 25 ms · recovery at 75 ms.",
    takeaway:
      "One accepted ACK and zero effects after full settlement. Early confirmation removed broker retry eligibility before the work was durable.",
    steps: [
      {
        time: 0,
        from: "Broker",
        to: "Consumer c1",
        title: "Deliver attempt m1-a1",
        explanation:
          "Processing starts, with its effect scheduled for 50 ms and its early ACK scheduled for 5 ms.",
      },
      {
        time: 5,
        from: "Consumer c1",
        to: "Broker",
        title: "Accept the early ACK",
        explanation:
          "The message is acknowledged and the lease is closed. The ledger still has no effect; processing remains in progress.",
      },
      {
        time: 25,
        from: "Failure action",
        to: "Consumer c1",
        title: "Crash and cancel processing",
        explanation:
          "The consumer goes down. Its still-pending effect is cancelled; no ledger record is appended. The accepted ACK remains accepted.",
      },
      {
        time: 75,
        from: "Recovery action",
        to: "Consumer c1",
        title: "Recover without redelivery",
        explanation:
          "The consumer becomes ready. The broker already acknowledged this message, so recovery does not start a replacement attempt. The run fully settles without its effect.",
      },
    ],
  },
];
export function DeliverySequenceView() {
  const prefix = useId();
  const [pathId, setPathId] = useState(paths[0]!.id);
  const [position, setPosition] = useState(0);
  const path = paths.find((item) => item.id === pathId)!;
  const step = path.steps[position]!;
  return (
    <div className="delivery-concepts">
      <header className="delivery-concept-intro">
        <p className="eyebrow">Message sequence · Follow the same message</p>
        <h2>One message, three confirmation paths</h2>
        <p>
          Read a short authored walkthrough, then run its preset in the
          Playground or Guided view to inspect fresh Java evidence.
        </p>
        <p className="delivery-concept-scope">
          Authored illustrative paths · No new Java run · Default model v1.0.0 ·
          Not a saved or live simulation trace
        </p>
      </header>
      <fieldset className="delivery-path-choice">
        <legend>Choose an authored message path</legend>
        {paths.map((item) => (
          <label key={item.id}>
            <input
              type="radio"
              name={`${prefix}-path`}
              checked={item.id === pathId}
              onChange={() => {
                setPathId(item.id);
                setPosition(0);
              }}
            />
            {item.label}
          </label>
        ))}
      </fieldset>
      <section
        className="delivery-authored-path"
        aria-label="Selected authored message step"
      >
        <p className="eyebrow">
          Step {position + 1} of {path.steps.length} · {step.time} ms
        </p>
        <h3>{step.title}</h3>
        <p className="delivery-path-edge">
          {step.from} <span aria-hidden="true">→</span> {step.to}
        </p>
        <p>{step.explanation}</p>
        <div className="delivery-path-controls">
          <button
            className="button secondary"
            type="button"
            disabled={position === 0}
            onClick={() => setPosition(position - 1)}
          >
            Previous path step
          </button>
          <button
            className="button primary"
            type="button"
            disabled={position === path.steps.length - 1}
            onClick={() => setPosition(position + 1)}
          >
            Next path step
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={position === 0}
            onClick={() => setPosition(0)}
          >
            Reset authored path
          </button>
        </div>
      </section>
      <section
        className="delivery-concept-text"
        aria-label="Full authored message path"
      >
        <p className="eyebrow">Complete text equivalent</p>
        <h3>{path.title}</h3>
        <p>{path.summary}</p>
        <ol>
          {path.steps.map((item, index) => (
            <li
              key={`${item.time}-${item.title}`}
              aria-current={index === position ? "step" : undefined}
            >
              <strong>
                {item.time} ms · {item.title}
              </strong>
              <p>
                {item.from} → {item.to}. {item.explanation}
              </p>
            </li>
          ))}
        </ol>
        <p className="delivery-concept-takeaway">{path.takeaway}</p>
      </section>
    </div>
  );
}
