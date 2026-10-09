import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiClientError } from "../../api/client";
import type { CatalogEntry } from "../../api/types";
import { ErrorState, LoadingState } from "../../components/AsyncState";
import "./WorkshopCatalog.css";

export function WorkshopCatalog() {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .caseStudies()
      .then((data) => active && setEntries(data))
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof ApiClientError
              ? cause.message
              : "Workshops could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  if (entries?.length === 0) return null;

  return (
    <section
      className="catalog workshop-catalog page-width"
      aria-labelledby="workshop-catalog-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Apply what you learned</p>
          <h2 id="workshop-catalog-title">Design workshops</h2>
        </div>
        <p>
          Bring estimates, request flows, and failure tradeoffs into one design.
        </p>
      </div>
      {error ? (
        <ErrorState
          message={error}
          retry={() => {
            setError("");
            setEntries(null);
            setAttempt((value) => value + 1);
          }}
        />
      ) : entries === null ? (
        <LoadingState label="Loading design workshops" />
      ) : (
        <div className="module-grid">
          {entries.map((entry, index) => (
            <Link
              className="module-card"
              key={entry.id}
              to={`/case-studies/${encodeURIComponent(entry.id)}`}
            >
              <div className="module-meta">
                <span className="module-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="status-dot">Guided design</span>
              </div>
              <p className="overline">
                {entry.category} · {entry.level}
              </p>
              <h3>{entry.title}</h3>
              <p>{entry.summary}</p>
              <span className="card-link">
                Open workshop <b aria-hidden="true">↗</b>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
