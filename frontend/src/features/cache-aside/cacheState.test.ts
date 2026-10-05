import { describe, expect, it } from "vitest";
import type { CacheAsideResult } from "../../api/types";
import {
  INITIAL_POSITION,
  cacheStateAt,
  entryStatus,
  isBehindOrigin,
} from "./cacheState";
import { baseline, coldBurst, limited, multiKey } from "./fixtures";

function stateOf(result: CacheAsideResult, position: number, key = "k") {
  const snapshot = cacheStateAt(result, position);
  return { snapshot, key: snapshot.keys.find((state) => state.key === key)! };
}

/** Position of the first event matching time and kind. */
function at(result: CacheAsideResult, timeMs: number, kind: string) {
  const index = result.events.findIndex(
    (event) => event.timeMs === timeMs && event.kind === kind,
  );
  expect(index, `${kind} at ${timeMs} ms`).toBeGreaterThanOrEqual(0);
  return index;
}

describe("cacheStateAt with the Java baseline trace", () => {
  const { result } = baseline;

  it("starts from initialState: empty cache, origin k = v1 version 1", () => {
    const { snapshot, key } = stateOf(result, INITIAL_POSITION);
    expect(snapshot).toMatchObject({
      cacheAvailable: true,
      originAvailable: true,
      atMs: 0,
    });
    expect(key).toEqual({ key: "k", originValue: { value: "v1", version: 1 } });
  });

  it("has no entry after the 2 ms miss", () => {
    expect(stateOf(result, at(result, 2, "cache.miss")).key.cacheEntry).toBe(
      undefined,
    );
  });

  it("keeps the 22 ms origin read and fill separate; the entry appears only at the fill", () => {
    const read = at(result, 22, "origin.read");
    const fill = at(result, 22, "cache.fill");
    expect(fill).toBe(read + 1);
    expect(stateOf(result, read).key.cacheEntry).toBe(undefined);
    expect(stateOf(result, fill).key.cacheEntry).toEqual({
      value: "v1",
      version: 1,
      filledAtMs: 22,
      expiresAtMs: 122,
    });
  });

  it("moves the origin to v2 at 40 ms while the cache keeps v1", () => {
    const { key } = stateOf(result, at(result, 40, "origin.update"));
    expect(key.originValue).toEqual({ value: "v2", version: 2 });
    expect(key.cacheEntry?.version).toBe(1);
    expect(isBehindOrigin(key)).toBe(true);
  });

  it("serves the 72 ms hit from v1 while the origin holds v2", () => {
    const position = at(result, 72, "cache.hit");
    const { key, snapshot } = stateOf(result, position);
    expect(key.cacheEntry?.value).toBe("v1");
    expect(key.originValue?.value).toBe("v2");
    expect(entryStatus(key.cacheEntry!, snapshot.atMs)).toBe("fresh");
    expect(result.outcomes[2]).toMatchObject({ hitOrMiss: "HIT", stale: true });
  });

  it("keeps the retained entry at the 122 ms miss and reports it expired", () => {
    const { key, snapshot } = stateOf(result, at(result, 122, "cache.miss"));
    expect(key.cacheEntry).toMatchObject({ value: "v1", expiresAtMs: 122 });
    expect(entryStatus(key.cacheEntry!, snapshot.atMs)).toBe("expired");
  });

  it("holds v2 after the 142 ms fill", () => {
    const { key, snapshot } = stateOf(result, at(result, 142, "cache.fill"));
    expect(key.cacheEntry).toEqual({
      value: "v2",
      version: 2,
      filledAtMs: 142,
      expiresAtMs: 242,
    });
    expect(isBehindOrigin(key)).toBe(false);
    expect(entryStatus(key.cacheEntry!, snapshot.atMs)).toBe("fresh");
  });

  it("gives identical states for backward and forward seeks", () => {
    const forward = result.events.map((_, i) => cacheStateAt(result, i));
    const backward = result.events
      .map((_, i) => cacheStateAt(result, result.events.length - 1 - i))
      .reverse();
    expect(backward).toEqual(forward);
    expect(cacheStateAt(result, 3)).toEqual(cacheStateAt(result, 3));
  });

  it("does not mutate the response", () => {
    const copy = structuredClone(result);
    result.events.forEach((_, i) => cacheStateAt(result, i));
    expect(result).toEqual(copy);
  });

  it("applies events in sequence order even when the array is shuffled", () => {
    const shuffled = { ...result, events: [...result.events].reverse() };
    expect(cacheStateAt(shuffled, 4)).toEqual(cacheStateAt(result, 4));
  });
});

describe("cacheStateAt with other Java traces", () => {
  it("cold burst: five misses and five origin reads at 22–26 ms; no entry before the first fill", () => {
    const { result } = coldBurst;
    const kinds = (kind: string) =>
      result.events.filter((event) => event.kind === kind);
    expect(kinds("cache.miss")).toHaveLength(5);
    expect(kinds("origin.read").map((event) => event.timeMs)).toEqual([
      22, 23, 24, 25, 26,
    ]);
    const firstFill = at(result, 22, "cache.fill");
    for (let i = INITIAL_POSITION; i < firstFill; i++)
      expect(stateOf(result, i).key.cacheEntry).toBe(undefined);
    expect(stateOf(result, firstFill).key.cacheEntry?.filledAtMs).toBe(22);
  });

  it("multiple keys: one key's events never change another key", () => {
    const { result } = multiKey;
    const update = at(result, 5, "origin.update");
    const before = cacheStateAt(result, update - 1);
    const after = cacheStateAt(result, update);
    expect(after.keys.find((s) => s.key === "k")).toEqual(
      before.keys.find((s) => s.key === "k"),
    );
    // Key a did not exist at the origin until the UPDATE created version 1.
    expect(before.keys.find((s) => s.key === "a")?.originValue).toBe(undefined);
    expect(after.keys.find((s) => s.key === "a")?.originValue).toEqual({
      value: "a1",
      version: 1,
    });

    const end = cacheStateAt(result, result.events.length - 1);
    expect(end.keys.map((s) => s.key)).toEqual(["k", "a"]);
    expect(end.keys.map((s) => s.cacheEntry?.value)).toEqual(["v1", "a1"]);
  });

  it("only shows keys an operation has touched so far", () => {
    expect(
      cacheStateAt(multiKey.result, INITIAL_POSITION).keys.map((s) => s.key),
    ).toEqual(["k"]);
  });

  it("limited trace: stops at the last emitted event without inventing later state", () => {
    const { result } = limited;
    expect(result.status).toBe("limited");
    const last = cacheStateAt(result, result.events.length - 1);
    const beyond = cacheStateAt(result, result.events.length + 5);
    expect(beyond).toEqual(last);
    expect(last.atMs).toBe(result.lastVirtualTimeMs);
  });

  it("empty trace: every position is the initial state", () => {
    const empty = { ...baseline.result, events: [] };
    expect(cacheStateAt(empty, 3)).toEqual(
      cacheStateAt(empty, INITIAL_POSITION),
    );
    expect(cacheStateAt(empty, 3).atMs).toBe(0);
  });
});
