import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "./HomePage";

afterEach(() => vi.unstubAllGlobals());

describe("HomePage", () => {
  it("loads the catalog from the backend and links to the published module", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: "request-flow",
            kind: "topic",
            title: "Request Flow & Load Balancing",
            summary: "Trace a request.",
            category: "Foundations",
            level: "Beginner",
            order: 1,
            status: "published",
            prerequisites: [],
            outcomes: ["Explain queue time"],
            capabilities: ["study", "simulation", "practice"],
            contentVersion: "1.0.0",
          },
        ],
      }),
    );

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("link", {
        name: /Request Flow & Load Balancing/,
      }),
    ).toHaveAttribute("href", "/topics/request-flow");
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/topics",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("shows a recoverable backend error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot reach the Java backend",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });
});
