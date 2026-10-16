import type { RetryState } from "../../api/types";
import {
  callerLabels,
  requestPhaseLabels,
  retryTime,
  workLabels,
  retryFailureLabels,
  retryCauseLabels,
} from "./retryLabels";
export function RetryStateView({
  state,
  selectedRequestId,
  selectedAttemptId,
}: {
  state: RetryState;
  selectedRequestId?: string;
  selectedAttemptId?: string;
}) {
  return (
    <section className="retry-snapshot" aria-label="Selected retry snapshot">
      <section aria-label="Callers at this snapshot">
        <h4>What the callers are waiting for</h4>
        <div className="retry-caller-cards">
          {state.requests.map((request) => (
            <article
              key={request.id}
              className="retry-state-card"
              aria-label={`Caller ${request.id}`}
              data-selected={
                request.id === selectedRequestId ? "true" : undefined
              }
            >
              <h5>
                {request.id} · {requestPhaseLabels[request.phase]}
              </h5>
              <dl>
                <div>
                  <dt>Attempts sent</dt>
                  <dd>{request.attemptsSent}</dd>
                </div>
                <div>
                  <dt>Active attempt</dt>
                  <dd>{request.activeAttemptId ?? "None"}</dd>
                </div>
                <div>
                  <dt>Overall deadline</dt>
                  <dd>{retryTime(request.overallDeadlineAtMs)}</dd>
                </div>
                <div>
                  <dt>Scheduled retry</dt>
                  <dd>
                    {request.nextRetryAtMs === undefined
                      ? "None scheduled"
                      : retryTime(request.nextRetryAtMs)}
                  </dd>
                </div>
                <div>
                  <dt>Caller finished</dt>
                  <dd>{retryTime(request.finishedAtMs)}</dd>
                </div>
                <div>
                  <dt>Logical failure reason</dt>
                  <dd>
                    {request.failureReason
                      ? retryFailureLabels[request.failureReason]
                      : "None"}
                  </dd>
                </div>
                <div>
                  <dt>Last actual attempt failure</dt>
                  <dd>
                    {request.lastFailureCause
                      ? retryCauseLabels[request.lastFailureCause]
                      : "None"}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
      <section aria-label="Server queue and workers at this snapshot">
        <h4>What the server still owns</h4>
        <div className="retry-server">
          <section
            className="retry-state-card"
            aria-label="Retry server waiting queue"
          >
            <h5>FIFO waiting queue</h5>
            {state.queue.length ? (
              <ol>
                {state.queue.map((id) => (
                  <li key={id}>{id}</li>
                ))}
              </ol>
            ) : (
              <p>No queued work.</p>
            )}
            <p className="retry-muted">
              Queue order is returned by Java. A caller timeout does not remove
              accepted work.
            </p>
          </section>
          <section
            className="retry-state-card"
            aria-label="Retry server workers"
          >
            <h5>Workers</h5>
            <ul>
              {state.workers.map((worker) => (
                <li key={worker.id}>
                  <strong>{worker.id}</strong> · {worker.attemptId ?? "Idle"}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <p className="retry-budget">
          Shared retry tokens remaining:{" "}
          <strong>{state.retryBudgetRemaining}</strong>
        </p>
      </section>
      <section aria-label="Attempts at this snapshot">
        <h4>Separate caller state from server work</h4>
        <p className="retry-muted">
          An attempt can be timed out for its caller and still queued or running
          at the server. Admission pending is not a rejection. Completion is
          server work, not a persisted business effect.
        </p>
        {state.attempts.length ? (
          <div className="retry-attempt-cards">
            {state.attempts.map((attempt) => (
              <article
                className="retry-state-card"
                key={attempt.id}
                aria-label={`Retry attempt ${attempt.id}`}
                data-selected={
                  attempt.id === selectedAttemptId ? "true" : undefined
                }
              >
                <h5>
                  {attempt.id} · request {attempt.requestId} · attempt{" "}
                  {attempt.number}
                </h5>
                <div className="retry-state-pair">
                  <p>
                    <span>Caller</span>
                    <strong>{callerLabels[attempt.callerState]}</strong>
                  </p>
                  <p>
                    <span>Server work</span>
                    <strong>{workLabels[attempt.workState]}</strong>
                  </p>
                </div>
                <dl>
                  <div>
                    <dt>Sent</dt>
                    <dd>{retryTime(attempt.sentAtMs)}</dd>
                  </div>
                  <div>
                    <dt>Configured attempt deadline</dt>
                    <dd>{retryTime(attempt.timeoutAtMs)}</dd>
                  </div>
                  <div>
                    <dt>Work started</dt>
                    <dd>{retryTime(attempt.startedAtMs)}</dd>
                  </div>
                  <div>
                    <dt>Work completed</dt>
                    <dd>{retryTime(attempt.completedAtMs)}</dd>
                  </div>
                  <div>
                    <dt>Caller finished waiting</dt>
                    <dd>{retryTime(attempt.callerFinishedAtMs)}</dd>
                  </div>
                  <div>
                    <dt>Attempt failure</dt>
                    <dd>
                      {attempt.failureCause
                        ? retryCauseLabels[attempt.failureCause]
                        : "None"}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <p>No actual attempt has been sent.</p>
        )}
      </section>
    </section>
  );
}
