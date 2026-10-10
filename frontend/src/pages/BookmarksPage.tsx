import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { CatalogEntry } from "../api/types";
import { usePageTitle } from "../hooks/usePageTitle";
import {
  getBookmarkStore,
  type Bookmark,
} from "../features/learning/bookmarkStorage";
import { BookmarkTools } from "../features/learning/BookmarkTools";
import "../features/learning/Bookmarks.css";

type Collection = { entries: CatalogEntry[] | null; error: string };
const pending = (): Record<Bookmark["kind"], Collection> => ({
  topic: { entries: null, error: "" },
  "case-study": { entries: null, error: "" },
});

export function BookmarksPage() {
  usePageTitle("Saved modules · HLD with UI");
  const store = getBookmarkStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [catalog, setCatalog] = useState(pending);
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true;
    for (const kind of ["topic", "case-study"] as const) {
      const request = kind === "topic" ? api.topics() : api.caseStudies();
      void request
        .then((entries) => {
          if (!Array.isArray(entries))
            throw new Error("The current catalog could not be checked.");
          if (active)
            setCatalog((previous) => ({
              ...previous,
              [kind]: { entries, error: "" },
            }));
        })
        .catch((cause: unknown) => {
          if (active)
            setCatalog((previous) => ({
              ...previous,
              [kind]: {
                entries: null,
                error:
                  cause instanceof Error
                    ? cause.message
                    : "The current catalog could not be checked.",
              },
            }));
        });
    }
    return () => {
      active = false;
    };
  }, [attempt]);
  const titles = new Map(
    Object.values(catalog)
      .flatMap((collection) => collection.entries ?? [])
      .filter((entry) => entry.status === "published")
      .map((entry) => [entry.id, entry.title]),
  );
  const bookmarks = [...snapshot.bookmarks].sort((a, b) =>
    a.savedAt === b.savedAt
      ? a.moduleId < b.moduleId
        ? -1
        : 1
      : a.savedAt > b.savedAt
        ? -1
        : 1,
  );
  function focusHeading() {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ behavior: "instant", block: "start" });
  }
  return (
    <section
      className="bookmarks-page page-width"
      aria-labelledby="bookmarks-title"
    >
      <Link className="back-link" to="/">
        ← All modules
      </Link>
      <p className="eyebrow">Your reading list</p>
      <h1 id="bookmarks-title" ref={heading} tabIndex={-1}>
        Saved modules
      </h1>
      <p className="bookmarks-intro">
        Save a concept to return to its explanation or experiment. Bookmarks
        live on this browser; they do not mean a module is completed or
        mastered.
      </p>
      {snapshot.issue && (
        <p className="bookmark-warning" role="note">
          Bookmarks are kept for this session only. {snapshot.issue} Download
          your bookmarks before leaving or reloading. Previous saved data has
          not been replaced.
        </p>
      )}
      <BookmarkTools titles={titles} onClear={focusHeading} />
      {!!bookmarks.length &&
        Object.values(catalog).some((collection) => collection.error) && (
          <div className="bookmark-warning" role="alert">
            <p>
              Some saved modules could not be checked. Your bookmarks and backup
              tools remain available.
            </p>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setCatalog(pending());
                setAttempt((value) => value + 1);
              }}
            >
              Check availability again
            </button>
          </div>
        )}
      {message && <p role="status">{message}</p>}
      {!bookmarks.length ? (
        <div className="bookmark-empty">
          <h2>No saved modules yet</h2>
          <p>
            Open a published module and choose Save module. You can also restore
            a bookmark backup above.
          </p>
          <Link className="button primary" to="/#modules">
            Browse modules <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : (
        <>
          <p>
            {bookmarks.length} saved{" "}
            {bookmarks.length === 1 ? "module" : "modules"} · Reading list, not
            completion evidence
          </p>
          <ul className="bookmark-list" aria-label="Saved module list">
            {bookmarks.map((bookmark) => {
              const collection = catalog[bookmark.kind];
              const entry = collection.entries?.find(
                (item) =>
                  item.id === bookmark.moduleId &&
                  item.kind === bookmark.kind &&
                  item.status === "published",
              );
              return (
                <li className="bookmark-row" key={bookmark.moduleId}>
                  <div>
                    <p className="eyebrow">
                      {entry
                        ? `${entry.category} · ${entry.level}`
                        : "Saved reference"}
                    </p>
                    <h2>
                      {entry ? (
                        <Link
                          to={`/${entry.kind === "topic" ? "topics" : "case-studies"}/${encodeURIComponent(entry.id)}`}
                        >
                          {entry.title}
                        </Link>
                      ) : collection.entries === null ? (
                        "Saved module"
                      ) : (
                        "Module unavailable"
                      )}
                    </h2>
                    {!entry && (
                      <p className="bookmark-reference">
                        Saved ID: <code>{bookmark.moduleId}</code>
                      </p>
                    )}
                    {entry ? (
                      <>
                        <p>{entry.summary}</p>
                        {entry.contentVersion !== bookmark.contentVersion && (
                          <p role="note">
                            Content has changed since you saved this module.
                            Review its current version; your saved answers stay
                            unchanged.
                          </p>
                        )}
                      </>
                    ) : collection.error ? (
                      <p>
                        Current availability could not be checked. Try again
                        above; no destination has been guessed.
                      </p>
                    ) : collection.entries === null ? (
                      <p role="status">Checking current availability…</p>
                    ) : (
                      <p role="note">
                        This module is not in the current published catalog. Its
                        bookmark stays in your backup; you can remove it below.
                      </p>
                    )}
                  </div>
                  <button
                    className="button secondary"
                    type="button"
                    aria-label={`Remove bookmark for ${entry?.title ?? bookmark.moduleId}`}
                    onClick={() => {
                      const result = store.remove(bookmark.moduleId);
                      setMessage(
                        result.ok
                          ? (result.message ??
                              `Removed bookmark for ${entry?.title ?? bookmark.moduleId}. Your answers were kept.`)
                          : (result.message ??
                              "This bookmark could not be removed."),
                      );
                      focusHeading();
                    }}
                  >
                    Remove bookmark
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
