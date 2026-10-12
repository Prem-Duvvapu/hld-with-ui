import type { QueueCapacityInput, QueueCapacityResult } from "../../api/types";
import { QueuePlayback } from "./QueuePlayback";
const limitLabels: Record<
  NonNullable<QueueCapacityResult["truncationReason"]>,
  string
> = {
  virtual_time_limit: "Virtual time limit reached",
  event_limit: "Event limit reached",
  trace_size_limit: "Trace size limit reached",
  wall_time_limit: "Elapsed run time limit reached",
};
const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});
export function queueNumber(value: number | null | undefined) {
  return value == null ? "Unavailable" : numberFormat.format(value);
}
function Metric({
  label,
  value,
  unit = "jobs",
}: {
  label: string;
  value: number | null | undefined;
  unit?: string;
}) {
  return (
    <div className="queue-metric">
      <span>{label}</span>
      <strong>{queueNumber(value)}</strong>
      <small>{value == null ? "No observed sample" : unit}</small>
    </div>
  );
}
export function QueueResults({
  result,
  input,
  stale,
}: {
  result: QueueCapacityResult;
  input: QueueCapacityInput;
  stale: boolean;
}) {
  const m = result.metrics;
  return (
    <div className="queue-results">
      {stale && (
        <p className="queue-notice" role="status">
          Inputs changed. These results belong to the previous workload. Run
          again to compare your changes.
        </p>
      )}
      {result.status === "limited" && (
        <p className="queue-notice" role="status">
          Partial result:{" "}
          {result.truncationReason
            ? limitLabels[result.truncationReason]
            : "Simulation limit reached"}
          . The admitted trace stops at {result.lastVirtualTimeMs} ms. Queued,
          running and not-arrived jobs are unfinished, not successful samples.
        </p>
      )}
      <QueuePlayback result={result} input={input} />
      <section aria-label="Queue run metrics" className="queue-results-section">
        <p className="eyebrow">
          {result.status === "limited"
            ? "Observed prefix"
            : "Complete finite run"}
        </p>
        <h3>
          {result.status === "limited"
            ? "Partial run metrics"
            : "Final run metrics"}
        </h3>
        <p className="queue-muted">
          Observation: {m.observationStartMs}–{m.observationEndMs} ms.
          Successful wait and latency use {m.successfulSamples} completed job
          {m.successfulSamples === 1 ? "" : "s"}; p95 uses nearest rank. Metrics
          describe the entire returned run, not the playback cursor.
        </p>
        <div className="queue-metrics">
          <Metric label="Completed" value={m.completed} />
          <Metric label="Rejected" value={m.rejected} />
          <Metric label="Peak waiting" value={m.peakWaiting} />
          <Metric
            label="Mean successful wait"
            value={m.meanSuccessfulWaitMs}
            unit="ms"
          />
          <Metric
            label="Mean successful latency"
            value={m.meanSuccessfulLatencyMs}
            unit="ms"
          />
          <Metric
            label="p95 successful wait"
            value={m.p95SuccessfulWaitMs}
            unit="ms"
          />
          <Metric
            label="p95 successful latency"
            value={m.p95SuccessfulLatencyMs}
            unit="ms"
          />
          <Metric
            label="Completed throughput"
            value={m.completedThroughputPerSecond}
            unit="jobs / second"
          />
        </div>
        <p className="queue-muted">
          {m.totalJobs} total jobs · {m.queued} queued · {m.running} running ·{" "}
          {m.notArrived} not arrived at the observation boundary. This
          finite-batch throughput is not a sustained capacity benchmark.
        </p>
      </section>
      <section className="queue-results-section">
        <h3>Job outcomes at the observation boundary</h3>
        <p className="queue-muted">
          A rejected job has an observed rejection time, but no successful wait
          or latency. Unfinished jobs do not have a completion time.
        </p>
        <div
          className="queue-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Scrollable queue job outcomes"
        >
          <table aria-label="Queue job outcomes">
            <thead>
              <tr>
                <th scope="col">Job</th>
                <th scope="col">Status</th>
                <th scope="col">Worker</th>
                <th scope="col">Arrival (ms)</th>
                <th scope="col">Start (ms)</th>
                <th scope="col">Terminal (ms)</th>
                <th scope="col">Wait (ms)</th>
                <th scope="col">Latency (ms)</th>
              </tr>
            </thead>
            <tbody>
              {result.outcomes.map((job) => (
                <tr key={job.jobId}>
                  <th scope="row">{job.jobId}</th>
                  <td>{job.status}</td>
                  <td>{job.workerId ?? "Unavailable"}</td>
                  <td>{job.arrivalTimeMs}</td>
                  <td>{queueNumber(job.startTimeMs)}</td>
                  <td>{queueNumber(job.terminalTimeMs)}</td>
                  <td>{queueNumber(job.waitTimeMs)}</td>
                  <td>{queueNumber(job.latencyMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <details className="queue-results-section">
        <summary>Assumptions and limits of this model</summary>
        <ul>
          {result.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
