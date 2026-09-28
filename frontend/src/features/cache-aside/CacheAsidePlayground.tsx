import { useState } from "react";
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

function parseOperations(
  text: string,
): CacheAsideInput["operations"] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length || lines.length > 100)
    throw new Error("Operations need 1–100 lines.");
  return lines.map((line, index) => {
    const match = line.match(
      /^(GET|UPDATE)\s+(\S+)(?:\s+(\S+))?\s+@(\d+)$/i,
    );
    if (!match) throw new Error(`Line ${index + 1}: expected "GET key @time" or "UPDATE key value @time".`);
    const kind = match[1]!.toUpperCase() as "GET" | "UPDATE";
    const key = match[2]!;
    const value = match[3] ?? null;
    const timeMs = Number(match[4]);
    if (kind === "UPDATE" && !value)
      throw new Error(`Line ${index + 1}: UPDATE requires a value.`);
    if (timeMs < 0 || timeMs > 300_000)
      throw new Error(`Line ${index + 1}: time must be 0–300,000.`);
    return { kind, key, value, timeMs };
  });
}

function boundedInteger(
  value: string,
  label: string,
  min: number,
  max: number,
) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max)
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return number;
}

function buildInput(form: FormState): CacheAsideInput {
  return {
    schemaVersion: "1.0",
    modelVersion: "1.0.0",
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
    initialOriginValue: form.initialOriginValue.trim() || "v1",
    operations: parseOperations(form.operations),
    cacheAvailable: form.cacheAvailable,
    originAvailable: form.originAvailable,
    seed: 7,
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
  const [result, setResult] = useState<CacheAsideResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [activePreset, setActivePreset] = useState(
    descriptor.presets[0]?.id ?? "",
  );

  async function run() {
    setError("");
    setRunning(true);
    try {
      const input = buildInput(form);
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
        onChange={(event) =>
          setForm((previous) => ({ ...previous, [key]: event.target.value }))
        }
        {...props}
      />
    </label>
  );

  return (
    <div className="playground" id="cache-aside-playground">
      <div className="playground-controls">
        <div className="presets" role="group" aria-label="Simulation presets">
          {descriptor.presets.map((preset) => (
            <button
              key={preset.id}
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
          {field("Initial origin value", "initialOriginValue")}
        </div>

        <div className="field-group">
          <label className="field">
            <span className="field-label">
              Operations (one per line: GET key @time / UPDATE key value @time)
            </span>
            <textarea
              className="field-input operations-input"
              rows={6}
              value={form.operations}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  operations: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <div className="field-group inline-toggles">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={form.cacheAvailable}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  cacheAvailable: event.target.checked,
                }))
              }
            />
            Cache available
          </label>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={form.originAvailable}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  originAvailable: event.target.checked,
                }))
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

      {result && <CacheAsideResults result={result} />}
    </div>
  );
}

function CacheAsideResults({ result }: { result: CacheAsideResult }) {
  const { metrics, outcomes, assumptions } = result;
  return (
    <div className="playground-results">
      <div className="metrics-bar">
        <Metric label="Total GETs" value={metrics.totalGets} />
        <Metric label="Cache Hits" value={metrics.cacheHits} />
        <Metric label="Cache Misses" value={metrics.cacheMisses} />
        <Metric label="Stale Reads" value={metrics.staleReads} />
        <Metric label="Origin Reads" value={metrics.originReads} />
        <Metric
          label="Hit Ratio"
          value={`${(metrics.hitRatio * 100).toFixed(1)}%`}
        />
      </div>

      <section className="result-section">
        <h3>GET Outcomes</h3>
        <div className="table-wrap">
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
                <OutcomeRow
                  key={index}
                  outcome={outcome}
                  index={index}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="result-section">
        <h3>Event Trace</h3>
        <div className="table-wrap">
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
      <td>{outcome.returnedValue ?? "—"}</td>
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
