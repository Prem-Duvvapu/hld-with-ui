import { api } from "../../api/client";
import type { DataAccessDescriptor, GuidedCheckpoint } from "../../api/types";
import { GuidedSimulation } from "../learning/GuidedSimulation";
import { DataAccessEvidence } from "./DataAccessEvidence";
import { indexLabels } from "./DataAccessControls";
import { resolveDataAccessCheckpoint } from "./checkpoints";
import "./DataAccess.css";
export function DataAccessGuided({
  checkpoints,
  descriptor,
  contentVersion,
}: {
  checkpoints: GuidedCheckpoint[];
  descriptor: DataAccessDescriptor;
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
      execute={api.runDataAccess}
      resolveTarget={(result, target) =>
        resolveDataAccessCheckpoint(result.outcomes, target)
      }
      renderEvidence={(run, position) => (
        <section
          className="access-results"
          aria-label="Java operation at this checkpoint"
        >
          <div className="access-results-heading">
            <div>
              <p className="eyebrow">Selected Java outcome</p>
              <h3>Java evidence at this checkpoint</h3>
            </div>
            <span className="access-version">
              Model {run.result.modelVersion} · Sequential operations
            </span>
          </div>
          <p className="access-muted">
            Submitted design: {indexLabels[run.input.indexOrder]} · business-key
            uniqueness {run.input.enforceBusinessKey ? "required" : "disabled"}.
            No timing or concurrent transaction is modeled.
          </p>
          <DataAccessEvidence result={run.result} position={position} />
        </section>
      )}
    />
  );
}
