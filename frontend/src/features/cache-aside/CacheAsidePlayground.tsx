import { useState } from "react";
import "./CacheAsidePlayground.css";
import { api } from "../../api/client";
import type {
  CacheAsideDescriptor,
  CacheAsideInput,
  CacheAsideResult,
  CacheGetOutcome,
} from "../../api/types";

type FormState = {
  cacheLookupLatencyMs: string;
  originReadLatencyMs: string;
  ttlMs: string;
  initialOriginValue: string;
  operations: string;
  cacheAvailable: boolean;
  originAvailable: boolean;
};

function toForm(input: CacheAsideInput): FormState {
  return {
    cacheLookupLatencyMs: String(input.cacheLookupLatencyMs),
    originReadLatencyMs: String(input.originReadLatencyMs),
    ttlMs: String(input.ttlMs),
    initialOriginValue: input.initialOriginValue,
    operations: input.operations
      .map(
        (op) =>
          `${op.kind} ${op.key}${op.value ? ` ${op.value}` : ""} @${op.timeMs}`,
      )
      .join("\n"),
    cacheAvailable: input.cacheAvailable,
    originAvailable: input.originAvailable,
  };
}

function parseOperations(text: string): CacheAsideInput["operations"] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length || lines.length > 100)
    throw new Error("Operations need 1–100 lines.");
  return lines.map((line, index) => {
    const match = line.match(/^(GET|UPDATE)\s+(\S+)(?:\s+(\S+))?\s+@(\d+)$/i);
    if (!match)
      throw new Error(
        `Line ${index + 1}: expected "GET key @time" or "UPDATE key value @time".`,
      );
    const kind = match[1]!.toUpperCase() as "GET" | "UPDATE";
    const key = match[2]!;
    const value = match[3] ?? null;
    const timeMs = Number(match[4]);
    if (kind === "GET" && value !== null)
      throw new Error(`Line ${index + 1}: GET cannot have a value.`);
    if (key.length > 64 || (value?.length ?? 0) > 256)
      throw new Error(
        `Line ${index + 1}: key allows 64 characters and value allows 256.`,
      );
    if (kind === "UPDATE" && !value)
      throw new Error(`Line ${index + 1}: UPDATE requires a value.`);
    if (timeMs < 0 || timeMs > 60_000)
      throw new Error(`Line ${index + 1}: time must be 0–60,000.`);
    return { kind, key, value, timeMs };
  });
}

function boundedInteger(
  value: string,
  label: string,
  min: number,
  max: number,
) {
  // Number("") is 0, so a cleared field must be rejected rather than run as zero.
  const number = value.trim() === "" ? Number.NaN : Number(value);
  if (!Number.isInteger(number) || number < min || number > max)
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return number;
}

function buildInput(form: FormState, source: CacheAsideInput): CacheAsideInput {
  return {
    ...source,
    cacheLookupLatencyMs: boundedInteger(
      form.cacheLookupLatencyMs,
      "Cache lookup latency",
      0,
      10_000,
    ),
    originReadLatencyMs: boundedInteger(
      form.originReadLatencyMs,
      "Origin read latency",
      0,
      10_000,
    ),
    ttlMs: boundedInteger(form.ttlMs, "TTL", 0, 60_000),
    initialOriginValue: form.initialOriginValue,
    operations: parseOperations(form.operations),
    cacheAvailable: form.cacheAvailable,
    originAvailable: form.originAvailable,
  };
}

