import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import catalog from "../../../content/catalog.json";
import type { CatalogEntry } from "../api/types";
import { api } from "../api/client";
import { BookmarkButton } from "../features/learning/BookmarkButton";
import {
  createBookmarkStore,
  serializeBookmarks,
  type Bookmark,
} from "../features/learning/bookmarkStorage";
import { downloadJson } from "../features/learning/downloadJson";
import { BookmarksPage } from "./BookmarksPage";

let store: ReturnType<typeof createBookmarkStore>;
let raw: string | null;
let denied: boolean;
const entries = catalog.filter(
  (entry) => entry.kind === "topic",
) as CatalogEntry[];
const entry = entries[0]!;
const date = "2026-10-10T00:00:00.000Z";
const record = (moduleId = entry.id): Bookmark => ({
  moduleId,
  kind: "topic",
  contentVersion: "1.0.0",
  savedAt: date,
});
vi.mock("../features/learning/bookmarkStorage", async (original) => ({
  ...(await original<typeof import("../features/learning/bookmarkStorage")>()),
  getBookmarkStore: () => store,
}));
vi.mock("../features/learning/downloadJson", () => ({ downloadJson: vi.fn() }));
function setup(records: Bookmark[] = []) {
  raw = records.length ? serializeBookmarks(records) : null;
  denied = false;
  store = createBookmarkStore(
    () => ({
      getItem: () => raw,
      setItem: (_key, value) => {
        if (denied) throw new DOMException("Denied", "QuotaExceededError");
        raw = value;
      },
    }),
    () => date,
  );
}
function view() {
  return render(
    <MemoryRouter>
      <BookmarksPage />
    </MemoryRouter>,
  );
}
async function tools() {
  fireEvent.click(screen.getByText("Back up or manage bookmarks"));
}
async function importFile(records: Bookmark[]) {
  fireEvent.change(screen.getByLabelText("Import a bookmark backup"), {
    target: {
      files: [
        new File([serializeBookmarks(records)], "bookmarks.json", {
          type: "application/json",
        }),
      ],
    },
  });
  return screen.findByRole("button", { name: "Apply bookmark import" });
}
beforeEach(() => {
  setup();
  vi.spyOn(api, "topics").mockResolvedValue(entries);
  vi.spyOn(api, "caseStudies").mockResolvedValue([]);
  vi.mocked(downloadJson).mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("bookmark controls and availability", () => {
  it("shows an actionable empty reading list, writes no state and makes no completion claim", async () => {
    view();
    expect(
      screen.getByRole("heading", { name: "No saved modules yet" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Browse modules" }),
    ).toHaveAttribute("href", "/#modules");
    await waitFor(() => expect(api.topics).toHaveBeenCalledOnce());
    expect(raw).toBeNull();
    expect(document.title).toBe("Saved modules · HLD with UI");
    expect(screen.getByText(/do not mean a module is completed/)).toBeVisible();
  });
  it("toggles a published module through a stable pressed button and hides the control for drafts", () => {
    const mounted = render(
      <MemoryRouter>
        <BookmarkButton entry={entry} />
      </MemoryRouter>,
    );
    const button = screen.getByRole("button", { name: "Save module" });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent("Module saved");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    const previous = raw;
    mounted.rerender(
      <MemoryRouter>
        <BookmarkButton
          entry={
            catalog.find((item) => item.status === "draft") as CatalogEntry
          }
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(raw).toBe(previous);
  });
  it("links only to a current published matching identity and labels updated content", async () => {
    setup([
      record(),
      record("retired-module"),
      { ...record("url-shortener"), kind: "case-study" },
    ]);
    vi.mocked(api.caseStudies).mockResolvedValue([
      catalog.find((item) => item.status === "draft") as CatalogEntry,
    ]);
    const previous = raw;
    view();
    expect(
      await screen.findByRole("link", { name: entry.title }),
    ).toHaveAttribute("href", `/topics/${entry.id}`);
    expect(
      screen.getByText(/Content has changed since you saved/),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getAllByText(/not in the current published catalog/),
      ).toHaveLength(2),
    );
    expect(screen.queryByRole("link", { name: /URL Shortener/ })).toBeNull();
    expect(raw).toBe(previous);
  });
  it("keeps a topic available when the case collection fails, then retries both safely", async () => {
    setup([record(), { ...record("missing-case"), kind: "case-study" }]);
    vi.mocked(api.caseStudies).mockRejectedValueOnce(new Error("Unavailable"));
    view();
    expect(
      await screen.findByRole("link", { name: entry.title }),
    ).toBeVisible();
    expect(
      await screen.findByText(/Current availability could not be checked/),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Check availability again" }),
    );
    expect(
      await screen.findByText(/not in the current published catalog/),
    ).toBeVisible();
    expect(api.caseStudies).toHaveBeenCalledTimes(2);
  });
  it("warns outside collapsed tools when saves are session-only, then retries explicitly", async () => {
    setup([record()]);
    const previous = raw;
    store.getSnapshot();
    denied = true;
    store.toggle(entries[1]!);
    view();
    expect(screen.getByRole("note", { name: "" })).toHaveTextContent(
      "session only",
    );
    expect(raw).toBe(previous);
    await tools();
    denied = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Try saving bookmarks again" }),
    );
    await screen.findByText(
      "Your session bookmarks are now saved on this browser.",
    );
    expect(store.getSnapshot().issue).toBeNull();
    expect(store.getSnapshot().bookmarks).toHaveLength(2);
  });
  it("offers exact previous-data download when corruption prevents safe replacement", async () => {
    raw = "{broken";
    view();
    expect(
      screen.getByText(/Previous saved data has not been replaced/),
    ).toBeVisible();
    await tools();
    fireEvent.click(
      screen.getByRole("button", { name: "Download previous bookmark data" }),
    );
    expect(downloadJson).toHaveBeenCalledWith(
      "{broken",
      "hld-bookmarks-previous-data.json",
    );
    expect(raw).toBe("{broken");
  });
});

describe("bookmark backup and reset flow", () => {
  it("downloads the exact bookmark envelope, previews/merges without replacing a local save and restores focus", async () => {
    setup([record()]);
    view();
    await screen.findByRole("link", { name: entry.title });
    await tools();
    fireEvent.click(screen.getByRole("button", { name: "Download bookmarks" }));
    expect(downloadJson).toHaveBeenCalledWith(raw, "hld-bookmarks.json");
    const previous = raw;
    const apply = await importFile([
      { ...record(), contentVersion: "9.0.0" },
      record(entries[1]!.id),
    ]);
    expect(
      screen.getByText(/1 new bookmarks will be added. 1 existing saves/),
    ).toBeVisible();
    expect(raw).toBe(previous);
    fireEvent.click(apply);
    expect(store.getSnapshot().bookmarks[0]).toEqual(record());
    expect(
      await screen.findByRole("link", { name: entries[1]!.title }),
    ).toBeVisible();
    expect(screen.getByLabelText("Import a bookmark backup")).toHaveFocus();
  });
  it("rejects a changed-store preview, while keeping both the local save and keyboard focus", async () => {
    view();
    await tools();
    const apply = await importFile([record()]);
    act(() => {
      store.toggle(entries[1]!);
    });
    const previous = raw;
    fireEvent.click(apply);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "changed after this preview",
    );
    expect(raw).toBe(previous);
    expect(store.getSnapshot().bookmarks).toHaveLength(1);
    expect(screen.getByLabelText("Import a bookmark backup")).toHaveFocus();
  });
  it("ignores late file reads after another selection and rejects oversized files before reading", async () => {
    view();
    await tools();
    let resolve!: (raw: string) => void;
    const late = {
      size: 1,
      text: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    };
    const input = screen.getByLabelText("Import a bookmark backup");
    fireEvent.change(input, { target: { files: [late] } });
    const read = vi.fn();
    fireEvent.change(input, {
      target: { files: [{ size: 65 * 1024, text: read }] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "64 KiB or less",
    );
    await act(async () => resolve(serializeBookmarks([record()])));
    expect(
      screen.queryByRole("button", { name: "Apply bookmark import" }),
    ).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(raw).toBeNull();
  });
  it("confirms only bookmark reset, defaults to keeping data, and focuses the stable heading on removal", async () => {
    setup([record()]);
    view();
    await screen.findByRole("link", { name: entry.title });
    await tools();
    const previous = raw;
    fireEvent.click(
      screen.getByRole("button", { name: "Clear all bookmarks" }),
    );
    expect(
      screen.getByRole("button", { name: "Keep bookmarks" }),
    ).toHaveFocus();
    expect(raw).toBe(previous);
    fireEvent.click(screen.getByRole("button", { name: "Keep bookmarks" }));
    expect(
      screen.getByRole("button", { name: "Clear all bookmarks" }),
    ).toHaveFocus();
    fireEvent.click(
      screen.getByRole("button", { name: "Clear all bookmarks" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove all bookmarks" }),
    );
    expect(
      screen.getByRole("heading", { name: "Saved modules" }),
    ).toHaveFocus();
    expect(store.getSnapshot().bookmarks).toEqual([]);
    expect(
      screen.getByText(/All bookmarks removed. Your answers were kept/),
    ).toBeVisible();
  });
});
