import { useState, type FormEvent } from "react";
import { api, ApiClientError } from "../../api/client";
import type {
  CapacityEstimateInput,
  CapacityEstimateResult,
  CapacityEstimatorDescriptor,
} from "../../api/types";

const fields: Array<{
  key: Exclude<keyof CapacityEstimateInput, "schemaVersion">;
  label: string;
  unit: string;
  min: number;
  max: number;
  step?: number;
  group: "Traffic" | "Data" | "Reliability";
}> = [
  {
    key: "dailyActiveUsers",
    label: "Daily active users",
    unit: "users/day",
    min: 1,
    max: 1_000_000_000,
    group: "Traffic",
  },
  {
    key: "requestsPerUserPerDay",
    label: "Requests per user",
    unit: "requests/day",
    min: 0.01,
    max: 100_000,
    step: 0.01,
    group: "Traffic",
  },
  {
    key: "peakFactor",
    label: "Peak factor",
    unit: "× average",
    min: 1,
    max: 1_000,
    step: 0.1,
    group: "Traffic",
  },
  {
    key: "readPercentage",
    label: "Read share",
    unit: "%",
    min: 0,
    max: 100,
    step: 0.1,
    group: "Traffic",
  },
  {
    key: "recordSizeKb",
    label: "New record size",
    unit: "kB/write",
    min: 0.001,
    max: 1_000_000,
    step: 0.001,
    group: "Data",
  },
  {
    key: "responseSizeKb",
    label: "Response size",
    unit: "kB/response",
    min: 0.001,
    max: 1_000_000,
    step: 0.001,
    group: "Data",
  },
  {
    key: "retentionDays",
    label: "Retention",
    unit: "days",
    min: 1,
    max: 36_500,
    group: "Data",
  },
  {
    key: "replicationFactor",
    label: "Data copies",
    unit: "copies",
    min: 1,
    max: 10,
    group: "Data",
  },
  {
    key: "meanLatencyMs",
    label: "Mean latency",
    unit: "ms",
    min: 0.1,
    max: 600_000,
    step: 0.1,
    group: "Reliability",
  },
  {
    key: "headroomPercentage",
    label: "Planning headroom",
    unit: "%",
    min: 0,
    max: 300,
    step: 1,
    group: "Reliability",
  },
];

const metricCards: Array<{
  key: keyof CapacityEstimateResult["metrics"];
  label: string;
  unit: string;
}> = [
  { key: "peakRequestsWithHeadroom", label: "Target peak", unit: "req/s" },
  { key: "replicatedStorageGigabytes", label: "Retained copies", unit: "GB" },
  {
    key: "peakResponseMegabitsPerSecond",
    label: "Peak response",
    unit: "Mb/s",
  },
  { key: "meanConcurrentRequests", label: "Mean in flight", unit: "requests" },
];

function format(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value < 10 ? 2 : 1,
  }).format(value);
}

