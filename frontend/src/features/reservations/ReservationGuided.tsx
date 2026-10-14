import { api } from "../../api/client";
import type { GuidedCheckpoint, ReservationDescriptor } from "../../api/types";
import { GuidedSimulation } from "../learning/GuidedSimulation";
import { ReservationEvidence } from "./ReservationEvidence";
import { resolveReservationCheckpoint } from "./checkpoints";
import "./Reservation.css";
export function ReservationGuided({
  checkpoints,
  descriptor,
  contentVersion,
}: {
  checkpoints: GuidedCheckpoint[];
  descriptor: ReservationDescriptor;
  contentVersion: string;
}) {
  return (
    <GuidedSimulation
      checkpoints={checkpoints}
      presets={descriptor.presets}
      topicId={descriptor.id}
      topicTitle={descriptor.title}
      contentVersion={contentVersion}
      modelVersion={descriptor.modelVersion}
      execute={api.runReservation}
      resolveTarget={(result, target) =>
        resolveReservationCheckpoint(result.outcomes, target)
      }
      renderEvidence={(run, position) => {
        const outcome = run.result.outcomes[position]!;
        return (
          <section
            className="reservation-results"
            aria-label="Java reservation at this checkpoint"
          >
            <div className="reservation-results-heading">
              <h3>Java evidence at this checkpoint</h3>
              <span className="reservation-version">
                Model {run.result.modelVersion} · Logical steps
              </span>
            </div>
            <p className="reservation-muted">
              Selected post-step evidence from the submitted{" "}
              {run.input.strategy === "STALE_READ_WRITE"
                ? "stale-read"
                : "atomic current-stock"}{" "}
              schedule. Later outcomes and whole-run summaries are outside this
              snapshot.
            </p>
            <ReservationEvidence
              input={run.input}
              state={outcome.postState}
              outcome={outcome}
            />
          </section>
        );
      }}
    />
  );
}
