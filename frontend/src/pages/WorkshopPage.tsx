import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiClientError } from "../api/client";
import type { CaseStudyDetail } from "../api/types";
import { LoadingState, ErrorState } from "../components/AsyncState";
import { ModuleShell } from "../components/ModuleShell";
import { DesignWorkshop } from "../features/workshop/DesignWorkshop";
import { NotFoundPage } from "./NotFoundPage";

export function WorkshopPage() {
  const { id = "" } = useParams();
  return <WorkshopLoader key={id} id={id} />;
}

function WorkshopLoader({ id }: { id: string }) {
  const [data, setData] = useState<CaseStudyDetail | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setData(null);
    setError("");
    setMissing(false);
    setAttempt((previous) => previous + 1);
  }, []);
  useEffect(() => {
    let active = true;
    api
      .caseStudy(id)
      .then((response) => {
        if (!active) return;
        if (
          response.entry.id !== id ||
          response.entry.kind !== "case-study" ||
          !response.entry.capabilities.includes("case-study") ||
          response.workshop.id !== id ||
          response.workshop.schemaVersion !== 1 ||
          response.entry.contentVersion !== response.workshop.contentVersion ||
          !response.workshop.stages.length
        ) {
          setError(
            "This workshop is incompatible with this app. No draft has been changed.",
          );
        } else setData(response);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiClientError && cause.status === 404)
          setMissing(true);
        else
          setError(
            cause instanceof ApiClientError
              ? cause.message
              : "This workshop could not be loaded. Try again.",
          );
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  if (missing) return <NotFoundPage />;
  if (error)
    return (
      <div className="page-width standalone-state">
        <ErrorState message={error} retry={retry} />
      </div>
    );
  if (!data)
    return (
      <div className="page-width standalone-state">
        <LoadingState />
      </div>
    );
  return (
    <ModuleShell
      topic={data.entry}
      tabs={[{ id: "workshop", label: "Design workshop" }]}
      defaultView="workshop"
      panels={{
        workshop: (
          <DesignWorkshop
            workshop={data.workshop}
            title={data.entry.title}
            draft={data.entry.status !== "published"}
          />
        ),
      }}
    />
  );
}
