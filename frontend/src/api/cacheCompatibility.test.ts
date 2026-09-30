import { describe, expect, it } from "vitest";
import {
  assertCacheCompatibility,
  CacheCompatibilityError,
} from "./cacheCompatibility";

const result = {
  modelVersion: "1.0.1",
  schemaVersion: "1.0",
  simulationId: "cache-aside",
  initialState: {},
  events: [{ kind: "cache.hit" }],
};

describe("cache response compatibility", () => {
  it("accepts supported event kinds and an empty partial trace", () => {
    expect(() => assertCacheCompatibility(result, "result")).not.toThrow();
    expect(() =>
      assertCacheCompatibility({ ...result, events: [] }, "result"),
    ).not.toThrow();
  });

  it.each([
    null,
    [],
    { ...result, modelVersion: "1.0.0" },
    { ...result, schemaVersion: "2.0" },
    { ...result, simulationId: "request-flow" },
    { ...result, initialState: null },
    { ...result, events: null },
    { ...result, events: [null] },
    { ...result, events: [{ kind: "cache.future" }] },
    { ...result, events: [{ kind: "toString" }] },
  ])("rejects an incompatible result (%j)", (body) => {
    expect(() => assertCacheCompatibility(body, "result")).toThrow(
      CacheCompatibilityError,
    );
  });

  it("checks preset versions even when the descriptor version is supported", () => {
    const descriptor = {
      id: "cache-aside",
      modelVersion: "1.0.1",
      limits: {},
      presets: [{ input: { schemaVersion: "1.0", modelVersion: "1.0.1" } }],
    };
    expect(() =>
      assertCacheCompatibility(descriptor, "descriptor"),
    ).not.toThrow();
    descriptor.presets[0]!.input.modelVersion = "2.0";
    expect(() => assertCacheCompatibility(descriptor, "descriptor")).toThrow(
      CacheCompatibilityError,
    );
  });
});
