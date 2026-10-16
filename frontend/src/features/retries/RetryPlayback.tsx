import { useEffect, useId, useState } from "react";
import type { RetryResult } from "../../api/types";
import { usePanelActive } from "../../components/ModuleShell";
import { RetryStateView } from "./RetryStateView";
import { retryEventLabels } from "./retryLabels";
export function RetryPlayback({ result }: { result: RetryResult }) {
  const scope = useId();
  const [position, setPosition] = useState(0),
    [playing, setPlaying] = useState(false),
    [intervalMs, setIntervalMs] = useState(600),
    [filter, setFilter] = useState("");
  const active = usePanelActive(),
    [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) setPlaying(false);
  }
  const last = result.events.length;
  useEffect(() => {
    if (!playing || !active) return;
    const timer = window.setTimeout(() => {
      setPosition((p) => Math.min(p + 1, last));
      if (position + 1 >= last) setPlaying(false);
    }, intervalMs);
    return () => window.clearTimeout(timer);
  }, [playing, active, position, last, intervalMs]);
  const event = position ? result.events[position - 1] : undefined;
  const state = event?.postState ?? result.initialState;
  const caption = event
    ? `Event ${event.sequence} of ${last} · ${event.timeMs} ms`
    : `Initial state · ${last} returned events`;
  function seek(next: number) {
    setPlaying(false);
    setPosition(Math.max(0, Math.min(last, next)));
  }
  return (
    <section className="retry-playback" aria-label="Retry snapshot playback">
      <div className="retry-results-heading">
        <div>
          <p className="eyebrow">Inspect the actual Java trace</p>
          <h3>Caller patience and server work are separate</h3>
        </div>
        <span className="retry-version">
          Java model {result.modelVersion} · Virtual time
        </span>
      </div>
      <div className="retry-playback-controls">
        <button
          type="button"
          aria-label={playing ? "Pause retry trace" : "Play retry trace"}
          onClick={() => {
            if (playing) setPlaying(false);
            else {
              if (position >= last) setPosition(0);
              setPlaying(true);
            }
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          aria-label="Previous retry event"
          disabled={!position}
          onClick={() => seek(position - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          aria-label="Next retry event"
          disabled={position >= last}
          onClick={() => seek(position + 1)}
        >
          Next
        </button>
        <button type="button" onClick={() => seek(0)}>
          Reset retry snapshot
        </button>
        <label>
          Playback speed
          <select
            aria-label="Retry playback speed"
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
      <label className="retry-position-label" htmlFor={`${scope}-position`}>
        Retry snapshot position
      </label>
      <input
        id={`${scope}-position`}
        className="retry-slider"
        type="range"
        min={0}
        max={last}
        value={position}
        aria-valuetext={caption}
        onChange={(e) => seek(Number(e.target.value))}
      />
      <p className="retry-position" aria-live={playing ? "off" : "polite"}>
        {caption}
      </p>
      <section className="retry-event" aria-label="Selected retry event">
        <p className="eyebrow">{event?.kind ?? "Before the first event"}</p>
        <h4>
          {event
            ? retryEventLabels[event.kind]
            : "No caller has arrived and no attempt has been sent."}
        </h4>
        <p>
          {event?.explanation ??
            "Start from the configured workload, then inspect each returned transition. A planned retry is not a sent attempt."}
        </p>
        {event && (
          <p className="retry-muted">
            Request {event.requestId}
            {event.attemptId
              ? ` · actual attempt ${event.attemptId}`
              : " · request-level event"}
          </p>
        )}
        {event?.delayMs !== undefined && (
          <dl>
            <div>
              <dt>Chosen delay</dt>
              <dd>{event.delayMs} ms</dd>
            </div>
            <div>
              <dt>
                {event.retryAtMs !== undefined
                  ? "Scheduled dispatch"
                  : "Blocked proposal time"}
              </dt>
              <dd>{event.retryAtMs ?? event.proposedRetryAtMs} ms</dd>
            </div>
          </dl>
        )}
      </section>
      <p className="retry-muted">
        Several causal steps can share one virtual timestamp. Completion may
        precede its explicit caller success and FIFO promotion in the next
        event; no elapsed gap or other callback is implied.
      </p>
      <RetryStateView
        state={state}
        selectedRequestId={event?.requestId}
        selectedAttemptId={event?.attemptId}
      />
      <details className="retry-trace">
        <summary>Inspect the full retry trace ({last} events)</summary>
        <label className="retry-field">
          <span>Focus trace on a request</span>
          <select
            aria-label="Retry request filter"
            value={filter}
            onChange={(e) => {
              setPlaying(false);
              setFilter(e.target.value);
            }}
          >
            <option value="">All requests</option>
            {result.initialState.requests.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id}
              </option>
            ))}
          </select>
        </label>
        <p className="retry-muted">
          Filtering changes visible event rows only; snapshots retain the
          complete returned state.
        </p>
        <ol className="retry-trace-list">
          {result.events
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => !filter || item.requestId === filter)
            .map(({ item, index }) => (
              <li key={item.sequence}>
                <button
                  type="button"
                  aria-label={`View retry event ${item.sequence}`}
                  aria-pressed={position === index + 1}
                  onClick={() => seek(index + 1)}
                >
                  {item.sequence} · {item.timeMs} ms ·{" "}
                  {retryEventLabels[item.kind]} · {item.requestId}
                </button>
                <p>{item.explanation}</p>
              </li>
            ))}
        </ol>
      </details>
    </section>
  );
}
