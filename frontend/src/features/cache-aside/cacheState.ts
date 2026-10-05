import type {
  CacheAsideEvent,
  CacheAsideResult,
  CacheEntryState,
  OriginValueState,
} from "../../api/types";

/** Position before the first event: the result's initialState. */
export const INITIAL_POSITION = -1;

export type KeyState = {
  key: string;
  /** Absent when the cache holds no entry for the key. */
  cacheEntry?: CacheEntryState;
  /** Absent when the origin has no such key. */
  originValue?: OriginValueState;
};

export type CacheSnapshot = {
  cacheAvailable: boolean;
  originAvailable: boolean;
  /**
   * Virtual time of the selected position: the selected event's time, or 0
   * before the first event.
   */
  atMs: number;
  /** Initial origin keys first, then keys in the order events first touch them. */
  keys: KeyState[];
};

/**
 * The cache and origin state after the event at `position` (or before any
 * event at INITIAL_POSITION). Java emits every event with its key's state
 * after the event, so applying them in sequence order over initialState is
 * exact (decision 0006). Every earlier event is applied, whatever operation
 * the learner is inspecting. Narration is never read, and the result is not
 * mutated.
 */
export function cacheStateAt(
  result: {
    initialState: CacheAsideResult["initialState"];
    events: readonly CacheAsideEvent[];
  },
  position: number,
): CacheSnapshot {
  const keys = new Map<string, KeyState>();
  for (const { key, value, version } of result.initialState.origin)
    keys.set(key, { key, originValue: { value, version } });

  const events = orderedEvents(result.events);
  const last = Math.min(position, events.length - 1);
  for (const event of events.slice(0, last + 1)) {
    const next: KeyState = { key: event.key };
    if (event.cacheEntry) next.cacheEntry = event.cacheEntry;
    if (event.originValue) next.originValue = event.originValue;
    keys.set(event.key, next);
  }

  return {
    cacheAvailable: result.initialState.cacheAvailable,
    originAvailable: result.initialState.originAvailable,
    atMs: last >= 0 ? events[last]!.timeMs : 0,
    keys: [...keys.values()],
  };
}

/** Events in sequence order. Equal timestamps stay separate events. */
export function orderedEvents(events: readonly CacheAsideEvent[]) {
  return events.every(
    (event, index) =>
      index === 0 || events[index - 1]!.sequence < event.sequence,
  )
    ? events
    : [...events].sort((a, b) => a.sequence - b.sequence);
}

export type EntryStatus = "fresh" | "expired";

/**
 * Whether a lookup at `atMs` would use the entry. The contract defines
 * expiresAtMs as the first time a lookup misses, so an entry the trace still
 * retains is reported as expired rather than removed.
 */
export function entryStatus(entry: CacheEntryState, atMs: number): EntryStatus {
  return atMs < entry.expiresAtMs ? "fresh" : "expired";
}

/** True when the cached copy was filled from an older origin version. */
export function isBehindOrigin(state: KeyState) {
  return Boolean(
    state.cacheEntry &&
    state.originValue &&
    state.cacheEntry.version !== state.originValue.version,
  );
}
