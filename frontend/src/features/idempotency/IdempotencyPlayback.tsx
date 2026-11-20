import { useEffect, useId, useState } from "react";
import type { IdempotencyResult } from "../../api/types";
import { usePanelActive } from "../../components/ModuleShell";
import { IdempotencyStateView } from "./IdempotencyStateView";
import { outcomeLabels } from "./idempotencyLabels";
export function IdempotencyPlayback({ result }: { result: IdempotencyResult }) {
  const scope = useId();
  const active = usePanelActive();
  const [playback, setPlayback] = useState({
    position: 0,
    playing: false,
    active,
    session: 0,
  });
  const { position, playing, session } = playback;
  const [intervalMs, setIntervalMs] = useState(700),
    [filter, setFilter] = useState("");
  if (active !== playback.active) {
    setPlayback((current) => ({
      ...current,
      active,
      playing: false,
      session: current.session + 1,
    }));
  }
  const last = result.outcomes.length;
  useEffect(() => {
    if (!playing || !active) return;
    const timer = window.setTimeout(() => {
      // A queued task can outlive timer cleanup. Check ownership when the update applies.
      setPlayback((current) => {
        if (!current.active || !current.playing || current.session !== session)
          return current;
        const next = Math.min(current.position + 1, last);
        return { ...current, position: next, playing: next < last };
      });
    }, intervalMs);
    return () => window.clearTimeout(timer);
  }, [playing, active, position, session, last, intervalMs]);
  const outcome = position ? result.outcomes[position - 1] : undefined;
  const caption = outcome
    ? `Step ${outcome.sequence} of ${last} · ${outcome.timeMs} ms · ${outcome.stepId}`
    : `Initial state · ${last} authored steps`;
  function seek(next: number) {
    setPlayback((current) => ({
      ...current,
      playing: false,
      position: Math.max(0, Math.min(last, next)),
      session: current.session + 1,
    }));
  }
  function pause() {
    setPlayback((current) => ({
      ...current,
      playing: false,
      session: current.session + 1,
    }));
  }
  return (
    <section
      className="idem-playback"
      aria-label="Idempotency snapshot playback"
    >
      <div className="idem-results-heading">
        <div>
          <p className="eyebrow">2 · Inspect the Java evidence</p>
          <h3>Follow work, receipt and response separately</h3>
        </div>
        <span className="idem-version">
          Model {result.modelVersion} · Virtual time
        </span>
      </div>
      <div className="idem-playback-controls">
        <button
          type="button"
          aria-label={
            playing ? "Pause idempotency trace" : "Play idempotency trace"
          }
          onClick={() => {
            setPlayback((current) => ({
              ...current,
              position:
                !current.playing && current.position >= last
                  ? 0
                  : current.position,
              playing: current.active && !current.playing,
              session: current.session + 1,
            }));
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          aria-label="Previous idempotency step"
          disabled={!position}
          onClick={() => seek(position - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          aria-label="Next idempotency step"
          disabled={position >= last}
          onClick={() => seek(position + 1)}
        >
          Next
        </button>
        <button type="button" onClick={() => seek(0)}>
          Reset idempotency snapshot
        </button>
        <label>
          Playback speed
          <select
            aria-label="Idempotency playback speed"
            value={intervalMs}
            onChange={(event) => {
              pause();
              setIntervalMs(Number(event.target.value));
            }}
          >
            <option value={1400}>0.5×</option>
            <option value={700}>1×</option>
            <option value={350}>2×</option>
          </select>
        </label>
      </div>
      <label className="idem-position-label" htmlFor={`${scope}-position`}>
        Idempotency snapshot position
      </label>
      <input
        className="idem-slider"
        id={`${scope}-position`}
        type="range"
        min={0}
        max={last}
        value={position}
        aria-valuetext={caption}
        onChange={(event) => seek(Number(event.target.value))}
      />
      <p className="idem-position" aria-live={playing ? "off" : "polite"}>
        {caption}
      </p>
      <article
        className="idem-event"
        aria-label={
          outcome
            ? `Idempotency evidence for ${outcome.stepId}`
            : "Initial idempotency evidence"
        }
      >
        <p className="eyebrow">{outcome?.kind ?? "Before the first step"}</p>
        <h4>
          {outcome
            ? outcomeLabels[outcome.kind]
            : "No call has looked up a key or published work."}
        </h4>
        <p>
          {outcome?.explanation ??
            "Start from the configured calls, then inspect each returned transition. No result or effect has been created."}
        </p>
        {outcome && (
          <p className="idem-muted">
            Call {outcome.callId} · action {outcome.action} · step{" "}
            {outcome.stepId}
          </p>
        )}
      </article>
      <p className="idem-muted">
        Equal-time steps remain separate. Playback selects returned snapshots;
        it does not advance a server clock or invent expiry events between
        steps.
      </p>
      <IdempotencyStateView
        state={outcome?.postState ?? result.initialState}
        input={result.input}
        selectedCallId={outcome?.callId}
      />
      <details className="idem-trace">
        <summary>Inspect the full idempotency trace ({last} steps)</summary>
        <label className="idem-field">
          <span>Focus trace on a call</span>
          <select
            aria-label="Idempotency call filter"
            value={filter}
            onChange={(event) => {
              pause();
              setFilter(event.target.value);
            }}
          >
            <option value="">All calls</option>
            {result.input.calls.map((call) => (
              <option key={call.id} value={call.id}>
                {call.id}
              </option>
            ))}
          </select>
        </label>
        <p className="idem-muted">
          The filter changes visible rows only. Selected snapshots still show
          every call and every published record.
        </p>
        <ol className="idem-trace-list">
          {result.outcomes
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => !filter || item.callId === filter)
            .map(({ item, index }) => (
              <li key={item.stepId}>
                <button
                  type="button"
                  aria-label={`View idempotency step ${item.sequence}`}
                  aria-pressed={position === index + 1}
                  onClick={() => seek(index + 1)}
                >
                  {item.sequence} · {item.timeMs} ms · {item.callId} ·{" "}
                  {outcomeLabels[item.kind]}
                </button>
                <p>{item.explanation}</p>
              </li>
            ))}
        </ol>
      </details>
    </section>
  );
}
