import {
  createContext,
  useContext,
  useEffect,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { CatalogEntry } from "../api/types";
import { usePageTitle } from "../hooks/usePageTitle";
import { BookmarkButton } from "../features/learning/BookmarkButton";

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

const PanelActiveContext = createContext(true);
const ModuleActivityContext = createContext<{
  question: string | null;
  checkpoint: string | null;
  selectCheckpoint: ((id: string) => void) | null;
}>({ question: null, checkpoint: null, selectCheckpoint: null });

// Selectors name authored activities only; they never restore or run a model.
export function useModuleActivity() {
  return useContext(ModuleActivityContext);
}

/**
 * Whether the module panel containing the caller is the selected tab.
 * Panels stay mounted after their first visit so learner state survives tab
 * changes; anything that runs on its own, such as playback, must pause while
 * this is false. Outside a ModuleShell it is always true.
 */
export function usePanelActive() {
  return useContext(PanelActiveContext);
}

export function ModuleShell<T extends string>({
  topic,
  tabs,
  defaultView,
  panels,
}: {
  topic: CatalogEntry;
  tabs: ReadonlyArray<ModuleTab<T>>;
  defaultView: T;
  panels: Record<T, ReactNode>;
}) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("view");
  const supported = tabs.some((tab) => tab.id === requested);
  const active = supported ? (requested as T) : defaultView;
  const activeLabel = tabs.find((tab) => tab.id === active)?.label;
  const panelId = (view: T) => `module-panel-${topic.id}-${view}`;

  // Mount a panel on its first visit and keep it mounted afterwards.
  const [visited, setVisited] = useState<ReadonlySet<T>>(
    () => new Set([active]),
  );
  if (!visited.has(active)) setVisited(new Set(visited).add(active));

  usePageTitle(`${activeLabel ?? "Module"} · ${topic.title} | HLD with UI`);

  // An unsupported ?view= falls back to the default; drop it from the URL
  // without adding a history entry.
  useEffect(() => {
    if (requested === null || supported) return;
    const next = new URLSearchParams(params);
    next.delete("view");
    setParams(next, { replace: true });
  }, [requested, supported, params, setParams]);

  // Tab changes are history entries, so Back and Forward move between views.
  function select(view: T) {
    if (view === active) return;
    const next = new URLSearchParams(params);
    if (view === defaultView) next.delete("view");
    else next.set("view", view);
    setParams(next);
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
            CONTENT <strong>v{topic.contentVersion}</strong>
          </div>
        </div>
        <BookmarkButton entry={topic} />
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
              aria-controls={panelId(tab.id)}
              tabIndex={active === tab.id ? 0 : -1}
              onClick={() => select(tab.id)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      {tabs.map((tab) => (
        <section
          key={tab.id}
          id={panelId(tab.id)}
          role="tabpanel"
          aria-labelledby={`tab-${topic.id}-${tab.id}`}
          tabIndex={0}
          hidden={tab.id !== active}
          className="module-content page-width"
        >
          {visited.has(tab.id) && (
            <PanelActiveContext.Provider value={tab.id === active}>
              <ModuleActivityContext.Provider
                value={{
                  question: params.get("question"),
                  checkpoint: params.get("checkpoint"),
                  selectCheckpoint: (id) => {
                    const next = new URLSearchParams(params);
                    next.set("checkpoint", id);
                    setParams(next);
                  },
                }}
              >
                {panels[tab.id]}
              </ModuleActivityContext.Provider>
            </PanelActiveContext.Provider>
          )}
        </section>
      ))}
    </div>
  );
}
