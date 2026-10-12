import { useEffect, useId, useMemo, useState } from "react";
import type { DeliveryResult } from "../../api/types";
import { usePanelActive } from "../../components/ModuleShell";
import { deliveryAt } from "./deliveryProjection";
import { deliveryEventLabels } from "./deliveryLabels";
import { DeliveryStateView } from "./DeliveryStateView";
import "./Delivery.css";
export function DeliveryPlayback({ result }: { result: DeliveryResult }) {
  const titleId = useId();
  const [position, setPosition] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [intervalMs, setIntervalMs] = useState(600);
  const [messageFilter, setMessageFilter] = useState("");
  const active = usePanelActive();
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) setPlaying(false);
  }
  const last = result.events.length - 1;
  useEffect(() => {
    if (!playing || !active) return;
    const timer = window.setTimeout(() => {
      setPosition((previous) => Math.min(previous + 1, last));
      if (position + 1 >= last) setPlaying(false);
    }, intervalMs);
    return () => window.clearTimeout(timer);
  }, [playing, active, position, last, intervalMs]);
  const snapshot = useMemo(
    () => deliveryAt(result.initialState, result.events, position),
    [result.initialState, result.events, position],
  );
  const event = position < 0 ? undefined : result.events[position];
  const caption = event
    ? `Event ${position + 1} of ${result.events.length} · ${event.timeMs} ms`
    : `Initial state · ${result.events.length} events`;
  const shown = result.events
    .map((event, index) => ({ event, index }))
    .filter((item) => !messageFilter || item.event.messageId === messageFilter);
  function seek(next: number) {
    setPlaying(false);
    setPosition(Math.max(-1, Math.min(last, next)));
  }
  return (
    <section className="delivery-playback" aria-labelledby={titleId}>
      <div className="delivery-section-heading">
        <div>
          <p className="eyebrow">Observe three separate facts</p>
          <h3 id={titleId}>Broker knowledge, processing and committed work</h3>
        </div>
        <span className="delivery-model-tag">
          Model v{result.modelVersion} · Virtual time
        </span>
      </div>
      <DeliveryStateView snapshot={snapshot} />
      <div className="delivery-playback-controls">
        <button
          type="button"
          className="button secondary"
          disabled={!result.events.length}
          aria-label={playing ? "Pause trace" : "Play trace"}
          onClick={() => {
            if (playing) setPlaying(false);
            else {
              if (position >= last) setPosition(-1);
              setPlaying(true);
            }
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={position < 0}
          aria-label="Previous event"
          onClick={() => seek(position - 1)}
        >
          ←
        </button>
        <input
          type="range"
          aria-label="Trace position"
          aria-valuetext={caption}
          min={-1}
          max={Math.max(-1, last)}
          value={position}
          disabled={!result.events.length}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <button
          type="button"
          className="button secondary"
          disabled={position >= last}
          aria-label="Next event"
          onClick={() => seek(position + 1)}
        >
          →
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={position < 0}
          aria-label="Reset to initial state"
          onClick={() => seek(-1)}
        >
          Reset
        </button>
        <label className="delivery-speed">
          Speed
          <select
            aria-label="Playback speed"
            value={intervalMs}
            onChange={(e) => {
              setPlaying(false);
              setIntervalMs(Number(e.target.value));
            }}
          >
            <option value={1200}>0.5×</option>
            <option value={600}>1×</option>
            <option value={300}>2×</option>
          </select>
        </label>
      </div>
      <p className="delivery-position" aria-live={playing ? "off" : "polite"}>
        {caption}
      </p>
      <section
        className="delivery-inspector"
        aria-label="Selected delivery event"
      >
        <p className="eyebrow">{event?.kind ?? "Before the first event"}</p>
        <h4>
          {event
            ? deliveryEventLabels[event.kind]
            : "No message has been enqueued yet."}
        </h4>
        <p>
          {event?.message ??
            "Run playback forward to observe the returned transitions. A scheduled effect or ACK is not evidence that it happened."}
        </p>
        {event && (
          <p className="delivery-muted">
            {[event.messageId, event.attemptId, event.consumerId]
              .filter(Boolean)
              .join(" · ") || "Consumer state transition"}
            . All records show the state immediately after this event.
          </p>
        )}
      </section>
      <details className="delivery-trace">
        <summary>
          Inspect the full event trace ({result.events.length} events)
        </summary>
        <label className="delivery-field delivery-filter">
          <span>Focus trace rows on a message</span>
          <select
            aria-label="Message filter"
            value={messageFilter}
            onChange={(e) => {
              setPlaying(false);
              setMessageFilter(e.target.value);
            }}
          >
            <option value="">All messages and consumer events</option>
            {result.initialState.messages.map((message) => (
              <option key={message.id} value={message.id}>
                {message.id}
              </option>
            ))}
          </select>
        </label>
        <p className="delivery-muted">
          Filtering changes the visible rows only. Broker, consumers and ledger
          always include every preceding event.
        </p>
        <div
          className="delivery-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Scrollable delivery event trace"
        >
          <table aria-label="Delivery simulation event trace">
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Time (ms)</th>
                <th scope="col">Kind</th>
                <th scope="col">Message / attempt</th>
                <th scope="col">Explanation</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ event: item, index }) => (
                <tr
                  key={item.sequence}
                  className={position === index ? "selected" : ""}
                >
                  <td>
                    <button
                      type="button"
                      className="delivery-event-button"
                      aria-label={`View event ${item.sequence}`}
                      aria-pressed={position === index}
                      onClick={() => seek(index)}
                    >
                      {item.sequence}
                    </button>
                  </td>
                  <td>{item.timeMs}</td>
                  <td>{item.kind}</td>
                  <td>
                    {item.messageId ?? "—"}
                    <br />
                    {item.attemptId ?? "—"}
                  </td>
                  <td>{item.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && (
            <p className="delivery-empty-line">
              No emitted events match this filter.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
