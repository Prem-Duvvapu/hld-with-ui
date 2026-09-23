import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import type {
  RequestFlowInput,
  RequestFlowResult,
  SimulationDescriptor,
} from "../../api/types";

interface FormState {
  policy: RequestFlowInput["policy"];
  arrivals: string;
  services: string;
  workers: string;
  queue: string;
}
const emptyForm: FormState = {
  policy: "ROUND_ROBIN",
  arrivals: "0, 0, 0, 0, 0, 0",
  services: "100, 100",
  workers: "1",
  queue: "4",
};

const playbackSpeeds = [
  { label: "0.5×", intervalMs: 1_200 },
  { label: "1×", intervalMs: 600 },
  { label: "2×", intervalMs: 300 },
] as const;

function toForm(input: RequestFlowInput): FormState {
  return {
    policy: input.policy,
    arrivals: input.arrivalTimesMs.join(", "),
    services: input.nodeServiceTimesMs.join(", "),
    workers: String(input.workersPerNode),
    queue: String(input.queueCapacity),
  };
}

function parseList(
  value: string,
  name: string,
  min: number,
  max: number,
  maxItems: number,
): number[] {
  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!parts.length || parts.length > maxItems)
    throw new Error(`${name} needs 1–${maxItems} comma-separated numbers.`);
  const values = parts.map(Number);
  if (
    values.some(
      (number) => !Number.isInteger(number) || number < min || number > max,
    )
  )
    throw new Error(
      `${name} values must be whole numbers from ${min} to ${max}.`,
    );
  return values;
}

function buildInput(
  form: FormState,
  modelVersion: RequestFlowInput["modelVersion"],
): RequestFlowInput {
  const arrivalTimesMs = parseList(
    form.arrivals,
    "Arrival times",
    0,
    60_000,
    100,
  );
  if (
    arrivalTimesMs.some(
      (value, index) => index > 0 && value < arrivalTimesMs[index - 1]!,
    )
  )
    throw new Error("Arrival times must be in increasing order.");
  const nodeServiceTimesMs = parseList(
    form.services,
    "Node service times",
    1,
    10_000,
    8,
  );
  const workersPerNode = Number(form.workers);
  const queueCapacity = Number(form.queue);
  if (
    !Number.isInteger(workersPerNode) ||
    workersPerNode < 1 ||
    workersPerNode > 8
  )
    throw new Error("Workers per node must be from 1 to 8.");
  if (
    !Number.isInteger(queueCapacity) ||
    queueCapacity < 0 ||
    queueCapacity > 100
  )
    throw new Error("Queue capacity must be from 0 to 100.");
  return {
    schemaVersion: "1.0",
    modelVersion,
    policy: form.policy,
    arrivalTimesMs,
    nodeServiceTimesMs,
    workersPerNode,
    queueCapacity,
    seed: 42,
  };
}

