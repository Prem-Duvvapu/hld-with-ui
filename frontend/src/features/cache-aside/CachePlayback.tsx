import { useEffect, useId, useMemo, useState } from "react";
// Diagram and table rules are shared with the playground stylesheet.
import "./CacheAsidePlayground.css";
import type {
  CacheAsideEvent,
  CacheAsideInput,
  CacheAsideResult,
} from "../../api/types";
import { usePanelActive } from "../../components/ModuleShell";
import {
  INITIAL_POSITION,
  cacheStateAt,
  entryStatus,
  isBehindOrigin,
  orderedEvents,
  type CacheSnapshot,
  type KeyState,
} from "./cacheState";

const playbackSpeeds = [
  { label: "0.5×", intervalMs: 1_200 },
  { label: "1×", intervalMs: 600 },
  { label: "2×", intervalMs: 300 },
] as const;

type Step = { link: "cache" | "origin"; label: string; failure?: boolean };

// Exhaustive over the generated event kinds: a new kind needs a deliberate
// diagram decision. Labels describe the kind only; narration is never parsed.
const steps: Record<CacheAsideEvent["kind"], Step> = {
  "cache.miss": { link: "cache", label: "Lookup misses" },
  "cache.hit": { link: "cache", label: "Lookup hits" },
  "cache.fill": { link: "cache", label: "Application fills the cache" },
  "cache.bypass": {
    link: "cache",
    label: "Cache unavailable: read bypasses it",
    failure: true,
  },
  "cache.error": {
    link: "origin",
    label: "Origin unavailable: GET fails",
    failure: true,
  },
  "origin.read": { link: "origin", label: "Application reads the origin" },
  "origin.update": {
    link: "origin",
    label: "Write commits to the origin; the cache is not invalidated",
  },
  "origin.error": {
    link: "origin",
    label: "Origin unavailable: write does not commit",
    failure: true,
  },
};

export function operationLabel(input: CacheAsideInput, operation: number) {
  const op = input.operations[operation - 1];
  if (!op) return `Operation ${operation}`;
  return op.kind === "UPDATE"
    ? `UPDATE ${op.key} = ${op.value} @ ${op.timeMs} ms`
    : `GET ${op.key} @ ${op.timeMs} ms`;
}

/**
 * Plays a completed Java trace. Every control only moves the presentation
 * cursor; nothing here submits a run or derives outcomes.
 */
