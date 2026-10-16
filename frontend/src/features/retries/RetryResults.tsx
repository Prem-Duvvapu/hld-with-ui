import type { RetryResult } from "../../api/types";
import { RetryPlayback } from "./RetryPlayback";
export function RetryResults({
  result,
  stale,
  pending,
}: {
  result: RetryResult;
  stale: boolean;
  pending: boolean;
}) {
  const m = result.metrics;
  return (
    <section
      className="retry-results"
      aria-label="Java retry simulation results"
    >
      {(stale || pending) && (
        <p className="retry-notice" role="status">
          {pending
            ? "Running a new workload. Previous submitted results remain visible until Java responds."
            : "Inputs changed. These results belong to the previous submitted workload. Run again to compare."}
        </p>
      )}
      <p className="retry-submitted">
        Submitted: {result.input.requests.length} original requests ·{" "}
        {result.input.workers} workers · {result.input.queueCapacity} waiting
        slots · attempt timeout {result.input.attemptTimeoutMs} ms · overall
        timeout {result.input.overallTimeoutMs} ms · at most{" "}
        {result.input.maxAttempts} attempts per request.
      </p>
      <RetryPlayback result={result} />
      <section
        className="retry-summary"
        aria-label="Whole retry experiment summary"
      >
        <p className="eyebrow">Whole returned experiment</p>
        <h3>Compare caller outcomes with server work</h3>
        <p>
          These Java metrics cover every returned event through {m.finalTimeMs}{" "}
          ms. They do not change with the selected snapshot. The run drains
          accepted server work even after callers stop waiting.
        </p>
        <dl className="retry-metrics">
          {[
            ["Original requests", m.originalRequests],
            ["Succeeded callers", m.succeededRequests],
            ["Failed callers", m.failedRequests],
            ["Attempts sent", m.attemptsSent],
            ["Retries sent", m.retriesSent],
            ["Rejected attempts", m.rejectedAttempts],
            ["Accepted server work", m.acceptedServerWork],
            ["Completed server work", m.completedServerWork],
            ["Late server completions", m.lateCompletions],
            ["Attempt timeouts", m.attemptTimeouts],
            ["Retry tokens used", m.retryBudgetUsed],
            ["Peak queued work", m.peakQueueDepth],
            ["Peak running work", m.peakRunningWork],
            ["Final virtual time (ms)", m.finalTimeMs],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="retry-ratios">
          <article>
            <h4>Attempts per original request</h4>
            <strong>{m.attemptAmplification}</strong>
            <p>
              {m.attemptsSent} attempts / {m.originalRequests} original
              requests. Includes rejected sends.
            </p>
          </article>
          <article>
            <h4>Completed server work per original request</h4>
            <strong>{m.executionAmplification}</strong>
            <p>
              {m.completedServerWork} completed units of server work /{" "}
              {m.originalRequests} original requests.
            </p>
          </article>
        </div>
        <p className="retry-boundary">
          A completed server attempt is a unit of modeled work. This does not
          prove duplicate orders, repeated database writes, idempotency,
          cancellation or durable business effects.
        </p>
        <p className="retry-muted">
          Replay algorithm: {result.randomAlgorithm} · seed {result.input.seed}{" "}
          · model {result.modelVersion}. Recorded jitter choices are
          reproducible within this model version; a different seed need not
          improve outcomes.
        </p>
      </section>
      <details className="retry-assumptions">
        <summary>Assumptions and limits of the retry model</summary>
        <ul>
          {result.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
