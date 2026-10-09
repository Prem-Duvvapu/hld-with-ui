import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiClientError } from "../api/client";
import type { CatalogEntry, SearchResponse } from "../api/types";
import catalog from "../../../content/catalog.json";
import { SearchPage } from "./SearchPage";

const entry = (catalog as CatalogEntry[]).find(
  (item) => item.id === "cache-aside",
)!;
function result(query = "stale reads"): SearchResponse {
  return {
    schemaVersion: 1,
    query,
    totalMatches: 1,
    limit: 20,
    results: [
      {
        entry,
        path: "/topics/cache-aside?view=study",
        excerpt: "An update leaves stale reads until expiry.",
      },
    ],
  };
}
function page(route = "/search") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <SearchPage />
    </MemoryRouter>,
  );
}
afterEach(() => vi.restoreAllMocks());

describe("SearchPage", () => {
  it("refuses an ambiguous direct link instead of sending only its first query", () => {
    const search = vi.spyOn(api, "search");
    page("/search?q=cache&q=queue");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "unsupported or repeated filters",
    );
    expect(search).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear search link" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(search).not.toHaveBeenCalled();
  });

  it("does not send blank searches and clears an unsubmitted draft", () => {
    const search = vi.spyOn(api, "search");
    page();
    expect(screen.getByText(/Start with a concept/)).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "draft text" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Clear search and filters" }),
    );
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(search).not.toHaveBeenCalled();
    expect(document.title).toBe("Search · HLD with UI");
  });

  it("submits explicit criteria, preserves form focus and identifies the result query", async () => {
    const search = vi.spyOn(api, "search").mockResolvedValue(result());
    page();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "stale reads" },
    });
    const button = screen.getByRole("button", { name: "Search" });
    button.focus();
    fireEvent.click(button);
    expect(
      await screen.findByRole("link", { name: /Cache-Aside/ }),
    ).toHaveAttribute("href", "/topics/cache-aside?view=study");
    expect(button).toHaveFocus();
    expect(search).toHaveBeenCalledWith("stale reads", "", "");
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "token bucket" },
    });
    expect(screen.getByRole("note")).toHaveTextContent(
      "Results still belong to “stale reads”",
    );
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("restores direct-link filters and explains no matches without a draft fallback", async () => {
    const search = vi
      .spyOn(api, "search")
      .mockResolvedValue({ ...result("codes"), results: [], totalMatches: 0 });
    page("/search?q=codes&level=Intermediate&capability=case-study");
    expect(await screen.findByText("No matches")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getByRole("combobox", { name: "Level" })).toHaveValue(
      "Intermediate",
    );
    expect(screen.getByRole("combobox", { name: "Activity" })).toHaveValue(
      "case-study",
    );
    expect(search).toHaveBeenCalledWith("codes", "Intermediate", "case-study");
    expect(
      screen.queryByRole("link", { name: /URL Shortener/ }),
    ).not.toBeInTheDocument();
  });

  it("retries a backend failure without replacing it with fabricated results", async () => {
    vi.spyOn(api, "search")
      .mockRejectedValueOnce(new ApiClientError("Search unavailable.", 503))
      .mockResolvedValueOnce(result());
    page("/search?q=stale+reads");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Search unavailable.",
    );
    expect(
      screen.queryByRole("link", { name: /Cache-Aside/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("link", { name: /Cache-Aside/ }),
    ).toBeVisible();
  });

  it("ignores an older response after a new search has completed", async () => {
    let finishOld: (data: SearchResponse) => void = () => undefined;
    const old = new Promise<SearchResponse>((resolve) => {
      finishOld = resolve;
    });
    vi.spyOn(api, "search")
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce(result("stale reads"));
    page("/search?q=old+query");
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "stale reads" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByRole("heading", { name: "Results for “stale reads”" });
    await act(async () => finishOld(result("old query")));
    expect(
      screen.getByRole("heading", { name: "Results for “stale reads”" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Results for “old query”" }),
    ).not.toBeInTheDocument();
  });
});
