import type { IdempotencyResult } from "../../api/types";
import { IdempotencyPlayback } from "./IdempotencyPlayback";
import { modeLabels } from "./idempotencyForm";
export function IdempotencyResults({
  result,
  stale,
  pending,
}: {
  result: IdempotencyResult;
  stale: boolean;
  pending: boolean;
}) {
  const m = result.metrics;
  return (
    <section
      className="idem-results"
      aria-label="Java idempotency simulation results"
    >
      {(stale || pending) && (
        <p className="idem-notice" role="status">
          {pending
            ? "Running new calls. Previous submitted results remain visible until Java responds."
            : "Inputs changed. These results belong to the previous submitted calls. Run again to compare."}
        </p>
      )}
      <p className="idem-submitted">
        Submitted: {modeLabels[result.input.mode]} · {result.input.calls.length}{" "}
        calls · {result.input.schedule.length} authored steps · result retention{" "}
        {result.input.retentionMs} ms.
      </p>
      <details className="idem-submitted-input">
        <summary>Inspect the exact submitted calls and schedule</summary>
        <pre>{JSON.stringify(result.input, null, 2)}</pre>
      </details>
      <IdempotencyPlayback result={result} />
      <section
        className="idem-summary"
        aria-label="Whole idempotency experiment summary"
      >
        <p className="eyebrow">3 · Explain the whole experiment</p>
        <h3>Did repeated calls create repeated effects?</h3>
        <p>
          These Java metrics cover all {m.calls} calls through the last authored
          step at {m.finalTimeMs} ms. They describe the entire run and stay
          fixed while you inspect an earlier snapshot.
        </p>
        <dl className="idem-metrics">
          {[
            ["Calls", m.calls],
            ["Audited logical operations", m.logicalOperations],
            ["Published effects", m.publishedEffects],
            ["Published units", m.publishedUnits],
            [
              "Operations with repeated effects",
              m.operationsWithRepeatedEffects,
            ],
            ["Extra effects", m.extraEffects],
            ["Active retained keys", m.activeKeyRecords],
            ["Expired historical keys", m.expiredKeyRecords],
            ["Calls resolved by replay", m.replayedCalls],
            ["Payload conflicts", m.payloadConflicts],
            ["Result-save conflicts", m.resultSaveConflicts],
            ["Responses received", m.responsesReceived],
            ["Responses lost", m.responsesLost],
            ["Handler crashes", m.crashedCalls],
            ["Crashed calls with their own effect", m.crashedCallsWithEffects],
            ["Receipts received", m.receiptsReceived],
            ["Last authored time (ms)", m.finalTimeMs],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="idem-boundary">
          Audit grouping uses (tenant, operation ID). Extra effects count
          additional effects within each such group. Changing a key or retrying
          after expiry may intentionally add another effect; this count alone is
          not a universal correctness verdict.
        </p>
        <p>
          A received error counts as a response, but not as a receipt. Replay
          and conflict counts describe server resolutions, even if a later crash
          prevents the caller from receiving them.
        </p>
        <p className="idem-muted">
          Explain to a teammate: which step made work public, which record a
          retry used, and what the caller actually received. Then name one
          change to the key, payload or timing that changes the conclusion.
        </p>
      </section>
      <details className="idem-assumptions">
        <summary>Assumptions and limits of the idempotency model</summary>
        <ul>
          {result.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
