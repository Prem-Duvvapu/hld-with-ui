import type { KeyboardEvent, ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { CatalogEntry } from "../api/types";
import { usePageTitle } from "../hooks/usePageTitle";

export const requestFlowViews = [
  "playground",
  "study",
  "architecture",
  "sequence",
  "practice",
] as const;
export type ModuleView = (typeof requestFlowViews)[number];

export interface ModuleTab<T extends string> {
  id: T;
  label: string;
}

export const requestFlowTabs: ReadonlyArray<ModuleTab<ModuleView>> = [
  { id: "playground", label: "Playground" },
  { id: "study", label: "Study" },
  { id: "architecture", label: "Architecture" },
  { id: "sequence", label: "Request sequence" },
  { id: "practice", label: "Practice" },
];

export function ModuleShell<T extends string>({
  topic,
  tabs,
  defaultView,
  children,
}: {
  topic: CatalogEntry;
  tabs: ReadonlyArray<ModuleTab<T>>;
  defaultView: T;
  children: (view: T) => ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("view");
  const active = tabs.some((tab) => tab.id === requested)
    ? (requested as T)
    : defaultView;
  const activeLabel = tabs.find((tab) => tab.id === active)?.label;
  const panelId = `module-panel-${topic.id}`;

  usePageTitle(`${activeLabel ?? "Module"} · ${topic.title} | HLD with UI`);

  function select(view: T) {
    const next = new URLSearchParams(params);
    if (view === defaultView) next.delete("view");
    else next.set("view", view);
    setParams(next, { replace: true });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const focusedId = document.activeElement?.id;
    const index = tabs.findIndex(
      (tab) => `tab-${topic.id}-${tab.id}` === focusedId,
    );
    const target =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
            tabs.length;
    const targetId = tabs[target]!.id;
    document.getElementById(`tab-${topic.id}-${targetId}`)?.focus();
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
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              id={`tab-${topic.id}-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={active === tab.id}
              aria-controls={panelId}
              tabIndex={active === tab.id ? 0 : -1}
              onClick={() => select(tab.id)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <section
        id={panelId}
        role="tabpanel"
        aria-labelledby={`tab-${topic.id}-${active}`}
        tabIndex={0}
        className="module-content page-width"
      >
        {children(active)}
      </section>
    </div>
  );
}
