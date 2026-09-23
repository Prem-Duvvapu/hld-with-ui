import { useState } from "react";
import { api } from "../../api/client";
import type {
  RateLimiterDescriptor,
  RateLimiterInput,
  RateLimiterResult,
} from "../../api/types";

type FormState = {
  algorithm: RateLimiterInput["algorithm"];
  counterScope: RateLimiterInput["counterScope"];
  nodeCount: string;
  limit: string;
  windowMs: string;
  refillTokensPerSecond: string;
  counterBackendAvailable: boolean;
  backendFailurePolicy: RateLimiterInput["backendFailurePolicy"];
  arrivals: string;
};

function toForm(input: RateLimiterInput): FormState {
  return {
    algorithm: input.algorithm,
    counterScope: input.counterScope,
    nodeCount: String(input.nodeCount),
    limit: String(input.limit),
    windowMs: String(input.windowMs),
    refillTokensPerSecond: String(input.refillTokensPerSecond),
    counterBackendAvailable: input.counterBackendAvailable,
    backendFailurePolicy: input.backendFailurePolicy,
    arrivals: input.arrivalTimesMs.join(", "),
  };
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

function buildInput(
  form: FormState,
  modelVersion: RateLimiterInput["modelVersion"],
): RateLimiterInput {
  const arrivalTimesMs = form.arrivals
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(Number);
  if (!arrivalTimesMs.length || arrivalTimesMs.length > 500)
    throw new Error("Arrival times need 1–500 comma-separated values.");
  if (
    arrivalTimesMs.some(
      (value, index) =>
        !Number.isInteger(value) ||
        value < 0 ||
        value > 300_000 ||
        (index > 0 && value < arrivalTimesMs[index - 1]!),
    )
  )
    throw new Error(
      "Arrival times must be ordered whole milliseconds from 0 to 300,000.",
    );
  return {
    schemaVersion: "1.0",
    modelVersion,
    algorithm: form.algorithm,
    counterScope: form.counterScope,
    nodeCount: boundedInteger(form.nodeCount, "Node count", 1, 20),
    limit: boundedInteger(form.limit, "Limit", 1, 10_000),
    windowMs: boundedInteger(form.windowMs, "Window", 100, 60_000),
    refillTokensPerSecond: boundedInteger(
      form.refillTokensPerSecond,
      "Refill rate",
      1,
      10_000,
    ),
    counterBackendAvailable: form.counterBackendAvailable,
    backendFailurePolicy: form.backendFailurePolicy,
    arrivalTimesMs,
    seed: 42,
  };
}

export function RateLimiterPlayground({
  descriptor,
}: {
  descriptor: RateLimiterDescriptor;
}) {
  const initial = descriptor.presets[0]!.input;
  const [form, setForm] = useState(() => toForm(initial));
  const [runForm, setRunForm] = useState<FormState | null>(null);
  const [prediction, setPrediction] = useState(descriptor.presets[0]!.question);
  const [result, setResult] = useState<RateLimiterResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const inputsChanged = runForm
    ? JSON.stringify(form) !== JSON.stringify(runForm)
    : false;

  async function run() {
    setError("");
    try {
      const input = buildInput(form, descriptor.modelVersion);
      setRunning(true);
      const next = await api.runRateLimiter(input);
      setResult(next);
      setRunForm(form);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The model could not run.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="playground-layout rate-limiter-layout">
      <aside className="control-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Define the boundary</p>
            <h2>Limiter controls</h2>
          </div>
          <span className="live-badge">Virtual time</span>
        </div>
        <div className="preset-row" aria-label="Rate limiter presets">
          {descriptor.presets.map((preset) => (
            <button
              type="button"
              key={preset.id}
              onClick={() => {
                setForm(toForm(preset.input));
                setRunForm(null);
                setResult(null);
                setPrediction(preset.question);
                setError("");
              }}
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
          Algorithm
          <select
            value={form.algorithm}
            onChange={(event) =>
              setForm({
                ...form,
                algorithm: event.target.value as FormState["algorithm"],
              })
            }
          >
            <option value="FIXED_WINDOW">Fixed window</option>
            <option value="TOKEN_BUCKET">Token bucket</option>
          </select>
          <small>
            {form.algorithm === "FIXED_WINDOW"
              ? "Allowance resets at an aligned boundary."
              : "Capacity allows a burst; tokens refill over time."}
          </small>
        </label>
        <label>
          Counter placement
          <select
            value={form.counterScope}
            onChange={(event) =>
              setForm({
                ...form,
                counterScope: event.target.value as FormState["counterScope"],
              })
            }
          >
            <option value="SHARED">One shared counter</option>
            <option value="LOCAL_PER_NODE">Local counter per node</option>
          </select>
        </label>
        <div className="field-row">
          <label>
            Application nodes
            <input
              type="number"
              min="1"
              max="20"
              value={form.nodeCount}
              onChange={(event) =>
                setForm({ ...form, nodeCount: event.target.value })
              }
            />
          </label>
          <label>
            Limit / capacity
            <input
              type="number"
              min="1"
              max="10000"
              value={form.limit}
              onChange={(event) =>
                setForm({ ...form, limit: event.target.value })
              }
            />
          </label>
        </div>
        <div className="field-row">
          <label>
            Window (ms)
            <input
              type="number"
              min="100"
              max="60000"
              disabled={form.algorithm !== "FIXED_WINDOW"}
              value={form.windowMs}
              onChange={(event) =>
                setForm({ ...form, windowMs: event.target.value })
              }
            />
          </label>
          <label>
            Refill (tokens/s)
            <input
              type="number"
              min="1"
              max="10000"
              disabled={form.algorithm !== "TOKEN_BUCKET"}
              value={form.refillTokensPerSecond}
              onChange={(event) =>
                setForm({ ...form, refillTokensPerSecond: event.target.value })
              }
            />
          </label>
        </div>
        <label>
          Arrival times (ms)
          <input
            value={form.arrivals}
            onChange={(event) =>
              setForm({ ...form, arrivals: event.target.value })
            }
            aria-describedby="rate-arrivals-help"
          />
          <small id="rate-arrivals-help">
            One ordered timestamp per request, separated by commas.
          </small>
        </label>
        {form.counterScope === "SHARED" && (
          <fieldset className="availability-control">
            <legend>Shared counter backend</legend>
            <label className="check-control">
              <input
                type="checkbox"
                checked={form.counterBackendAvailable}
                onChange={(event) =>
                  setForm({
                    ...form,
                    counterBackendAvailable: event.target.checked,
                  })
                }
              />
              Available
            </label>
            <label>
              When unavailable
              <select
                value={form.backendFailurePolicy}
                onChange={(event) =>
                  setForm({
                    ...form,
                    backendFailurePolicy: event.target
                      .value as FormState["backendFailurePolicy"],
                  })
                }
              >
                <option value="FAIL_CLOSED">Fail closed</option>
                <option value="FAIL_OPEN">Fail open</option>
              </select>
            </label>
          </fieldset>
        )}
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
        <button
          className="button primary run-button"
          type="button"
          disabled={running}
          onClick={run}
        >
          {running ? "Evaluating…" : "Run request burst"}
          <span aria-hidden="true">→</span>
        </button>
        <p className="model-note">Java model · v{descriptor.modelVersion}</p>
      </aside>

      <section className="experiment-stage" aria-label="Rate limiter results">
        <div className="stage-header">
          <div>
            <p className="eyebrow">Inspect the decision</p>
            <h2>Enforcement trace</h2>
          </div>
          {result && (
            <span className="time-display">
              {result.metrics.total} requests
            </span>
          )}
        </div>
        {inputsChanged && (
          <div className="stale-result" role="status">
            <strong>Inputs changed.</strong> Results still describe the previous
            run.
          </div>
        )}
        {!result ? (
          <div className="empty-experiment">
            <div className="rate-empty-flow" aria-hidden="true">
              <span>Identity</span>
              <i>→</i>
              <span>Counter</span>
              <i>→</i>
              <span>Service</span>
            </div>
            <h3>Ready to test the boundary</h3>
            <p>
              Choose a preset, predict the outcome, and run the Java model.
              Every decision names the counter that allowed or rejected it.
            </p>
          </div>
        ) : (
          <RateLimiterResultView result={result} runForm={runForm!} />
        )}
      </section>
    </div>
  );
}

function RateLimiterResultView({
  result,
  runForm,
}: {
  result: RateLimiterResult;
  runForm: FormState;
}) {
  const metrics = result.metrics;
  return (
    <>
      <div
        className="rate-topology"
        aria-label={`${runForm.nodeCount} application nodes using ${runForm.counterScope === "SHARED" ? "one shared counter" : "one local counter each"}.`}
      >
        <div>
          <small>SUBJECT</small>
          <strong>API key</strong>
        </div>
        <span>→</span>
        <div>
          <small>ENFORCEMENT</small>
          <strong>{runForm.nodeCount} nodes</strong>
        </div>
        <span>→</span>
        <div
          className={runForm.counterScope === "LOCAL_PER_NODE" ? "warning" : ""}
        >
          <small>STATE</small>
          <strong>
            {runForm.counterScope === "SHARED"
              ? "Shared counter"
              : `${runForm.nodeCount} local counters`}
          </strong>
        </div>
        <span>→</span>
        <div>
          <small>PROTECTED</small>
          <strong>Service</strong>
        </div>
      </div>
      <div
        className={`decision-callout ${runForm.counterScope === "LOCAL_PER_NODE" ? "warning" : ""}`}
      >
        <strong>
          {runForm.counterScope === "SHARED"
            ? "One enforcement scope"
            : "Distributed overshoot is possible"}
        </strong>
        <p>
          Configured limit {metrics.configuredLimit} × {metrics.counters}{" "}
          counter{metrics.counters === 1 ? "" : "s"} ={" "}
          {metrics.maximumAggregateAllowance} maximum aggregate allowance in
          this model.
        </p>
      </div>
      <div className="metric-grid" aria-label="Rate limiter metrics">
        <article>
          <small>ALLOWED</small>
          <strong>{metrics.allowed}</strong>
          <span>enforced</span>
        </article>
        <article>
          <small>REJECTED</small>
          <strong>{metrics.rejected}</strong>
          <span>requests</span>
        </article>
        <article>
          <small>BYPASSED</small>
          <strong>{metrics.bypassed}</strong>
          <span>fail-open</span>
        </article>
        <article>
          <small>COUNTERS</small>
          <strong>{metrics.counters}</strong>
          <span>decision state</span>
        </article>
        <article>
          <small>MAX ALLOWANCE</small>
          <strong>{metrics.maximumAggregateAllowance}</strong>
          <span>per window/burst</span>
        </article>
      </div>
      <details className="trace-details" open>
        <summary>Inspect every request decision</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Request</th>
                <th>Time</th>
                <th>Node</th>
                <th>Decision</th>
                <th>Remaining</th>
                <th>Retry after</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {result.outcomes.map((outcome) => (
                <tr key={outcome.requestId}>
                  <td>{outcome.requestId}</td>
                  <td>{outcome.timeMs.toLocaleString()} ms</td>
                  <td>{outcome.nodeId}</td>
                  <td>
                    <span
                      className={`outcome ${outcome.decision.toLowerCase()}`}
                    >
                      {outcome.decision}
                    </span>
                  </td>
                  <td>{outcome.remaining}</td>
                  <td>
                    {outcome.retryAfterMs == null
                      ? "—"
                      : `${outcome.retryAfterMs} ms`}
                  </td>
                  <td>{outcome.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details className="assumptions">
        <summary>Model assumptions and limits</summary>
        <ul>
          {result.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </details>
    </>
  );
}
