import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkshopCatalog } from "./WorkshopCatalog";

afterEach(() => vi.unstubAllGlobals());

const published = {
  id: "url-shortener",
  kind: "case-study",
  title: "URL Shortener",
  summary: "Choose stable codes and defend redirect correctness.",
  category: "Case Studies",
  level: "Intermediate",
  status: "published",
};

function renderCatalog() {
  return render(
    <MemoryRouter>
      <WorkshopCatalog />
    </MemoryRouter>,
  );
}

describe("WorkshopCatalog", () => {
  it("links only the returned published case metadata to the workshop route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [published] }),
    );
    renderCatalog();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading design workshops",
    );
    expect(
      await screen.findByRole("link", { name: /URL Shortener/ }),
    ).toHaveAttribute("href", "/case-studies/url-shortener");
    expect(screen.queryByText("Interactive")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/case-studies",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("removes the discovery section when Java returns no published cases", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] }),
    );
    renderCatalog();
    await screen.findByRole("status");
    await vi.waitFor(() => {
      expect(screen.queryByRole("region")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("announces a collection failure and retries without replacing the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: async () => ({ message: "Workshops are unavailable." }),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => [published] }),
    );
    renderCatalog();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Workshops are unavailable.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("link", { name: /URL Shortener/ }),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
