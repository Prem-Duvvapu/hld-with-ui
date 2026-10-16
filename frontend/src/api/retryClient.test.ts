import { afterEach, expect, it, vi } from "vitest";
import { api, ApiClientError } from "./client";
import { descriptor, input, result } from "./retryTestFixtures";

afterEach(() => vi.unstubAllGlobals());
function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function respond(body: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(response(body, status));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
it("loads the validated descriptor from the exact Java route without executing a run", async () => {
  const fetch = respond(descriptor);
  expect(await api.retryDescriptor()).toEqual(descriptor);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]![0]).toBe("/api/v1/simulations/timeouts-retries");
  expect(fetch.mock.calls[0]![1].method).toBeUndefined();
});
it("captures nested inputs before lazy validation yields to caller edits", async () => {
  const fetch = respond(result);
  const draft = structuredClone(input);
  const pending = api.runRetry(draft);
  draft.attemptTimeoutMs = 100;
  draft.requests[0]!.id = "changed";
  draft.requests[0]!.serviceTimeMs = 1;
  expect(await pending).toEqual(result);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]![0]).toBe(
    "/api/v1/simulations/timeouts-retries/runs",
  );
  expect(fetch.mock.calls[0]![1].method).toBe("POST");
  expect(fetch.mock.calls[0]![1].headers).toEqual({
    "Content-Type": "application/json",
  });
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(input);
});
it("rejects an invalid workload before making a POST", async () => {
  const fetch = respond(result);
  await expect(api.runRetry({ ...input, requests: [] })).rejects.toMatchObject({
    name: "ApiClientError",
  });
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps compatibility failures distinct from offline errors for malformed and unrelated successes", async () => {
  for (const body of [
    null,
    { ...result, modelVersion: "2.0.0" },
    { ...result, input: { ...input, attemptTimeoutMs: 100 } },
  ]) {
    respond(body);
    await expect(api.runRetry(input)).rejects.toMatchObject({
      name: "ApiClientError",
      message: expect.stringContaining("incompatible"),
    });
  }
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
  await expect(api.runRetry(input)).rejects.toThrow("incompatible");
});
it("supports explicit descriptor retry after an incompatible response without caching the failure", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response({ ...descriptor, modelVersion: "2.0.0" }))
    .mockResolvedValueOnce(response(descriptor));
  vi.stubGlobal("fetch", fetch);
  await expect(api.retryDescriptor()).rejects.toThrow("incompatible");
  expect(await api.retryDescriptor()).toEqual(descriptor);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("preserves Java overload status and field guidance until an explicit retry succeeds", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      response(
        {
          message: "Keep inputs and retry.",
          fieldErrors: { requests: "Reduce this workload." },
        },
        503,
      ),
    )
    .mockResolvedValueOnce(response(result));
  vi.stubGlobal("fetch", fetch);
  await expect(api.runRetry(input)).rejects.toMatchObject({
    name: "ApiClientError",
    status: 503,
    message: "Keep inputs and retry.",
    fieldErrors: { requests: "Reduce this workload." },
  });
  expect(fetch).toHaveBeenCalledOnce();
  expect(await api.runRetry(input)).toEqual(result);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("retains shared offline guidance when the Java backend returns no response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  await expect(api.runRetry(input)).rejects.toEqual(
    new ApiClientError(
      "Cannot reach the Java backend. Start it and try again.",
    ),
  );
});
it("preserves malformed, body-limit and result-limit statuses without automatic retry or a fabricated trace", async () => {
  for (const [status, message] of [
    [400, "Check the retry workload."],
    [413, "Reduce the input body."],
    [422, "Reduce the returned workload."],
    [500, "The server could not complete the request."],
  ] as const) {
    const fetch = respond({ message, fieldErrors: {} }, status);
    await expect(api.runRetry(input)).rejects.toMatchObject({
      name: "ApiClientError",
      status,
      message,
    });
    expect(fetch).toHaveBeenCalledOnce();
  }
});
