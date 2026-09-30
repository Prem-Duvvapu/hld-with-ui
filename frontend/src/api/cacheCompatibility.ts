import type { CacheAsideEvent } from "./types";

// Exhaustive against generated types: a contract change requires a conscious
// renderer compatibility decision. This is a compatibility gate, not a general
// JSON schema validator; real HTTP response shapes are checked in integration.
const supportedKinds: Record<CacheAsideEvent["kind"], true> = {
  "cache.hit": true,
  "cache.miss": true,
  "cache.fill": true,
  "cache.bypass": true,
  "cache.error": true,
  "origin.read": true,
  "origin.update": true,
  "origin.error": true,
};

export class CacheCompatibilityError extends Error {
  constructor() {
    super(
      "This cache-aside response is incompatible with this app. Refresh to load the latest app and try again. If this continues, update the frontend and backend together.",
    );
    this.name = "CacheCompatibilityError";
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertCacheCompatibility(
  body: unknown,
  kind: "descriptor" | "result",
): void {
  if (!object(body) || body.modelVersion !== "1.0.1") {
    throw new CacheCompatibilityError();
  }
  if (kind === "descriptor") {
    if (
      body.id !== "cache-aside" ||
      !object(body.limits) ||
      !Array.isArray(body.presets) ||
      body.presets.length === 0 ||
      !body.presets.every(
        (preset: unknown) =>
          object(preset) &&
          object(preset.input) &&
          preset.input.schemaVersion === "1.0" &&
          preset.input.modelVersion === "1.0.1",
      )
    ) {
      throw new CacheCompatibilityError();
    }
    return;
  }
  if (
    body.simulationId !== "cache-aside" ||
    body.schemaVersion !== "1.0" ||
    !object(body.initialState) ||
    !Array.isArray(body.events) ||
    !body.events.every(
      (event: unknown) =>
        object(event) &&
        typeof event.kind === "string" &&
        Object.hasOwn(supportedKinds, event.kind),
    )
  ) {
    throw new CacheCompatibilityError();
  }
}
