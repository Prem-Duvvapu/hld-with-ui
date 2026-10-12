import type { DeliveryInput, DeliveryResult } from "../../api/types";
import { DeliveryPlayback } from "./DeliveryPlayback";
import {
  deliveryLimitLabels,
  deliveryNumber,
  observedTime,
} from "./deliveryLabels";
function Metric({
  label,
  value,
  unit = "messages",
  unavailable = "Not observed",
}: {
  label: string;
  value: number | null | undefined;
  unit?: string;
  unavailable?: string;
}) {
  return (
    <div className="delivery-metric">
      <span>{label}</span>
      <strong>{deliveryNumber(value)}</strong>
      <small>{value == null ? unavailable : unit}</small>
    </div>
  );
}
const failureStatus = {
  REACHED: "Reached",
  UNOBSERVED: "Unobserved in this prefix",
};
const lossStatus = {
  REACHED: "ACK loss reached",
  ACK_CANCELLED: "ACK cancelled before sending",
  ATTEMPT_NOT_DELIVERED: "Attempt was not delivered in the settled run",
  UNOBSERVED: "Unobserved in this prefix",
};
export function DeliveryResults({
  result,
  input,
  stale,
}: {
  result: DeliveryResult;
  input: DeliveryInput;
  stale: boolean;
}) {
  const m = result.metrics;
  return (
    <div className="delivery-results">
      {stale && (
        <p className="delivery-notice" role="status">
          Inputs changed. These results belong to the previous submitted
          workload. Run again to compare your changes.
        </p>
      )}
      {result.status === "limited" && (
        <p className="delivery-notice" role="status">
          Partial result:{" "}
          {result.truncationReason
            ? deliveryLimitLabels[result.truncationReason]
            : "Simulation limit reached"}
          . Observation stops at {result.lastVirtualTimeMs} ms. Pending work is
          unresolved; an acknowledged message without an observed effect is not
          confirmed permanent loss.
        </p>
      )}
      <p className="delivery-submitted">
        Submitted:{" "}
        {input.acknowledgmentPolicy === "ACK_AFTER_EFFECT"
          ? "ACK after effect"
          : "ACK before effect"}{" "}
        · processing {input.processingTimeMs} ms · ACK delay{" "}
        {input.acknowledgmentDelayMs} ms · lease {input.visibilityTimeoutMs} ms
        · at most {input.maxDeliveryAttempts} attempts.
      </p>
      <DeliveryPlayback result={result} />
      <section
        className="delivery-results-section"
        aria-label="Delivery run metrics"
      >
        <p className="eyebrow">
          {result.status === "limited"
            ? "Observed prefix"
            : "Settled finite run"}
        </p>
        <h3>
          {result.status === "limited"
            ? "Partial run metrics"
            : "Final run metrics"}
        </h3>
        <p className="delivery-muted">
          These Java metrics cover the complete returned run through{" "}
          {result.lastVirtualTimeMs} ms, not the playback cursor. Settled
          execution can still contain missing or repeated business effects.
        </p>
        <div className="delivery-metrics">
          <Metric
            label="Delivery attempts"
            value={m.deliveryAttempts}
            unit="attempts"
          />
          <Metric
            label="Redeliveries"
            value={m.redeliveries}
            unit="attempts after the first"
          />
          <Metric
            label="Committed effects"
            value={m.committedEffects}
            unit="ledger records"
          />
          <Metric label="Messages with effect" value={m.messagesWithEffect} />
          <Metric
            label="Extra effects"
            value={m.extraEffects}
            unit="records beyond the first per message"
          />
          <Metric
            label="Acknowledged messages"
            value={m.acknowledgedMessages}
          />
          <Metric
            label="Acknowledged without effect"
            value={m.acknowledgedWithoutEffect}
            unavailable="Requires full settlement"
          />
          <Metric
            label="Dead-lettered messages"
            value={m.deadLetteredMessages}
          />
        </div>
        <p className="delivery-muted">
          Dead letter is a broker disposition. It does not erase committed
          records or fence a still-running consumer.
        </p>
        <h4>Separate latency populations</h4>
        <p className="delivery-muted">
          ACK latency measures enqueue → accepted ACK ({m.ackLatencySamples}{" "}
          message samples). First-effect latency measures enqueue → first
          committed effect ({m.effectLatencySamples} message samples). Rejected
          or unfinished facts are not zero-latency samples. p95 uses nearest
          rank; a tiny finite run is not a production tail estimate.
        </p>
        <div className="delivery-metrics">
          <Metric
            label="Mean ACK latency"
            value={m.meanAckLatencyMs}
            unit="ms"
          />
          <Metric label="p95 ACK latency" value={m.p95AckLatencyMs} unit="ms" />
          <Metric
            label="Mean first-effect latency"
            value={m.meanFirstEffectLatencyMs}
            unit="ms"
          />
          <Metric
            label="p95 first-effect latency"
            value={m.p95FirstEffectLatencyMs}
            unit="ms"
          />
        </div>
        <h4>Outstanding at the observation boundary</h4>
        <dl className="delivery-outstanding">
          {[
            ["Not enqueued", m.notEnqueued],
            ["Ready", m.ready],
            ["Leased", m.leased],
            ["Running effects", m.runningEffects],
            ["Pending ACKs", m.pendingAcknowledgments],
            ["Pending failure actions", m.pendingFailureActions],
            ["Pending enqueues", m.pendingEnqueues],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="delivery-muted">
          Pending ACKs include planned ACK-after-effect work, even while
          processing is still pending.
        </p>
      </section>
      <section className="delivery-results-section">
        <h3>Message outcomes at the observation boundary</h3>
        <div
          className="delivery-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Scrollable delivery message outcomes"
        >
          <table aria-label="Delivery message outcomes">
            <thead>
              <tr>
                {[
                  "Message",
                  "Broker status",
                  "Deliveries",
                  "Effects",
                  "ACK accepted at",
                  "First effect at",
                  "ACK latency (ms)",
                  "First-effect latency (ms)",
                ].map((label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.messageOutcomes.map((message) => (
                <tr key={message.messageId}>
                  <th scope="row">{message.messageId}</th>
                  <td>{message.status}</td>
                  <td>{message.deliveries}</td>
                  <td>{message.committedEffects}</td>
                  <td>{observedTime(message.acknowledgedAtMs)}</td>
                  <td>{observedTime(message.firstEffectAtMs)}</td>
                  <td>{deliveryNumber(message.ackLatencyMs)}</td>
                  <td>{deliveryNumber(message.firstEffectLatencyMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <details className="delivery-results-section">
        <summary>Configured faults and whether they were reached</summary>
        <h4>Consumer failure actions</h4>
        {result.failureOutcomes.length ? (
          <ol>
            {result.failureOutcomes.map((failure) => (
              <li key={failure.index}>
                Action {failure.index + 1}: {failure.consumerId} ·{" "}
                {failure.action} at {failure.timeMs} ms —{" "}
                {failureStatus[failure.status]}
              </li>
            ))}
          </ol>
        ) : (
          <p>No failure actions were configured.</p>
        )}
        <h4>Lost ACK selectors</h4>
        {result.lostAcknowledgmentOutcomes.length ? (
          <ul>
            {result.lostAcknowledgmentOutcomes.map((loss) => (
              <li key={`${loss.messageId}/${loss.attempt}`}>
                {loss.messageId} · attempt {loss.attempt} —{" "}
                {lossStatus[loss.status]}
              </li>
            ))}
          </ul>
        ) : (
          <p>No ACK losses were configured.</p>
        )}
      </details>
      <details className="delivery-results-section">
        <summary>Assumptions and limits of this model</summary>
        <ul>
          {result.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
