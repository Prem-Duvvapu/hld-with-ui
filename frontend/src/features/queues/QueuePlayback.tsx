import { useEffect, useId, useState } from "react";
import type { QueueCapacityInput, QueueCapacityResult } from "../../api/types";
import { queueEventLabels } from "../../api/queueCompatibility";
import "./Queues.css";
import { usePanelActive } from "../../components/ModuleShell";

export function QueuePlayback({
  result,
  input,
  initialPosition = -1,
  showTrace = true,
  title = "Follow one job through the queue",
}: {
  result: QueueCapacityResult;
  input: QueueCapacityInput;
  initialPosition?: number;
  showTrace?: boolean;
  title?: string;
}) {
  const titleId = useId();
  const [position, setPosition] = useState(() =>
    Math.max(-1, Math.min(initialPosition, result.events.length - 1)),
  );
  const [playing, setPlaying] = useState(false);
  const [intervalMs, setIntervalMs] = useState(600);
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
  const event = position < 0 ? undefined : result.events[position];
  const state = event?.state ?? result.initialState;
  const caption = event
    ? `Event ${position + 1} of ${result.events.length} · ${event.timeMs} ms`
    : `Initial state · ${result.events.length} events`;
  function seek(next: number) {
    setPlaying(false);
    setPosition(Math.max(-1, Math.min(last, next)));
  }
  return (
    <section className="queue-playback" aria-labelledby={titleId}>
      <div className="queue-section-heading">
        <div>
          <p className="eyebrow">Observe cause and effect</p>
          <h3 id={titleId}>{title}</h3>
        </div>
        <span className="queue-model-tag">
          Model v{result.modelVersion} · Virtual time · FIFO
        </span>
      </div>
      <div className="queue-topology">
        <section className="queue-waiting" aria-label="Shared waiting queue">
          <p className="eyebrow">Shared waiting queue</p>
          <h4>First in, first out</h4>
          <p className="queue-muted">
            {state.queuedJobIds.length} waiting · {input.queueCapacity} waiting
            slots. Running jobs use worker slots.
          </p>
          {state.queuedJobIds.length ? (
            <ol className="queue-job-chips">
              {state.queuedJobIds.map((id, index) => (
                <li key={id}>
                  <span>{index + 1}</span>
                  <strong>{id}</strong>
                  {index === 0 && <small>Next in line</small>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="queue-empty-line">No waiting jobs</p>
          )}
        </section>
        <div className="queue-direction" aria-hidden="true">
          ↓ <span>Workers take the oldest waiting job</span>
        </div>
        <section
          aria-label="Workers at the selected position"
          className="queue-workers"
        >
          {state.workers.map((worker) => (
            <section
              key={worker.id}
              aria-label={`Worker ${worker.id}`}
              className={`queue-worker ${worker.jobId ? "busy" : "idle"} ${event?.workerId === worker.id ? "selected" : ""}`}
            >
              <p className="eyebrow">{worker.id}</p>
              <h4>{worker.jobId ?? "Idle"}</h4>
              {worker.jobId ? (
                <>
                  <p>Started at {worker.startedAtMs} ms</p>
                  <p className="queue-muted">
                    Scheduled completion: {worker.scheduledCompletionAtMs} ms
                  </p>
                  <small>A schedule is not an observed completion.</small>
                </>
              ) : (
                <p className="queue-muted">Ready to take a job</p>
              )}
            </section>
          ))}
        </section>
      </div>
      <div className="queue-playback-controls">
        <button
          type="button"
          className="button secondary"
          aria-label={playing ? "Pause trace" : "Play trace"}
          disabled={!result.events.length}
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
          aria-label="Previous event"
          disabled={position <= -1}
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
          aria-label="Next event"
          disabled={position >= last}
          onClick={() => seek(position + 1)}
        >
          →
        </button>
        <button
          type="button"
          className="button secondary"
          aria-label="Reset to initial state"
          disabled={position < 0}
          onClick={() => seek(-1)}
        >
          Reset
        </button>
        <label className="queue-speed">
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
      <p className="queue-position" aria-live={playing ? "off" : "polite"}>
        {caption}
      </p>
      <section
        aria-label="Selected queue event"
        className={`queue-inspector ${event?.kind === "job.rejected" ? "rejected" : ""}`}
      >
        <p className="eyebrow">{event?.kind ?? "Before the first event"}</p>
        <h4>
          {event
            ? queueEventLabels[event.kind]
            : "All workers are idle; the queue is empty."}
        </h4>
        <p>
          {event?.message ??
            "Step forward to observe the first admitted transition. Playback changes only the selected position."}
        </p>
        {event && (
          <p className="queue-muted">
            Job {event.jobId}
            {event.workerId ? ` · ${event.workerId}` : ""}. Queue and workers
            show the state immediately after this event.
          </p>
        )}
      </section>
      {showTrace && (
        <details className="queue-trace">
          <summary>
            Inspect the full event trace ({result.events.length} events)
          </summary>
          <div
            className="queue-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Scrollable queue event trace"
          >
            <table aria-label="Queue simulation event trace">
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Time (ms)</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Job</th>
                  <th scope="col">Explanation</th>
                </tr>
              </thead>
              <tbody>
                {result.events.map((item, index) => (
                  <tr
                    key={item.sequence}
                    className={index === position ? "selected" : ""}
                  >
                    <td>
                      <button
                        type="button"
                        className="queue-event-button"
                        aria-label={`View event ${item.sequence}`}
                        aria-pressed={index === position}
                        onClick={() => seek(index)}
                      >
                        {item.sequence}
                      </button>
                    </td>
                    <td>{item.timeMs}</td>
                    <td>{item.kind}</td>
                    <td>{item.jobId}</td>
                    <td>{item.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
