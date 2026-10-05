import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CachePlayback } from "./CachePlayback";
import { baseline, limited, multiKey } from "./fixtures";

function renderBaseline() {
  return render(
    <CachePlayback result={baseline.result} input={baseline.input} />,
  );
}

const inspector = () =>
  document.querySelector<HTMLElement>(".cache-inspector")!;
const stateTable = () =>
  screen.getByRole("table", {
    name: "Cache and origin state at the selected position",
  });
const position = () => document.querySelector<HTMLElement>(".cache-position")!;
const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next event" }));

function viewEvent(sequence: number) {
  fireEvent.click(
    screen.getByRole("button", { name: `View event ${sequence}` }),
  );
}

afterEach(() => vi.useRealTimers());

describe("CachePlayback", () => {
  it("opens at the initial state with an empty cache and origin v1", () => {
    renderBaseline();
    expect(screen.getByLabelText("Trace position")).toHaveValue("-1");
    expect(inspector()).toHaveTextContent("Initial state, before any event");
    expect(inspector()).toHaveTextContent(
      "Cache has no entry for k. Origin holds v1 (version 1).",
    );
    expect(within(stateTable()).getAllByRole("row")[1]).toHaveTextContent(
      "k———No entryv1 (version 1)",
    );
    expect(
      screen.getByRole("button", { name: "Previous event" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Reset to initial state" }),
    ).toBeDisabled();
  });

  it("steps to the 22 ms fill and shows the entry only after it", () => {
    renderBaseline();
    next(); // 2 ms miss
    next(); // 22 ms origin read
    expect(inspector()).toHaveTextContent("origin.read");
    expect(inspector()).toHaveTextContent("Cache has no entry for k.");
    next(); // 22 ms fill
    expect(inspector()).toHaveTextContent("cache.fill");
    expect(inspector()).toHaveTextContent(
      "Cache holds k = v1 (version 1), filled at 22 ms, fresh until 122 ms.",
    );
    expect(position()).toHaveTextContent(/Event 3 of 9 · 22 ms/);
  });

  it("explains the 72 ms stale hit and the 122 ms expired miss from structured state", () => {
    renderBaseline();
    viewEvent(6);
    expect(inspector()).toHaveTextContent("event 6 at 72 ms");
    expect(inspector()).toHaveTextContent(
      "Origin holds v2 (version 2). The cached copy is older than the origin, so a hit returns stale data.",
    );
    expect(within(stateTable()).getAllByRole("row")[1]).toHaveClass(
      "stale-row",
    );
    expect(within(stateTable()).getAllByRole("row")[1]).toHaveTextContent(
      "fresh, behind origin",
    );

    viewEvent(7);
    expect(inspector()).toHaveTextContent(
      "expired at 122 ms; a lookup now misses",
    );
    expect(within(stateTable()).getAllByRole("row")[1]).toHaveTextContent(
      "v1 (version 1)22122expired",
    );
  });

  it("returns to identical states after seeking backward and forward", () => {
    renderBaseline();
    viewEvent(9);
    const atEnd = inspector().textContent;
    fireEvent.change(screen.getByLabelText("Trace position"), {
      target: { value: "1" },
    });
    expect(inspector()).toHaveTextContent("origin.read");
    fireEvent.change(screen.getByLabelText("Trace position"), {
      target: { value: "8" },
    });
    expect(inspector().textContent).toBe(atEnd);
    expect(screen.getByRole("button", { name: "Next event" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Reset to initial state" }),
    );
    expect(inspector()).toHaveTextContent("Initial state, before any event");
  });

  it("plays to the last event, then stops; speed changes only the interval", () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderBaseline();
    fireEvent.change(screen.getByLabelText("Playback speed"), {
      target: { value: "300" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Play trace" }));
    act(() => vi.advanceTimersByTime(300));
    expect(position()).toHaveTextContent(/Event 1 of 9/);
    // Each step schedules the next timer after React commits.
    for (let step = 0; step < 20; step++)
      act(() => vi.advanceTimersByTime(300));
    expect(position()).toHaveTextContent(/Event 9 of 9 · 142 ms/);
    expect(screen.getByRole("button", { name: "Play trace" })).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("filters the event table by operation without dropping other operations' state", () => {
    render(<CachePlayback result={multiKey.result} input={multiKey.input} />);
    fireEvent.change(screen.getByLabelText("Show events for"), {
      target: { value: "5" },
    });
    const trace = screen.getByRole("table", { name: "Simulation event trace" });
    const rows = within(trace).getAllByRole("row").slice(1);
    expect(rows.every((row) => row.textContent?.includes("k"))).toBe(true);
    expect(rows).toHaveLength(1);

    viewEvent(9);
    const keys = within(stateTable()).getAllByRole("row").slice(1);
    expect(keys.map((row) => row.querySelector("td")?.textContent)).toEqual([
      "k",
      "a",
    ]);
    expect(keys[1]).toHaveTextContent("a1 (version 1)");
    expect(screen.getByText(/Showing only operation 5/)).toBeInTheDocument();
  });

  it("labels each operation from the submitted input", () => {
    render(<CachePlayback result={multiKey.result} input={multiKey.input} />);
    expect(
      screen.getByRole("option", { name: "Operation 3: UPDATE a = a1 @ 5 ms" }),
    ).toBeInTheDocument();
  });

  it("says the trace stopped at a limit when a limited run reaches its last event", () => {
    render(<CachePlayback result={limited.result} input={limited.input} />);
    viewEvent(limited.result.events.length);
    expect(inspector()).toHaveTextContent(
      "The trace stops here because the run reached a limit.",
    );
  });

  it("keeps every control safe for an empty trace", () => {
    render(
      <CachePlayback
        result={{ ...baseline.result, events: [] }}
        input={baseline.input}
      />,
    );
    for (const name of [
      "Play trace",
      "Previous event",
      "Next event",
      "Reset to initial state",
    ])
      expect(screen.getByRole("button", { name })).toBeDisabled();
    expect(screen.getByLabelText("Trace position")).toBeDisabled();
    expect(inspector()).toHaveTextContent(
      "This run produced no events to play.",
    );
  });
});
