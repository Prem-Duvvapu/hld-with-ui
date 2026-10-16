import { api } from "../../api/client";
import type { GuidedCheckpoint, RetryDescriptor } from "../../api/types";
import { GuidedSimulation } from "../learning/GuidedSimulation";
import { RetryStateView } from "./RetryStateView";
import { retryEventLabels } from "./retryLabels";
import { resolveRetryCheckpoint } from "./checkpoints";
import "./Retry.css";

export function RetryGuided({
  checkpoints,
  descriptor,
  contentVersion,
}: {
  checkpoints: GuidedCheckpoint[];
  descriptor: RetryDescriptor;
  contentVersion: string;
}) {
  return (
    <GuidedSimulation
      checkpoints={checkpoints.filter(
        (checkpoint) => checkpoint.simulationId === "timeouts-retries",
      )}
      presets={descriptor.presets}
      topicId="timeouts-retries"
      topicTitle="Timeouts & Retries"
      contentVersion={contentVersion}
      modelVersion={descriptor.modelVersion}
      execute={api.runRetry}
      resolveTarget={(result, target) =>
        resolveRetryCheckpoint(result.events, target)
      }
      renderEvidence={(run, position) => {
        const event = run.result.events[position]!;
        return (
          <section
            className="retry-results"
            aria-label="Java retry evidence at this checkpoint"
          >
            <div className="retry-results-heading">
              <h3>Java evidence at this checkpoint</h3>
              <span className="retry-version">
                Model {run.result.modelVersion} · Virtual time
              </span>
            </div>
            <p className="retry-muted">
              Selected post-event evidence only. Later outcomes and whole-run
              metrics are outside this snapshot. Several causal steps can share
              one timestamp.
            </p>
            <section
              className="retry-event"
              aria-label="Selected retry checkpoint event"
            >
              <p className="eyebrow">
                Event {event.sequence} · {event.timeMs} ms
              </p>
              <h4>{retryEventLabels[event.kind]}</h4>
              <p>{event.explanation}</p>
              <p className="retry-muted">
                Request {event.requestId}
                {event.attemptId
                  ? ` · actual attempt ${event.attemptId}`
                  : " · request-level decision"}
              </p>
              {event.delayMs !== undefined && (
                <p>
                  Java chose {event.delayMs} ms of delay.{" "}
                  {event.retryAtMs !== undefined
                    ? `A retry is scheduled at ${event.retryAtMs} ms.`
                    : `The proposed ${event.proposedRetryAtMs} ms retry is blocked; it is not scheduled.`}
                </p>
              )}
            </section>
            <RetryStateView
              state={event.postState}
              selectedRequestId={event.requestId}
              selectedAttemptId={event.attemptId}
            />
            <p className="retry-boundary">
              This model separates caller waiting from server work. It does not
              establish cancellation, safe repeated business effects,
              idempotency or durability.
            </p>
          </section>
        );
      }}
    />
  );
}