export function CapacityCalculator({
  descriptor,
}: {
  descriptor: CapacityEstimatorDescriptor;
}) {
  const [input, setInput] = useState<CapacityEstimateInput>(
    descriptor.defaultInput,
  );
  const [result, setResult] = useState<CapacityEstimateResult | null>(null);
  const [prompt, setPrompt] = useState(descriptor.presets[0]?.question ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function choosePreset(index: number) {
    const preset = descriptor.presets[index];
    if (!preset) return;
    setInput(preset.input);
    setPrompt(preset.question);
    setResult(null);
    setError("");
  }

  async function calculate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setResult(await api.calculateCapacity(input));
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "The estimate could not be calculated.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="capacity-workbench">
      <form className="capacity-controls" onSubmit={calculate}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Assumptions</p>
            <h2>Shape the demand</h2>
          </div>
          <span className="live-badge">v{descriptor.schemaVersion}</span>
        </div>
        <div className="preset-row" aria-label="Capacity scenarios">
          {descriptor.presets.map((preset, index) => (
            <button
              type="button"
              key={preset.id}
              onClick={() => choosePreset(index)}
            >
              {preset.title}
            </button>
          ))}
        </div>
        <div className="prediction-callout">
          <span>Predict first</span>
          <p>{prompt}</p>
        </div>
        {(["Traffic", "Data", "Reliability"] as const).map((group) => (
          <fieldset className="capacity-fieldset" key={group}>
            <legend>{group}</legend>
            <div className="capacity-field-grid">
              {fields
                .filter((field) => field.group === group)
                .map((field) => (
                  <label key={field.key}>
                    <span>
                      {field.label}
                      <small>{field.unit}</small>
                    </span>
                    <input
                      type="number"
                      required
                      min={field.min}
                      max={field.max}
                      step={field.step ?? 1}
                      value={input[field.key]}
                      onChange={(event) =>
                        setInput({
                          ...input,
                          [field.key]: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                ))}
            </div>
          </fieldset>
        ))}
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
        <button
          className="button primary run-button"
          disabled={busy}
          type="submit"
        >
          {busy ? "Calculating…" : "Calculate estimate"}
          <span aria-hidden="true">→</span>
        </button>
        <p className="model-note">Java computes every result · decimal units</p>
      </form>

      <section className="capacity-results" aria-live="polite" aria-busy={busy}>
        {!result ? (
          <div className="capacity-empty">
            <div className="estimate-funnel" aria-hidden="true">
              <span>USAGE</span>
              <i>→</i>
              <span>RATE</span>
              <i>→</i>
              <span>RESOURCES</span>
            </div>
            <p className="eyebrow">Estimate with evidence</p>
            <h2>Make a prediction, then reveal the chain.</h2>
            <p>
              The result will show the answer, each formula, a sensitivity
              range, and what the model leaves out.
            </p>
          </div>
        ) : (
          <>
            <div className="result-heading">
              <div>
                <p className="eyebrow">Planning range</p>
                <h2>Your first capacity envelope</h2>
              </div>
              <span className="estimate-status">
                Estimate · not a benchmark
              </span>
            </div>
            <div className="capacity-metrics">
              {metricCards.map((card) => (
                <article key={card.key}>
                  <small>{card.label}</small>
                  <strong>{format(result.metrics[card.key])}</strong>
                  <span>{card.unit}</span>
                </article>
              ))}
            </div>
            <div className="demand-split">
              <div>
                <span>Average</span>
                <strong>
                  {format(result.metrics.averageRequestsPerSecond)} req/s
                </strong>
              </div>
              <i aria-hidden="true">→ × {format(input.peakFactor)}</i>
              <div>
                <span>Peak reads</span>
                <strong>
                  {format(result.metrics.peakReadsPerSecond)} req/s
                </strong>
              </div>
              <div>
                <span>Peak writes</span>
                <strong>
                  {format(result.metrics.peakWritesPerSecond)} req/s
                </strong>
              </div>
            </div>
            <section className="sensitivity-panel">
              <div className="section-label">
                <div>
                  <p className="eyebrow">Sensitivity</p>
                  <h3>One estimate needs a range</h3>
                </div>
                <p>Traffic at 80%, 100%, and 120% of the stated assumptions.</p>
              </div>
              {result.sensitivity.map((point) => (
                <div className="sensitivity-row" key={point.id}>
                  <strong>{point.label}</strong>
                  <div className="sensitivity-track">
                    <i
                      style={{
                        width: `${(point.trafficMultiplier / 1.2) * 100}%`,
                      }}
                    />
                  </div>
                  <span>{format(point.peakRequestsPerSecond)} req/s</span>
                </div>
              ))}
            </section>
            <details className="calculation-trail" open>
              <summary>
                Calculation trail <span>{result.steps.length} steps</span>
              </summary>
              <ol>
                {result.steps.map((step) => (
                  <li key={step.id}>
                    <div>
                      <strong>{step.label}</strong>
                      <code>{step.formula}</code>
                      <p>{step.meaning}</p>
                    </div>
                    <b>
                      {format(step.value)} <small>{step.unit}</small>
                    </b>
                  </li>
                ))}
              </ol>
            </details>
            <div className="estimate-notes">
              <section>
                <p className="eyebrow">Assumptions</p>
                <ul>
                  {result.assumptions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
              <section className="warning-list">
                <p className="eyebrow">Outside this model</p>
                <ul>
                  {result.warnings.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
