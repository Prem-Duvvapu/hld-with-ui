import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiClientError } from "../api/client";
import type { SearchResponse } from "../api/types";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { usePageTitle } from "../hooks/usePageTitle";
import "./SearchPage.css";

export function SearchPage() {
  usePageTitle("Search · HLD with UI");
  const [params, setParams] = useSearchParams();
  const invalidLink = Array.from(params.keys()).some(
    (key) =>
      !["q", "level", "capability"].includes(key) ||
      params.getAll(key).length !== 1,
  );
  const query = params.get("q") ?? "";
  const level = params.get("level") ?? "";
  const capability = params.get("capability") ?? "";
  return (
    <section className="search-page page-width" aria-labelledby="search-title">
      <Link className="search-back" to="/">
        ← All modules
      </Link>
      <p className="eyebrow">Find an explanation</p>
      <h1 id="search-title">What do you want to understand?</h1>
      <p className="search-lead">
        Search published concepts and design decisions. Try stale reads, token
        bucket, or queue time.
      </p>
      {invalidLink ? (
        <div className="state-card error-state" role="alert">
          <div>
            <strong>
              This search link has unsupported or repeated filters.
            </strong>
            <p>Clear the link and enter one set of search criteria.</p>
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={() => setParams(new URLSearchParams())}
          >
            Clear search link
          </button>
        </div>
      ) : (
        <SearchExperience
          query={query}
          level={level}
          capability={capability}
          submit={(q, selectedLevel, selectedCapability) => {
            const next = new URLSearchParams();
            if (q.trim()) next.set("q", q.trim());
            if (selectedLevel) next.set("level", selectedLevel);
            if (selectedCapability) next.set("capability", selectedCapability);
            setParams(next);
          }}
        />
      )}
    </section>
  );
}

function SearchExperience({
  query,
  level,
  capability,
  submit,
}: {
  query: string;
  level: string;
  capability: string;
  submit: (query: string, level: string, capability: string) => void;
}) {
  const criteria = JSON.stringify([query, level, capability]);
  const [previousCriteria, setPreviousCriteria] = useState(criteria);
  const [draft, setDraft] = useState(query);
  const [draftLevel, setDraftLevel] = useState(level);
  const [draftCapability, setDraftCapability] = useState(capability);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const hasQuery = Boolean(query.trim());
  // Reset route-specific state before committing the next result view, while
  // preserving the form DOM and keyboard focus across a submitted search.
  if (previousCriteria !== criteria) {
    setPreviousCriteria(criteria);
    setDraft(query);
    setDraftLevel(level);
    setDraftCapability(capability);
    setData(null);
    setError("");
  }

  useEffect(() => {
    if (!query.trim()) return;
    let active = true;
    api
      .search(query, level, capability)
      .then((response) => active && setData(response))
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof ApiClientError
              ? cause.message
              : "Search could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [query, level, capability, attempt]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(draft, draftLevel, draftCapability);
  }

  const dirty =
    draft.trim() !== query ||
    draftLevel !== level ||
    draftCapability !== capability;
  return (
    <>
      <form className="search-form" role="search" onSubmit={search}>
        <div className="search-query">
          <label htmlFor="search-query">Search concepts</label>
          <div className="search-input-row">
            <input
              id="search-query"
              type="search"
              value={draft}
              minLength={2}
              maxLength={100}
              aria-describedby="search-help"
              placeholder="e.g. stale reads"
              onChange={(event) => setDraft(event.target.value)}
            />
            <button className="button primary" type="submit">
              Search
            </button>
          </div>
          <p id="search-help">
            Use 2–100 characters. All search words must occur in the lesson or
            decision.
          </p>
        </div>
        <div className="search-filters">
          <label>
            Level
            <select
              value={draftLevel}
              onChange={(event) => setDraftLevel(event.target.value)}
            >
              <option value="">Any level</option>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>
          </label>
          <label>
            Activity
            <select
              value={draftCapability}
              onChange={(event) => setDraftCapability(event.target.value)}
            >
              <option value="">Any activity</option>
              <option value="study">Study</option>
              <option value="simulation">Simulation</option>
              <option value="estimator">Estimation</option>
              <option value="guided">Guided experiment</option>
              <option value="practice">Practice</option>
              <option value="case-study">Design workshop</option>
            </select>
          </label>
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              setDraft("");
              setDraftLevel("");
              setDraftCapability("");
              submit("", "", "");
            }}
          >
            Clear search and filters
          </button>
        </div>
      </form>
      {dirty && hasQuery && (
        <p className="search-notice" role="note">
          Select Search to apply your changes. Results still belong to “{query}
          ”.
        </p>
      )}
      <div className="search-results" aria-live="polite" aria-atomic="false">
        {!hasQuery ? (
          <div className="state-card">
            <p>
              Start with a concept you want to explain. Draft and planned
              modules stay outside search.
            </p>
          </div>
        ) : error ? (
          <ErrorState
            message={error}
            retry={() => {
              setError("");
              setData(null);
              setAttempt((value) => value + 1);
            }}
          />
        ) : data === null ? (
          <LoadingState label="Searching published content" />
        ) : (
          <>
            <h2>Results for “{data.query}”</h2>
            <p role="status" className="search-count">
              {data.totalMatches === 0
                ? "No matches"
                : `${data.results.length} of ${data.totalMatches} matching ${data.totalMatches === 1 ? "page" : "pages"}`}
            </p>
            {data.totalMatches === 0 ? (
              <div className="state-card">
                <p>
                  Try fewer words or a broader activity or level. Only published
                  content is included.
                </p>
              </div>
            ) : (
              <ol className="search-result-list">
                {data.results.map((hit) => (
                  <li key={hit.path}>
                    <Link className="search-result" to={hit.path}>
                      <p className="overline">
                        {hit.entry.kind === "case-study"
                          ? "Design decision"
                          : "Concept"}{" "}
                        · {hit.entry.level}
                      </p>
                      <h3>
                        {hit.entry.title}
                        {hit.stageTitle ? ` · ${hit.stageTitle}` : ""}
                      </h3>
                      <p className="search-excerpt">{hit.excerpt}</p>
                      <span className="card-link">
                        Open{" "}
                        {hit.entry.kind === "case-study"
                          ? "decision"
                          : "lesson"}{" "}
                        <b aria-hidden="true">↗</b>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </>
  );
}
