import type { DeliverySnapshot } from "./deliveryProjection";
import { observedTime } from "./deliveryLabels";
const brokerLabels = {
  NOT_ENQUEUED: "Not enqueued",
  READY: "Ready",
  LEASED: "Leased",
  ACKNOWLEDGED: "Acknowledged",
  DEAD_LETTERED: "Dead lettered",
};
export function DeliveryStateView({
  snapshot,
}: {
  snapshot: DeliverySnapshot;
}) {
  const { state, ledger } = snapshot;
  return (
    <>
      <div
        className="delivery-topology"
        role="group"
        aria-label="Broker, consumer and ledger at the selected position"
      >
        <section
          className="delivery-system-node"
          aria-label="Broker messages at the selected position"
        >
          <p className="eyebrow">01 · Broker</p>
          <h4>What can be delivered?</h4>
          <ul className="delivery-state-cards">
            {state.messages.map((message) => (
              <li key={message.id} aria-label={`Message ${message.id}`}>
                <strong>{message.id}</strong>
                <span className="delivery-status">
                  {brokerLabels[message.status]}
                </span>
                <small>{message.deliveryCount} delivery attempts</small>
                <small>
                  Current attempt: {message.currentAttemptId ?? "None"}
                </small>
              </li>
            ))}
          </ul>
        </section>
        <div className="delivery-arrow" aria-hidden="true">
          <small className="delivery-ack-arrow">
            ACK
            <br />←
          </small>
          <span>
            Deliver an attempt
            <br />↑ ACK to broker
          </span>
        </div>
        <section
          className="delivery-system-node"
          aria-label="Consumers at the selected position"
        >
          <p className="eyebrow">02 · Consumers</p>
          <h4>Who is processing?</h4>
          <ul className="delivery-state-cards">
            {state.consumers.map((consumer) => (
              <li key={consumer.id} aria-label={`Consumer ${consumer.id}`}>
                <strong>{consumer.id}</strong>
                <span className="delivery-status">
                  {consumer.status === "DOWN" ? "Down" : "Up"}
                </span>
                <small>
                  Current processing attempt:{" "}
                  {consumer.currentAttemptId ?? "None"}
                </small>
                {!consumer.currentAttemptId && (
                  <small>No processing slot in use</small>
                )}
              </li>
            ))}
          </ul>
        </section>
        <div className="delivery-arrow" aria-hidden="true">
          <span>Commit an effect</span>
        </div>
        <section
          className="delivery-system-node"
          aria-label="Committed ledger at the selected position"
        >
          <p className="eyebrow">03 · Ledger</p>
          <h4>What work actually committed?</h4>
          <p className="delivery-muted">
            {ledger.length} visible record{ledger.length === 1 ? "" : "s"}
          </p>
          {ledger.length ? (
            <ol className="delivery-ledger">
              {ledger.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.id}</strong>
                  <span>
                    {entry.messageId} · {entry.attemptId} · {entry.consumerId}
                  </span>
                  <small>Committed at {entry.committedAtMs} ms</small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="delivery-empty-line">No committed records yet</p>
          )}
        </section>
      </div>
      <details className="delivery-records">
        <summary>Inspect broker, consumer and attempt records</summary>
        <p className="delivery-muted">
          These are complete Java records at the selected event. A lease
          controls ACK acceptance; it does not fence a still-running ledger
          effect. Scheduled times are plans, not observed completions.
        </p>
        <div
          className="delivery-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Scrollable broker records"
        >
          <table aria-label="Broker records at the selected position">
            <thead>
              <tr>
                <th scope="col">Message</th>
                <th scope="col">Broker status</th>
                <th scope="col">Scheduled enqueue (ms)</th>
                <th scope="col">Available since</th>
                <th scope="col">Deliveries</th>
                <th scope="col">Current attempt</th>
                <th scope="col">Acknowledged at</th>
              </tr>
            </thead>
            <tbody>
              {state.messages.map((message) => (
                <tr key={message.id}>
                  <th scope="row">{message.id}</th>
                  <td>{message.status}</td>
                  <td>{message.enqueueTimeMs}</td>
                  <td>{observedTime(message.availableSinceMs)}</td>
                  <td>{message.deliveryCount}</td>
                  <td>{message.currentAttemptId ?? "None"}</td>
                  <td>{observedTime(message.acknowledgedAtMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          className="delivery-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Scrollable consumer records"
        >
          <table aria-label="Consumer records at the selected position">
            <thead>
              <tr>
                <th scope="col">Consumer</th>
                <th scope="col">Status</th>
                <th scope="col">Processing attempt</th>
              </tr>
            </thead>
            <tbody>
              {state.consumers.map((consumer) => (
                <tr key={consumer.id}>
                  <th scope="row">{consumer.id}</th>
                  <td>{consumer.status}</td>
                  <td>{consumer.currentAttemptId ?? "None"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          className="delivery-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Scrollable attempt records"
        >
          <table aria-label="Attempt records at the selected position">
            <thead>
              <tr>
                {[
                  "Attempt",
                  "Message",
                  "Consumer",
                  "Lease token",
                  "Lease deadline (ms)",
                  "Started (ms)",
                  "Scheduled effect (ms)",
                  "Scheduled ACK (ms)",
                  "Lease status",
                  "Effect status",
                  "ACK status",
                  "Effect committed",
                  "ACK sent",
                  "ACK resolved",
                  "Cancelled",
                ].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <th scope="row">{attempt.id}</th>
                  <td>{attempt.messageId}</td>
                  <td>{attempt.consumerId}</td>
                  <td>{attempt.leaseToken}</td>
                  <td>{attempt.leaseDeadlineMs}</td>
                  <td>{attempt.startedAtMs}</td>
                  <td>{attempt.scheduledEffectAtMs}</td>
                  <td>{attempt.scheduledAckAtMs}</td>
                  <td>{attempt.leaseStatus}</td>
                  <td>{attempt.effectStatus}</td>
                  <td>{attempt.ackStatus}</td>
                  <td>{observedTime(attempt.effectCommittedAtMs)}</td>
                  <td>{observedTime(attempt.ackSentAtMs)}</td>
                  <td>{observedTime(attempt.ackResolvedAtMs)}</td>
                  <td>{observedTime(attempt.cancelledAtMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!state.attempts.length && (
            <p className="delivery-empty-line">
              No attempts have started at this position.
            </p>
          )}
        </div>
      </details>
    </>
  );
}
