import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiClientError } from "../api/client";
import type { CatalogEntry } from "../api/types";
import { ErrorState, LoadingState } from "../components/AsyncState";

export function HomePage() {
  const [topics, setTopics] = useState<CatalogEntry[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const load = useCallback(() => {
    setError("");
    setTopics(null);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    api
      .topics()
      .then((data) => active && setTopics(data))
      .catch(
        (cause: unknown) =>
          active &&
          setError(
            cause instanceof ApiClientError
              ? cause.message
              : "Something went wrong.",
          ),
      );
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <>
      <section className="hero page-width">
        <div className="hero-copy">
          <p className="eyebrow">Visual system design lab</p>
          <h1>
            Build intuition you can <em>see.</em>
          </h1>
          <p className="hero-lead">
            Learn high level design by changing inputs, watching requests move,
            and explaining the tradeoffs in your own words.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#modules">
              Start learning <span aria-hidden="true">→</span>
            </a>
            <span className="quiet-note">No setup inside the lesson</span>
          </div>
        </div>
        <div
          className="hero-system"
          aria-label="A request travels from client through a load balancer to service nodes"
        >
          <div className="system-node client-node">
            <span>01</span>
            <strong>Client</strong>
            <small>sends request</small>
          </div>
          <div className="flow-line">
            <i />
            <i />
            <i />
          </div>
          <div className="system-node balance-node">
            <span>02</span>
            <strong>Balancer</strong>
            <small>chooses a node</small>
          </div>
          <div className="split-lines">
            <i />
            <i />
          </div>
          <div className="node-stack">
            <div className="system-node">
              <strong>Node A</strong>
              <small>1 active</small>
            </div>
            <div className="system-node">
              <strong>Node B</strong>
              <small>2 queued</small>
            </div>
          </div>
        </div>
      </section>

      <section className="principles-strip" aria-label="Learning approach">
        <div className="page-width">
          <span>
            <b>01</b> Understand
          </span>
          <span>
            <b>02</b> Experiment
          </span>
          <span>
            <b>03</b> Explain
          </span>
        </div>
      </section>

      <section className="catalog page-width" id="modules">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Learning path</p>
            <h2>Foundation modules</h2>
          </div>
          <p>
            Each module connects a clear mental model to a working Java
            simulation.
          </p>
        </div>
        {error ? (
          <ErrorState message={error} retry={load} />
        ) : topics === null ? (
          <LoadingState label="Loading modules" />
        ) : (
          <div className="module-grid">
            {topics.map((topic, index) => (
              <Link
                className="module-card"
                key={topic.id}
                to={`/topics/${topic.id}`}
              >
                <div className="module-meta">
                  <span className="module-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="status-dot">Interactive</span>
                </div>
                <div className="module-glyph" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <i />
                </div>
                <p className="overline">
                  {topic.category} · {topic.level}
                </p>
                <h3>{topic.title}</h3>
                <p>{topic.summary}</p>
                <ul className="capability-list" aria-label="Module activities">
                  {topic.capabilities.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <span className="card-link">
                  Open module <b aria-hidden="true">↗</b>
                </span>
              </Link>
            ))}
            <article
              className="module-card coming-soon"
              aria-label="More modules are being designed"
            >
              <div className="module-meta">
                <span className="module-number">NEXT</span>
              </div>
              <div className="plus-glyph">+</div>
              <h3>More systems are coming</h3>
              <p>
                Caching, data partitioning, messaging, and complete case studies
                will build on this foundation.
              </p>
            </article>
          </div>
        )}
      </section>
    </>
  );
}
