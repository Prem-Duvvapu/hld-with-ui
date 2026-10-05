import { describe, expect, it } from "vitest";
import { orderedEvents } from "./cacheState";
import { resolveCheckpoint } from "./checkpoints";
import { baseline, coldBurst } from "./fixtures";

describe("resolveCheckpoint", () => {
  const events = orderedEvents(baseline.result.events);

  it("finds the target by operation and kind, not by array index", () => {
    const index = resolveCheckpoint(events, {
      operation: 4,
      kind: "cache.hit",
      occurrence: 1,
    });
    expect(events[index]).toMatchObject({ timeMs: 72, operation: 4 });
  });

  it("separates events of the same kind within one operation by occurrence", () => {
    // Operation 5 misses at 122 ms, then reads and fills at 142 ms.
    const fill = resolveCheckpoint(events, {
      operation: 5,
      kind: "cache.fill",
      occurrence: 1,
    });
    expect(events[fill]).toMatchObject({ timeMs: 142, kind: "cache.fill" });
    expect(
      resolveCheckpoint(events, {
        operation: 5,
        kind: "cache.fill",
        occurrence: 2,
      }),
    ).toBe(-1);
  });

  it("picks the operation's own event in a burst where kinds repeat", () => {
    const burst = orderedEvents(coldBurst.result.events);
    const index = resolveCheckpoint(burst, {
      operation: 5,
      kind: "origin.read",
      occurrence: 1,
    });
    expect(burst[index]).toMatchObject({ timeMs: 26, sequence: 14 });
  });

  it("returns -1 when the trace has no such event", () => {
    expect(
      resolveCheckpoint(events, {
        operation: 3,
        kind: "cache.hit",
        occurrence: 1,
      }),
    ).toBe(-1);
  });
});
