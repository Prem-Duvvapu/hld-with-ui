import { useState } from "react";
import "./CacheAsidePlayground.css";
import { api } from "../../api/client";
import { CachePlayback } from "./CachePlayback";
import type {
  CacheAsideDescriptor,
  CacheAsideLimits,
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
  limits: CacheAsideLimits,
): CacheAsideInput["operations"] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length || lines.length > limits.maxOperations)
    throw new Error(`Operations need 1–${limits.maxOperations} lines.`);
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
    if (
      key.length > limits.maxKeyLength ||
      (value?.length ?? 0) > limits.maxValueLength
    )
      throw new Error(
        `Line ${index + 1}: key allows ${limits.maxKeyLength} characters and value allows ${limits.maxValueLength}.`,
      );
    if (kind === "UPDATE" && !value)
      throw new Error(`Line ${index + 1}: UPDATE requires a value.`);
    if (timeMs < 0 || timeMs > limits.maxOperationTimeMs)
      throw new Error(
        `Line ${index + 1}: time must be 0–${limits.maxOperationTimeMs.toLocaleString("en-US")}.`,
      );
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

// Bounds come from the Java descriptor, which enforces the same values.
function buildInput(
  form: FormState,
  source: CacheAsideInput,
  limits: CacheAsideLimits,
): CacheAsideInput {
  return {
    ...source,
    cacheLookupLatencyMs: boundedInteger(
      form.cacheLookupLatencyMs,
      "Cache lookup latency",
      0,
      limits.maxLatencyMs,
    ),
    originReadLatencyMs: boundedInteger(
      form.originReadLatencyMs,
      "Origin read latency",
      0,
      limits.maxLatencyMs,
    ),
    ttlMs: boundedInteger(form.ttlMs, "TTL", 0, limits.maxTtlMs),
    initialOriginValue: form.initialOriginValue,
    operations: parseOperations(form.operations, limits),
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
  // A result is kept with the exact input that produced it, so playback
  // labels never describe edited-but-unrun inputs.
  const [run, setRun] = useState<{
    id: number;
    input: CacheAsideInput;
    result: CacheAsideResult;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [activePreset, setActivePreset] = useState(
    descriptor.presets[0]?.id ?? "",
  );

  function updateForm(patch: Partial<FormState>) {
    setForm((previous) => ({ ...previous, ...patch }));
    setRun(null);
    setError("");
    setActivePreset("");
  }

  async function runSimulation() {
    setError("");
    setRunning(true);
    setRun(null);
    try {
      const input = buildInput(form, sourceInput, descriptor.limits);
      const result = await api.runCacheAside(input);
      setRun((previous) => ({ id: (previous?.id ?? 0) + 1, input, result }));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Run failed.");
      setRun(null);
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
      setRun(null);
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
        <p className="model-note">Java model · v{descriptor.modelVersion}</p>
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
            max: descriptor.limits.maxLatencyMs,
          })}
          {field("Origin read (ms)", "originReadLatencyMs", {
            type: "number",
            min: 0,
            max: descriptor.limits.maxLatencyMs,
          })}
          {field("TTL (ms)", "ttlMs", {
            type: "number",
            min: 0,
            max: descriptor.limits.maxTtlMs,
          })}
          {field("Initial origin value", "initialOriginValue", {
            maxLength: descriptor.limits.maxValueLength,
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
          onClick={runSimulation}
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

      {run ? (
        // Keyed by run so playback position and timers reset for each result.
        <CacheAsideResults key={run.id} result={run.result} input={run.input} />
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

function CacheAsideResults({
  result,
  input,
}: {
  result: CacheAsideResult;
  input: CacheAsideInput;
}) {
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
      <CachePlayback result={result} input={input} />

      <section className="result-section" aria-labelledby="cache-final-metrics">
        <h3 id="cache-final-metrics">
          {result.status === "limited"
            ? "Final run metrics (partial)"
            : "Final run metrics"}
        </h3>
        <p className="cache-state-caption">
          Totals for the whole run, not the selected event.
        </p>
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
          Hit ratio = hits / (hits + misses). Bypasses are excluded; failed
          misses are included. Observation: 0–{metrics.observationWindowMs} ms.
          Initially only key k exists.
        </p>
      </section>
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
