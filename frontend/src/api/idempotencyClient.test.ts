import { afterEach, expect, it, vi } from "vitest";
import { api, ApiClientError } from "./client";
import { descriptor, input, result } from "./idempotencyTestFixtures";

afterEach(() => vi.unstubAllGlobals());
const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
function respond(body: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(response(body, status));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
it("loads the validated idempotency descriptor without starting a run", async () => {
  const fetch = respond(descriptor);
  expect(await api.getIdempotency()).toEqual(descriptor);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]![0]).toBe("/api/v1/simulations/idempotency");
  expect(fetch.mock.calls[0]![1].method).toBeUndefined();
});
it("captures calls and schedule before lazy validation yields to edits", async () => {
  const fetch = respond(result),
    draft = structuredClone(input);
  const pending = api.runIdempotency(draft);
  draft.mode = "ATOMIC_EFFECT_RECORD";
  draft.calls[0]!.units = 1000;
  draft.schedule[0]!.callId = "edited";
  expect(await pending).toEqual(result);
  expect(fetch).toHaveBeenCalledOnce();
  const [path, init] = fetch.mock.calls[0]!;
  expect(path).toBe("/api/v1/simulations/idempotency/runs");
  expect(init.method).toBe("POST");
  expect(init.headers).toEqual({ "Content-Type": "application/json" });
  expect(JSON.parse(init.body)).toEqual(input);
});
it("rejects malformed inputs and static reference errors before POST", async () => {
  const fetch = respond(result);
  await expect(
    api.runIdempotency({ ...input, calls: [] }),
  ).rejects.toMatchObject({ name: "ApiClientError" });
  const invalid = structuredClone(input);
  invalid.schedule[0]!.callId = "unknown";
  await expect(api.runIdempotency(invalid)).rejects.toMatchObject({
    name: "ApiClientError",
  });
  expect(fetch).not.toHaveBeenCalled();
});
it("distinguishes incompatible successful JSON from backend connectivity errors", async () => {
  for (const body of [
    null,
    { ...result, modelVersion: "2.0.0" },
    { ...result, input: { ...input, retentionMs: 12 } },
  ]) {
    respond(body);
    await expect(api.runIdempotency(input)).rejects.toMatchObject({
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
  await expect(api.runIdempotency(input)).rejects.toThrow("incompatible");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  await expect(api.runIdempotency(input)).rejects.toEqual(
    new ApiClientError(
      "Cannot reach the Java backend. Start it and try again.",
    ),
  );
});
it("allows an explicit descriptor retry after an incompatible response", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response({ ...descriptor, modelVersion: "2.0.0" }))
    .mockResolvedValueOnce(response(descriptor));
  vi.stubGlobal("fetch", fetch);
  await expect(api.getIdempotency()).rejects.toThrow("incompatible");
  expect(await api.getIdempotency()).toEqual(descriptor);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("preserves Java resource and validation statuses without retries or fabricated evidence", async () => {
  for (const status of [400, 413, 422, 500, 503]) {
    const fetch = respond(
      {
        message: "Keep the workload and retry explicitly.",
        fieldErrors: { schedule: "Reduce or correct this program." },
      },
      status,
    );
    await expect(api.runIdempotency(input)).rejects.toMatchObject({
      name: "ApiClientError",
      status,
      message: "Keep the workload and retry explicitly.",
      fieldErrors: { schedule: "Reduce or correct this program." },
    });
    expect(fetch).toHaveBeenCalledOnce();
  }
});
it("forwards explicit cancellation and removes the caller signal listener", async () => {
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_path: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const fail = () =>
            reject(new DOMException("Cancelled", "AbortError"));
          if (init.signal!.aborted) fail();
          else init.signal!.addEventListener("abort", fail, { once: true });
        }),
    ),
  );
  const pending = api.runIdempotency(input, controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({
    name: "ApiClientError",
    message: "The request was cancelled.",
  });
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
});
it("retains timeout guidance when the caller has not cancelled", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new DOMException("Timeout", "AbortError")),
  );
  await expect(api.getIdempotency()).rejects.toThrow(
    "The server took too long to respond.",
  );
});