export function CacheAsidePlayground({
  descriptor,
}: {
  descriptor: CacheAsideDescriptor;
}) {
  const [form, setForm] = useState<FormState>(() =>
    toForm(descriptor.presets[0]!.input),
  );
  const [sourceInput, setSourceInput] = useState(descriptor.presets[0]!.input);
  const [result, setResult] = useState<CacheAsideResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [activePreset, setActivePreset] = useState(
    descriptor.presets[0]?.id ?? "",
  );

  function updateForm(patch: Partial<FormState>) {
    setForm((previous) => ({ ...previous, ...patch }));
    setResult(null);
    setError("");
    setActivePreset("");
  }

  async function run() {
    setError("");
    setRunning(true);
    setResult(null);
    try {
      const input = buildInput(form, sourceInput);
      const data = await api.runCacheAside(input);
      setResult(data);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Run failed.");
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  function selectPreset(id: string) {
    const preset = descriptor.presets.find((p) => p.id === id);
    if (preset) {
      setSourceInput(preset.input);
      setForm(toForm(preset.input));
      setActivePreset(id);
      setResult(null);
      setError("");
    }
  }

  const field = (
    label: string,
    key: keyof FormState,
    props?: React.InputHTMLAttributes<HTMLInputElement>,
  ) => (
    <label className="field" key={key}>
      <span className="field-label">{label}</span>
      <input
        className="field-input"
        value={form[key] as string}
        disabled={running}
        onChange={(event) => updateForm({ [key]: event.target.value })}
        {...props}
      />
    </label>
  );

  return (
    <div className="cache-playground" id="cache-aside-playground">
      <div className="playground-controls">
        <h2>Trace a read through the cache</h2>
        <p className="cache-guidance">
          Change the workload, predict the result, then follow the
          Java-generated trace.
        </p>
        {activePreset && (
          <p>
            {descriptor.presets.find((p) => p.id === activePreset)?.question}
          </p>
        )}
        <div className="presets" role="group" aria-label="Simulation presets">
          {descriptor.presets.map((preset) => (
            <button
              key={preset.id}
              disabled={running}
              className={`preset-button ${activePreset === preset.id ? "active" : ""}`}
              onClick={() => selectPreset(preset.id)}
              title={preset.question}
            >
              {preset.title}
            </button>
          ))}
        </div>

        <div className="field-group">
          {field("Cache lookup (ms)", "cacheLookupLatencyMs", {
            type: "number",
            min: 0,
            max: 10000,
          })}
          {field("Origin read (ms)", "originReadLatencyMs", {
            type: "number",
            min: 0,
            max: 10000,
          })}
          {field("TTL (ms)", "ttlMs", {
            type: "number",
            min: 0,
            max: 60000,
          })}
          {field("Initial origin value", "initialOriginValue", {
            maxLength: 256,
          })}
        </div>

        <div className="field-group">
          <label className="field">
            <span className="field-label">
              Operations (one per line: GET key @time / UPDATE key value @time)
            </span>
            <textarea
              className="field-input operations-input"
              rows={6}
              disabled={running}
              value={form.operations}
              onChange={(event) =>
                updateForm({ operations: event.target.value })
              }
            />
          </label>
        </div>

        <div className="field-group inline-toggles">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={form.cacheAvailable}
              disabled={running}
              onChange={(event) =>
                updateForm({ cacheAvailable: event.target.checked })
              }
            />
            Cache available
          </label>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={form.originAvailable}
              disabled={running}
              onChange={(event) =>
                updateForm({ originAvailable: event.target.checked })
              }
            />
            Origin available
          </label>
        </div>

        <button
          className="button primary"
          onClick={run}
          disabled={running}
          id="run-cache-aside"
        >
          {running ? "Running…" : "Run simulation"}
        </button>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </div>

      {result ? (
        <CacheAsideResults result={result} />
      ) : (
        <section className="cache-empty" aria-live="polite">
          <h2>
            {running ? "Running your workload…" : "Ready to trace your reads"}
          </h2>
          <p>
            Run the simulation to see hits, misses, stale reads, and origin load
            for these inputs.
          </p>
        </section>
      )}
    </div>
  );
}

function CacheAsideResults({ result }: { result: CacheAsideResult }) {
  const { metrics, outcomes, assumptions } = result;
  return (
    <div className="playground-results">
      {result.status === "limited" && (
        <p role="status" className="notice">
          Partial result: {result.truncationReason}. {result.incompleteGets}{" "}
          GET(s) incomplete. Trace stops at {result.lastVirtualTimeMs} ms;
          metrics cover only observed events.
        </p>
      )}
      <div className="metrics-bar">
        <Metric label="Total GETs" value={metrics.totalGets} />
        <Metric label="Cache Hits" value={metrics.cacheHits} />
        <Metric label="Cache Misses" value={metrics.cacheMisses} />
        <Metric label="Stale Reads" value={metrics.staleReads} />
        <Metric label="Cache Bypasses" value={metrics.cacheBypasses} />
        <Metric label="Failed GETs" value={metrics.failedGets} />
        <Metric label="Origin Reads" value={metrics.originReads} />
        <Metric
          label="Hit Ratio"
          value={
            metrics.cacheHits + metrics.cacheMisses === 0
              ? "—"
              : `${(metrics.hitRatio * 100).toFixed(1)}%`
          }
        />
      </div>

      <p>
        Hit ratio = hits / (hits + misses). Bypasses are excluded; failed misses
        are included. Observation: 0–{metrics.observationWindowMs} ms. Initially
        only key k exists.
      </p>
      <section className="result-section">
        <h3>GET Outcomes</h3>
        <div
          className="table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Scrollable GET outcomes"
        >
          <table className="data-table" aria-label="Cache GET outcomes">
            <thead>
              <tr>
                <th>#</th>
                <th>Key</th>
                <th>Result</th>
                <th>Value</th>
                <th>Stale</th>
                <th>Request (ms)</th>
                <th>Response (ms)</th>
                <th>Latency (ms)</th>
              </tr>
            </thead>
            <tbody>
              {outcomes.map((outcome, index) => (
                <OutcomeRow key={index} outcome={outcome} index={index} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="result-section">
        <h3>Event Trace</h3>
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
                <th>Kind</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {result.events.map((event) => (
                <tr key={event.sequence}>
                  <td>{event.sequence}</td>
                  <td>{event.timeMs}</td>
                  <td>
                    <code>{event.kind}</code>
                  </td>
                  <td>{event.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {assumptions.length > 0 && (
        <section className="result-section">
          <h3>Model Assumptions</h3>
          <ul className="assumptions-list">
            {assumptions.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function OutcomeRow({
  outcome,
  index,
}: {
  outcome: CacheGetOutcome;
  index: number;
}) {
  return (
    <tr className={outcome.stale ? "stale-row" : ""}>
      <td>{index + 1}</td>
      <td>{outcome.key}</td>
      <td>
        <span
          className={`badge ${outcome.hitOrMiss === "HIT" ? "badge-hit" : "badge-miss"}`}
        >
          {outcome.hitOrMiss}
        </span>
      </td>
      <td>
        {outcome.returnedValue ??
          (outcome.hitOrMiss === "ERROR" ? "Unavailable" : "Not found")}
      </td>
      <td>{outcome.stale ? "⚠ Yes" : "No"}</td>
      <td>{outcome.requestTimeMs}</td>
      <td>{outcome.responseTimeMs}</td>
      <td>{outcome.latencyMs}</td>
    </tr>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span className="metric-value">{value}</span>
      <span className="metric-label">{label}</span>
    </div>
  );
}
