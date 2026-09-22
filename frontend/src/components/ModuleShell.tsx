import type { KeyboardEvent, ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { CatalogEntry } from "../api/types";

export const moduleViews = [
  "playground",
  "study",
  "architecture",
  "sequence",
  "practice",
] as const;
export type ModuleView = (typeof moduleViews)[number];
const labels: Record<ModuleView, string> = {
  playground: "Playground",
  study: "Study",
  architecture: "Architecture",
  sequence: "Request sequence",
  practice: "Practice",
};

export function ModuleShell({
  topic,
  children,
}: {
  topic: CatalogEntry;
  children: (view: ModuleView) => ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("view");
  const active: ModuleView = moduleViews.includes(requested as ModuleView)
    ? (requested as ModuleView)
    : "playground";

  function select(view: ModuleView) {
    const next = new URLSearchParams(params);
    if (view === "playground") next.delete("view");
    else next.set("view", view);
    setParams(next, { replace: true });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = moduleViews.indexOf(active);
    const target =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? moduleViews.length - 1
          : (index +
              (event.key === "ArrowRight" ? 1 : -1) +
              moduleViews.length) %
            moduleViews.length;
    select(moduleViews[target]!);
    document.getElementById(`tab-${moduleViews[target]!}`)?.focus();
  }

  return (
    <div className="module-page">
      <div className="module-header page-width">
        <Link className="back-link" to="/" aria-label="Back to all modules">
          ← All modules
        </Link>
        <div className="module-title-row">
          <div>
            <p className="eyebrow">
              {topic.category} · {topic.level}
            </p>
            <h1>{topic.title}</h1>
            <p>{topic.summary}</p>
          </div>
          <div className="version-pill">
            MODEL <strong>v{topic.contentVersion}</strong>
          </div>
        </div>
        <div className="learning-outcomes">
          <strong>After this module, you can</strong>
          <ul>
            {topic.outcomes.map((outcome) => (
              <li key={outcome}>{outcome}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="tab-rail">
        <div
          className="page-width module-tabs"
          role="tablist"
          aria-label="Module views"
          onKeyDown={onKeyDown}
        >
          {moduleViews.map((view, index) => (
            <button
              key={view}
              id={`tab-${view}`}
              role="tab"
              type="button"
              aria-selected={active === view}
              aria-controls="module-panel"
              tabIndex={active === view ? 0 : -1}
              onClick={() => select(view)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {labels[view]}
            </button>
          ))}
        </div>
      </div>
      <section
        id="module-panel"
        role="tabpanel"
        aria-labelledby={`tab-${active}`}
        className="module-content page-width"
      >
        {children(active)}
      </section>
    </div>
  );
}
