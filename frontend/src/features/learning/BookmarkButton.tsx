import { useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import type { CatalogEntry } from "../../api/types";
import { getBookmarkStore } from "./bookmarkStorage";
import "./Bookmarks.css";

export function BookmarkButton({ entry }: { entry: CatalogEntry }) {
  const store = getBookmarkStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [message, setMessage] = useState("");
  if (entry.status !== "published") return null;
  const saved = snapshot.bookmarks.some((item) => item.moduleId === entry.id);
  return (
    <div className="module-bookmark">
      <button
        className="button secondary"
        type="button"
        aria-pressed={saved}
        onClick={() => {
          const result = store.toggle(entry);
          setMessage(
            result.ok
              ? ""
              : (result.message ?? "This module could not be saved."),
          );
        }}
      >
        <span aria-hidden="true">{saved ? "★" : "☆"}</span>{" "}
        {saved ? "Module saved" : "Save module"}
      </button>
      {message && <p role="alert">{message}</p>}
      {snapshot.issue && (
        <p className="bookmark-warning" role="note">
          Bookmarks are kept for this session only. {snapshot.issue}{" "}
          <Link to="/bookmarks">Open bookmark backups</Link> before leaving or
          reloading.
        </p>
      )}
    </div>
  );
}
