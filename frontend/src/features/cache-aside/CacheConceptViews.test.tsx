import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CacheArchitectureView, CacheSequenceView } from "./CacheConceptViews";

describe("Cache concept views", () => {
  it("draws the application between cache and origin, with a text equivalent", () => {
    render(<CacheArchitectureView />);
    expect(
      screen.getByRole("img", {
        name: /reads the cache first\. On a miss it reads the origin itself/,
      }),
    ).toBeInTheDocument();
    const words = screen
      .getByRole("heading", { name: "Architecture in words" })
      .closest("div")!;
    expect(within(words).getAllByRole("listitem")).toHaveLength(5);
    // Writes are shown as origin-only, and unmodeled alternatives are named.
    expect(
      screen.getByText("Origin only, cache untouched"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Invalidation, write-through, or refresh-ahead"),
    ).toBeInTheDocument();
  });

  it("tells the baseline as four moments with the trace's times", () => {
    render(<CacheSequenceView />);
    for (const label of [
      "A · 0 → 22 ms",
      "B · 30 → 32 ms",
      "C · 40 → 72 ms",
      "D · 120 → 142 ms",
    ])
      expect(screen.getByText(label)).toBeInTheDocument();
    expect(
      screen.getByText(
        "GET at 120 ms looks up at 122 ms, exactly the expiry time.",
      ),
    ).toBeInTheDocument();
  });
});
