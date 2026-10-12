import { afterEach, expect, it, vi } from "vitest";
import { api, ApiClientError } from "./client";
import {
  baselineInput,
  baselineResult,
  descriptor,
} from "./deliveryTestFixtures";

afterEach(() => vi.unstubAllGlobals());
function respond(body: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
it("loads a validated delivery descriptor from its exact Java route without a run", async () => {
  const fetch = respond(descriptor);
  expect(await api.deliveryDescriptor()).toEqual(descriptor);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]![0]).toBe("/api/v1/simulations/queues-delivery");
  expect(fetch.mock.calls[0]![1].method).toBeUndefined();
});
it("captures the submitted workload before lazy validation loading yields to caller edits", async () => {
  const fetch = respond(baselineResult);
  const input = structuredClone(baselineInput);
  const pending = api.runDelivery(input);
  input.seed = 123;
  input.messages[0]!.id = "changed";
  expect(await pending).toEqual(baselineResult);
  expect(fetch.mock.calls[0]![0]).toBe(
    "/api/v1/simulations/queues-delivery/runs",
  );
  expect(fetch.mock.calls[0]![1].method).toBe("POST");
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(baselineInput);
});
it.each([400, 413, 422, 503])(
  "preserves actual error status %s and field guidance instead of a trace",
  async (status) => {
    respond(
      {
        message: "Keep this workload and retry explicitly.",
        fieldErrors: { processingTimeMs: "Review this value." },
      },
      status,
    );
    await expect(api.runDelivery(baselineInput)).rejects.toMatchObject({
      name: "ApiClientError",
      status,
      message: "Keep this workload and retry explicitly.",
      fieldErrors: { processingTimeMs: "Review this value." },
    });
  },
);
it("reports incompatible success as an actionable compatibility error, not backend unreachability", async () => {
  respond({ ...baselineResult, seed: 43 });
  await expect(api.runDelivery(baselineInput)).rejects.toThrow(
    "This delivery response is incompatible with this app.",
  );
  respond(baselineResult);
  await expect(
    api.runDelivery({ ...baselineInput, processingTimeMs: 80 }),
  ).rejects.toThrow("This delivery response is incompatible with this app.");
  respond({ ...descriptor, modelVersion: "2.0.0" });
  await expect(api.deliveryDescriptor()).rejects.toThrow(
    "This delivery response is incompatible with this app.",
  );
});
it("rejects a non-JSON successful response with the delivery compatibility explanation", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Not JSON");
      },
    }),
  );
  await expect(api.runDelivery(baselineInput)).rejects.toThrow(
    "This delivery response is incompatible with this app.",
  );
});
it("retains the shared offline error when no Java response arrives", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  await expect(api.runDelivery(baselineInput)).rejects.toEqual(
    new ApiClientError(
      "Cannot reach the Java backend. Start it and try again.",
    ),
  );
});