export function Playground({
  descriptor,
}: {
  descriptor: SimulationDescriptor;
}) {
  const initial = descriptor.presets[0]?.input;
  const [form, setForm] = useState<FormState>(
    initial ? toForm(initial) : emptyForm,
  );
  const [result, setResult] = useState<RequestFlowResult | null>(null);
  const [runInput, setRunInput] = useState<RequestFlowInput | null>(null);
  const [prediction, setPrediction] = useState(
    descriptor.presets[0]?.question ??
      "Predict what will queue before running.",
  );
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [eventIndex, setEventIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [playbackIntervalMs, setPlaybackIntervalMs] = useState(600);

  async function run() {
    setError("");
    setPlaying(false);
    try {
      const input = buildInput(form, descriptor.modelVersion);
      setRunning(true);
      const next = await api.runRequestFlow(input);
      setResult(next);
      setRunInput(input);
      setEventIndex(0);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The simulation could not run.",
      );
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    if (!playing || !result) return;
    if (eventIndex >= result.events.length - 1) return;
    const timer = window.setTimeout(() => {
      const nextIndex = eventIndex + 1;
      setEventIndex(nextIndex);
      if (nextIndex >= result.events.length - 1) setPlaying(false);
    }, playbackIntervalMs);
    return () => window.clearTimeout(timer);
  }, [playing, eventIndex, playbackIntervalMs, result]);

  const event = result?.events[eventIndex];
  const nodeIds = useMemo(() => {
    const count = runInput
      ? runInput.nodeServiceTimesMs.length
      : form.services.split(",").filter((item) => item.trim()).length;
    return Array.from(
      { length: count },
      (_, index) => `Node ${String.fromCharCode(65 + index)}`,
    );
  }, [form.services, runInput]);
  const inputsChanged = runInput
    ? JSON.stringify(form) !== JSON.stringify(toForm(runInput))
    : false;
  const hasFieldError = (field: string) =>
    error.toLowerCase().startsWith(field.toLowerCase());

  return (
    <div className="playground-layout">
      <aside className="control-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Change the system</p>
            <h2>Workload controls</h2>
          </div>
          <span className="live-badge">Deterministic</span>
        </div>
        <div className="preset-row" aria-label="Simulation presets">
          {descriptor.presets.map((preset) => (
            <button
              type="button"
              key={preset.id}
              onClick={() => {
                setForm(toForm(preset.input));
                setResult(null);
                setRunInput(null);
                setPrediction(preset.question);
                setError("");
              }}
              title={preset.question}
            >
              {preset.title}
            </button>
          ))}
        </div>
        <div className="prediction-callout">
          <span>Predict first</span>
          <p>{prediction}</p>
        </div>
        <label>
          <span id="routing-policy-label">Routing policy</span>
          <select
            aria-labelledby="routing-policy-label"
            aria-describedby="routing-policy-help"
            value={form.policy}
            onChange={(e) =>
              setForm({
                ...form,
                policy: e.target.value as RequestFlowInput["policy"],
              })
            }
          >
            <option value="ROUND_ROBIN">Round robin</option>
            <option value="LEAST_OUTSTANDING">Least outstanding</option>
          </select>
          <small id="routing-policy-help">
            How the balancer chooses a node.
          </small>
        </label>
        <label>
          <span id="arrival-times-label">Arrival times (ms)</span>
          <input
            aria-labelledby="arrival-times-label"
            aria-describedby={`arrival-times-help${hasFieldError("Arrival times") ? " simulation-input-error" : ""}`}
            aria-invalid={hasFieldError("Arrival times") || undefined}
            value={form.arrivals}
            onChange={(e) => setForm({ ...form, arrivals: e.target.value })}
            placeholder="0, 0, 100"
          />
          <small id="arrival-times-help">
            One timestamp per request, in order.
          </small>
        </label>
        <label>
          <span id="service-times-label">Node service times (ms)</span>
          <input
            aria-labelledby="service-times-label"
            aria-describedby={`service-times-help${hasFieldError("Node service times") ? " simulation-input-error" : ""}`}
            aria-invalid={hasFieldError("Node service times") || undefined}
            value={form.services}
            onChange={(e) => setForm({ ...form, services: e.target.value })}
            placeholder="100, 250"
          />
          <small id="service-times-help">
            One duration creates one service node.
          </small>
        </label>
        <div className="field-row">
          <label>
            Workers / node
            <input
              type="number"
              aria-describedby={
                hasFieldError("Workers") ? "simulation-input-error" : undefined
              }
              aria-invalid={hasFieldError("Workers") || undefined}
              min="1"
              max="8"
              value={form.workers}
              onChange={(e) => setForm({ ...form, workers: e.target.value })}
            />
          </label>
          <label>
            Queue / node
            <input
              type="number"
              aria-describedby={
                hasFieldError("Queue") ? "simulation-input-error" : undefined
              }
              aria-invalid={hasFieldError("Queue") || undefined}
              min="0"
              max="100"
              value={form.queue}
              onChange={(e) => setForm({ ...form, queue: e.target.value })}
            />
          </label>
        </div>
        {error && (
          <div
            className="inline-error"
            id="simulation-input-error"
            role="alert"
          >
            {error}
          </div>
        )}
        <button
          className="button primary run-button"
          type="button"
          disabled={running}
          onClick={run}
        >
          {running ? "Running…" : "Run experiment"}{" "}
          <span aria-hidden="true">→</span>
        </button>
        <p className="model-note">
          Java model · v{descriptor.modelVersion} · virtual time
        </p>
      </aside>

      <div className="experiment-stage">
        <div className="stage-header">
          <div>
            <p className="eyebrow">Observe the request</p>
            <h2>System trace</h2>
          </div>
          {result && (
            <span className="time-display">T+ {event?.timeMs ?? 0} ms</span>
          )}
        </div>
        {inputsChanged && (
          <div className="stale-result" role="status">
            <strong>Inputs changed.</strong> This trace still represents the
            previous run. Run the experiment again to update it.
          </div>
        )}
        {result?.status === "limited" && (
          <div className="limited-result" role="status">
            <strong>Trace stopped at its safety limit.</strong>
            <span>
              {result.truncationReason === "event_limit"
                ? `The ${result.limits.maxEvents.toLocaleString()} event limit was reached.`
                : `The ${result.limits.maxVirtualTimeMs.toLocaleString()} ms virtual time limit was reached.`}{" "}
              {result.incompleteRequests} request
              {result.incompleteRequests === 1 ? " is" : "s are"} incomplete.
              Metrics below cover only terminal outcomes through T+
              {result.lastVirtualTimeMs.toLocaleString()} ms.
            </span>
          </div>
        )}
        {!result ? (
          <EmptyExperiment assumptions={descriptor.assumptions} />
        ) : (
          <>
            <SystemMap
              nodeIds={nodeIds}
              eventKind={event?.kind}
              activeNode={event?.nodeId}
            />
            <div className="playback">
              <button
                className="play-button"
                type="button"
                onClick={() => {
                  if (playing) setPlaying(false);
                  else {
                    if (eventIndex >= result.events.length - 1)
                      setEventIndex(0);
                    setPlaying(result.events.length > 1);
                  }
                }}
                disabled={result.events.length < 2}
                aria-label={playing ? "Pause trace" : "Play trace"}
              >
                {playing ? "Ⅱ" : "▶"}
              </button>
              <button
                className="step-button"
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setEventIndex(Math.max(0, eventIndex - 1));
                }}
                disabled={eventIndex <= 0}
                aria-label="Previous event"
              >
                ←
              </button>
              <input
                aria-label="Trace position"
                aria-valuetext={`Event ${eventIndex + 1} of ${result.events.length}`}
                type="range"
                min="0"
                max={result.events.length - 1}
                value={eventIndex}
                onChange={(e) => {
                  setPlaying(false);
                  setEventIndex(Number(e.target.value));
                }}
              />
              <button
                className="step-button"
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setEventIndex(
                    Math.min(result.events.length - 1, eventIndex + 1),
                  );
                }}
                disabled={eventIndex >= result.events.length - 1}
                aria-label="Next event"
              >
                →
              </button>
              <button
                className="step-button"
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setEventIndex(0);
                }}
                disabled={eventIndex <= 0}
                aria-label="Reset trace"
              >
                ↺
              </button>
              <span>
                {eventIndex + 1} / {result.events.length}
              </span>
              <label className="playback-speed">
                <span>Speed</span>
                <select
                  aria-label="Playback speed"
                  value={playbackIntervalMs}
                  onChange={(e) =>
                    setPlaybackIntervalMs(Number(e.target.value))
                  }
                >
                  {playbackSpeeds.map((speed) => (
                    <option key={speed.intervalMs} value={speed.intervalMs}>
                      {speed.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div
              className="current-event"
              aria-live={playing ? "off" : "polite"}
            >
              <span>{event?.kind.replace("request.", "")}</span>
              <div>
                <strong>{event?.requestId ?? "System event"}</strong>
                <p>{event?.message}</p>
              </div>
            </div>
            <details className="trace-details trace-log" open>
              <summary>Inspect the complete event trace</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Virtual time</th>
                      <th>Event</th>
                      <th>Request</th>
                      <th>Node</th>
                      <th>Explanation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.events.map((traceEvent, index) => (
                      <tr
                        className={
                          index === eventIndex ? "selected" : undefined
                        }
                        key={traceEvent.sequence}
                      >
                        <td>
                          <button
                            className="trace-event-link"
                            type="button"
                            aria-label={`View event ${traceEvent.sequence}`}
                            aria-current={
                              index === eventIndex ? "step" : undefined
                            }
                            onClick={() => {
                              setPlaying(false);
                              setEventIndex(index);
                            }}
                          >
                            {traceEvent.sequence}
                          </button>
                        </td>
                        <td>{traceEvent.timeMs.toLocaleString()} ms</td>
                        <td>{traceEvent.kind.replace("request.", "")}</td>
                        <td>{traceEvent.requestId}</td>
                        <td>{traceEvent.nodeId ?? "—"}</td>
                        <td>{traceEvent.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <MetricGrid result={result} />
            <details className="trace-details">
              <summary>Inspect every request outcome</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Request</th>
                      <th>Node</th>
                      <th>Status</th>
                      <th>Wait</th>
                      <th>Service</th>
                      <th>Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.outcomes.map((outcome) => (
                      <tr key={outcome.requestId}>
                        <td>{outcome.requestId}</td>
                        <td>{outcome.nodeId}</td>
                        <td>
                          <span
                            className={`outcome ${outcome.status.toLowerCase()}`}
                          >
                            {outcome.status}
                          </span>
                        </td>
                        <td>{formatMs(outcome.queueMs)}</td>
                        <td>{formatMs(outcome.serviceMs)}</td>
                        <td>{formatMs(outcome.latencyMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <details className="assumptions">
              <summary>Model assumptions</summary>
              <ul>
                {result.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyExperiment({ assumptions }: { assumptions: string[] }) {
  return (
    <div className="empty-experiment">
      <div className="empty-animation" aria-hidden="true">
        <i />
        <span>→</span>
        <i />
        <span>→</span>
        <i />
      </div>
      <h3>Ready to route your first requests</h3>
      <p>
        Choose a preset or change the controls, then run the Java simulation.
        The trace will explain every routing, queueing, and completion decision.
      </p>
      <details className="assumptions">
        <summary>What this model assumes</summary>
        <ul>
          {assumptions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function SystemMap({
  nodeIds,
  eventKind,
  activeNode,
}: {
  nodeIds: string[];
  eventKind?: string;
  activeNode?: string | null;
}) {
  return (
    <div
      className="trace-map"
      aria-label={`Current event: ${eventKind ?? "none"}. Active node: ${activeNode ?? "none"}.`}
    >
      <div
        className={`trace-node ${eventKind === "request.arrived" ? "active" : ""}`}
      >
        <small>ENTRY</small>
        <strong>Client</strong>
      </div>
      <span className="map-arrow">→</span>
      <div
        className={`trace-node balancer ${eventKind === "request.routed" ? "active" : ""}`}
      >
        <small>ROUTE</small>
        <strong>Load balancer</strong>
      </div>
      <span className="map-arrow">→</span>
      <div className="trace-nodes">
        {nodeIds.map((node) => (
          <div
            key={node}
            className={`trace-node ${activeNode === node ? "active" : ""} ${eventKind === "request.rejected" && activeNode === node ? "danger" : ""}`}
          >
            <small>SERVICE</small>
            <strong>{node}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricGrid({ result }: { result: RequestFlowResult }) {
  const metrics = result.metrics;
  return (
    <div
      className="metric-grid"
      aria-label={
        result.status === "limited" ? "Partial run metrics" : "Run metrics"
      }
    >
      <article>
        <small>COMPLETED</small>
        <strong>{metrics.completed}</strong>
        <span>requests</span>
      </article>
      <article>
        <small>REJECTED</small>
        <strong>{metrics.rejected}</strong>
        <span>requests</span>
      </article>
      <article>
        <small>MEAN LATENCY</small>
        <strong>
          {metrics.meanLatencyMs === null
            ? "—"
            : metrics.meanLatencyMs.toFixed(1)}
        </strong>
        <span>ms</span>
      </article>
      <article>
        <small>P95 LATENCY</small>
        <strong>{metrics.p95LatencyMs ?? "—"}</strong>
        <span>ms</span>
      </article>
      <article>
        <small>THROUGHPUT</small>
        <strong>
          {metrics.throughputPerSecond === null
            ? "—"
            : metrics.throughputPerSecond.toFixed(1)}
        </strong>
        <span>req / sec</span>
      </article>
    </div>
  );
}

function formatMs(value: number | null) {
  return value === null ? "—" : `${value} ms`;
}