export function CachePlayback({
  result,
  input,
  initialPosition = INITIAL_POSITION,
  showTrace = true,
  title = "Step through the trace",
}: {
  result: CacheAsideResult;
  input: CacheAsideInput;
  /** Where the cursor starts, for example a guided checkpoint's event. */
  initialPosition?: number;
  showTrace?: boolean;
  title?: string;
}) {
  // Playground and guided panels can both be mounted, so ids must be unique.
  const titleId = useId();
  const events = useMemo(() => orderedEvents(result.events), [result.events]);
  const lastPosition = events.length - 1;
  const [position, setPosition] = useState(() =>
    Math.max(INITIAL_POSITION, Math.min(initialPosition, lastPosition)),
  );
  const [playing, setPlaying] = useState(false);
  const [intervalMs, setIntervalMs] = useState<number>(600);
  const [operationFilter, setOperationFilter] = useState<number | null>(null);

  // Hidden tabs stay mounted; pause there and let the learner resume.
  const panelActive = usePanelActive();
  const [wasPanelActive, setWasPanelActive] = useState(panelActive);
  if (panelActive !== wasPanelActive) {
    setWasPanelActive(panelActive);
    if (!panelActive) setPlaying(false);
  }

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      const next = Math.min(position + 1, lastPosition);
      setPosition(next);
      if (next >= lastPosition) setPlaying(false);
    }, intervalMs);
    return () => window.clearTimeout(timer);
  }, [playing, position, lastPosition, intervalMs]);

  const snapshot = useMemo(
    () => cacheStateAt({ initialState: result.initialState, events }, position),
    [result.initialState, events, position],
  );
  const event = position >= 0 ? events[position] : undefined;
  const operations = useMemo(
    () => [...new Set(events.map((e) => e.operation))].sort((a, b) => a - b),
    [events],
  );
  const shownEvents =
    operationFilter === null
      ? events
      : events.filter((e) => e.operation === operationFilter);

  function seek(next: number) {
    setPlaying(false);
    setPosition(Math.max(INITIAL_POSITION, Math.min(lastPosition, next)));
  }

  function togglePlay() {
    if (playing) return setPlaying(false);
    if (position >= lastPosition) setPosition(INITIAL_POSITION);
    setPlaying(true);
  }

  const atStart = position <= INITIAL_POSITION;
  const atEnd = position >= lastPosition;
  const positionText = event
    ? `Event ${position + 1} of ${events.length} · ${event.timeMs} ms`
    : `Initial state · ${events.length} event${events.length === 1 ? "" : "s"}`;
  const focusKey = event?.key ?? snapshot.keys[0]?.key;
  const focus = snapshot.keys.find((state) => state.key === focusKey);

  return (
    <section className="cache-playback" aria-labelledby={titleId}>
      <h3 id={titleId}>{title}</h3>
      <CacheDiagram
        snapshot={snapshot}
        event={event}
        focus={focus}
        input={input}
      />
      <div className="playback cache-playback-controls">
        <button
          className="play-button"
          type="button"
          onClick={togglePlay}
          disabled={events.length === 0}
          aria-label={playing ? "Pause trace" : "Play trace"}
        >
          {playing ? "Ⅱ" : "▶"}
        </button>
        <button
          className="step-button"
          type="button"
          onClick={() => seek(position - 1)}
          disabled={atStart}
          aria-label="Previous event"
        >
          ←
        </button>
        <input
          aria-label="Trace position"
          aria-valuetext={positionText}
          type="range"
          min={INITIAL_POSITION}
          max={Math.max(lastPosition, INITIAL_POSITION)}
          value={position}
          disabled={events.length === 0}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <button
          className="step-button"
          type="button"
          onClick={() => seek(position + 1)}
          disabled={atEnd}
          aria-label="Next event"
        >
          →
        </button>
        <button
          className="step-button"
          type="button"
          onClick={() => seek(INITIAL_POSITION)}
          disabled={atStart}
          aria-label="Reset to initial state"
        >
          ↺
        </button>
        <span className="cache-position">{positionText}</span>
        <label className="playback-speed">
          <span>Speed</span>
          <select
            aria-label="Playback speed"
            value={intervalMs}
            onChange={(e) => setIntervalMs(Number(e.target.value))}
          >
            {playbackSpeeds.map((speed) => (
              <option key={speed.intervalMs} value={speed.intervalMs}>
                {speed.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <EventInspector
        event={event}
        focus={focus}
        snapshot={snapshot}
        input={input}
        playing={playing}
        endOfLimitedTrace={atEnd && result.status === "limited"}
        empty={events.length === 0}
      />

      <StateTable snapshot={snapshot} label={positionText} />

      {showTrace && (
        <section className="result-section">
          <div className="cache-trace-heading">
            <h3>Event Trace</h3>
            <label className="cache-filter">
              <span>Show events for</span>
              <select
                value={operationFilter ?? ""}
                onChange={(e) =>
                  setOperationFilter(
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              >
                <option value="">All operations</option>
                {operations.map((operation) => (
                  <option key={operation} value={operation}>
                    {`Operation ${operation}: ${operationLabel(input, operation)}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {operationFilter !== null && (
            <p className="cache-filter-note">
              Showing only operation {operationFilter}. The diagram and state
              still include every earlier event from all operations.
            </p>
          )}
          <div
            className="table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Scrollable event trace"
          >
            <table className="data-table" aria-label="Simulation event trace">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Time (ms)</th>
                  <th>Op</th>
                  <th>Key</th>
                  <th>Kind</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {shownEvents.map((traceEvent) => {
                  const index = events.indexOf(traceEvent);
                  const selected = index === position;
                  return (
                    <tr
                      key={traceEvent.sequence}
                      className={selected ? "selected" : undefined}
                    >
                      <td>
                        <button
                          className="trace-event-link"
                          type="button"
                          aria-label={`View event ${traceEvent.sequence}`}
                          aria-current={selected ? "step" : undefined}
                          onClick={() => seek(index)}
                        >
                          {traceEvent.sequence}
                        </button>
                      </td>
                      <td>{traceEvent.timeMs}</td>
                      <td>{traceEvent.operation}</td>
                      <td>{traceEvent.key}</td>
                      <td>
                        <code>{traceEvent.kind}</code>
                      </td>
                      <td>{traceEvent.message}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}

function CacheDiagram({
  snapshot,
  event,
  focus,
  input,
}: {
  snapshot: CacheSnapshot;
  event?: CacheAsideEvent;
  focus?: KeyState;
  input: CacheAsideInput;
}) {
  const step = event ? steps[event.kind] : undefined;
  const linkClass = (link: Step["link"]) =>
    `cache-link ${step?.link === link ? (step.failure ? "active failure" : "active") : ""}`;
  const entry = focus?.cacheEntry;
  const status = entry ? entryStatus(entry, snapshot.atMs) : undefined;

  return (
    <figure className="cache-diagram">
      <div
        className={`cache-node cache-node-cache ${event?.nodeId === "cache" ? "active" : ""} ${snapshot.cacheAvailable ? "" : "down"}`}
      >
        <small>Cache</small>
        <strong>{snapshot.cacheAvailable ? "Available" : "Unavailable"}</strong>
        {focus &&
          (entry ? (
            <span className="cache-node-value">
              {focus.key} = {entry.value}{" "}
              <em>
                version {entry.version} · {status}
              </em>
            </span>
          ) : (
            <span className="cache-node-value muted">
              No entry for {focus.key}
            </span>
          ))}
      </div>
      <div className={linkClass("cache")} aria-hidden="true">
        <span>{step?.link === "cache" ? step.label : ""}</span>
      </div>
      <div className="cache-node cache-node-app">
        <small>Application</small>
        <strong>
          {event
            ? `Operation ${event.operation}`
            : "Before the first operation"}
        </strong>
        <span className="cache-node-value">
          {event ? operationLabel(input, event.operation) : "Cache is empty"}
        </span>
      </div>
      <div className={linkClass("origin")} aria-hidden="true">
        <span>{step?.link === "origin" ? step.label : ""}</span>
      </div>
      <div
        className={`cache-node cache-node-origin ${event?.nodeId === "origin" ? "active" : ""} ${snapshot.originAvailable ? "" : "down"}`}
      >
        <small>Origin (source of truth)</small>
        <strong>
          {snapshot.originAvailable ? "Available" : "Unavailable"}
        </strong>
        {focus &&
          (focus.originValue ? (
            <span className="cache-node-value">
              {focus.key} = {focus.originValue.value}{" "}
              <em>version {focus.originValue.version}</em>
            </span>
          ) : (
            <span className="cache-node-value muted">
              No value for {focus.key}
            </span>
          ))}
      </div>
      <figcaption className="sr-only">
        The application reads the cache first and reads the origin itself on a
        miss, then fills the cache. Writes go to the origin only.
        {step ? ` Current step: ${step.label}.` : ""}
      </figcaption>
    </figure>
  );
}

function describeKey(state: KeyState, atMs: number) {
  const entry = state.cacheEntry;
  const cache = entry
    ? `Cache holds ${state.key} = ${entry.value} (version ${entry.version}), filled at ${entry.filledAtMs} ms, ${
        entryStatus(entry, atMs) === "fresh"
          ? `fresh until ${entry.expiresAtMs} ms`
          : `expired at ${entry.expiresAtMs} ms; a lookup now misses`
      }.`
    : `Cache has no entry for ${state.key}.`;
  const origin = state.originValue
    ? `Origin holds ${state.originValue.value} (version ${state.originValue.version}).`
    : `Origin has no value for ${state.key}.`;
  const behind = isBehindOrigin(state)
    ? " The cached copy is older than the origin, so a hit returns stale data."
    : "";
  return `${cache} ${origin}${behind}`;
}

function EventInspector({
  event,
  focus,
  snapshot,
  input,
  playing,
  endOfLimitedTrace,
  empty,
}: {
  event?: CacheAsideEvent;
  focus?: KeyState;
  snapshot: CacheSnapshot;
  input: CacheAsideInput;
  playing: boolean;
  endOfLimitedTrace: boolean;
  empty: boolean;
}) {
  return (
    <div
      className="current-event cache-inspector"
      aria-live={playing ? "off" : "polite"}
    >
      <span className={event && steps[event.kind].failure ? "failure" : ""}>
        {event?.kind ?? "initial"}
      </span>
      <div>
        <strong>
          {event
            ? `Operation ${event.operation} · ${operationLabel(input, event.operation)} · event ${event.sequence} at ${event.timeMs} ms`
            : "Initial state, before any event"}
        </strong>
        {event && <p>{event.message}</p>}
        {focus && <p>{describeKey(focus, snapshot.atMs)}</p>}
        {empty && <p>This run produced no events to play.</p>}
        {endOfLimitedTrace && (
          <p className="cache-limit-note">
            The trace stops here because the run reached a limit. Later events
            were not simulated.
          </p>
        )}
      </div>
    </div>
  );
}

function StateTable({
  snapshot,
  label,
}: {
  snapshot: CacheSnapshot;
  label: string;
}) {
  return (
    <section className="result-section">
      <h3>Cache and origin state</h3>
      <p className="cache-state-caption">
        {label}. Cache {snapshot.cacheAvailable ? "available" : "unavailable"};
        origin {snapshot.originAvailable ? "available" : "unavailable"}. Keys
        appear once an operation touches them.
      </p>
      <div
        className="table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Scrollable cache and origin state"
      >
        <table
          className="data-table"
          aria-label="Cache and origin state at the selected position"
        >
          <thead>
            <tr>
              <th>Key</th>
              <th>Cached value</th>
              <th>Filled (ms)</th>
              <th>Expires (ms)</th>
              <th>Cache status</th>
              <th>Origin value</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.keys.map((state) => {
              const entry = state.cacheEntry;
              return (
                <tr
                  key={state.key}
                  className={isBehindOrigin(state) ? "stale-row" : undefined}
                >
                  <td>{state.key}</td>
                  <td>
                    {entry ? `${entry.value} (version ${entry.version})` : "—"}
                  </td>
                  <td>{entry?.filledAtMs ?? "—"}</td>
                  <td>{entry?.expiresAtMs ?? "—"}</td>
                  <td>
                    {entry
                      ? `${entryStatus(entry, snapshot.atMs)}${isBehindOrigin(state) ? ", behind origin" : ""}`
                      : "No entry"}
                  </td>
                  <td>
                    {state.originValue
                      ? `${state.originValue.value} (version ${state.originValue.version})`
                      : "Not found"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
