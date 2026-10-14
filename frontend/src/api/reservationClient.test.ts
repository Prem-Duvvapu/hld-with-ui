import { afterEach, expect, it, vi } from "vitest";
import { api, ApiClientError } from "./client";
import {
  descriptor,
  input,
  result,
} from "../features/reservations/reservationTestFixtures";

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
  expect(await api.reservationDescriptor()).toEqual(descriptor);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]![0]).toBe(
    "/api/v1/simulations/transactions-isolation",
  );
  expect(fetch.mock.calls[0]![1].method).toBeUndefined();
});
it("captures nested inputs before lazy validation yields to caller edits", async () => {
  const fetch = respond(result);
  const draft = structuredClone(input);
  const pending = api.runReservation(draft);
  draft.strategy = "ATOMIC_CONDITIONAL_RESERVATION";
  draft.reservations[0]!.id = "changed";
  draft.schedule[0]!.id = "changed-step";
  expect(await pending).toEqual(result);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]![0]).toBe(
    "/api/v1/simulations/transactions-isolation/runs",
  );
  expect(fetch.mock.calls[0]![1].method).toBe("POST");
  expect(fetch.mock.calls[0]![1].headers).toEqual({
    "Content-Type": "application/json",
  });
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(input);
});
it("rejects an illegal schedule before making a POST", async () => {
  const fetch = respond(result);
  await expect(
    api.runReservation({ ...input, schedule: [] }),
  ).rejects.toMatchObject({ name: "ApiClientError" });
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps compatibility failures distinct from offline errors for malformed and unrelated successes", async () => {
  for (const body of [
    null,
    { ...result, modelVersion: "2.0.0" },
    { ...result, input: { ...input, initialUnits: 2 } },
  ]) {
    respond(body);
    await expect(api.runReservation(input)).rejects.toMatchObject({
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
  await expect(api.runReservation(input)).rejects.toThrow("incompatible");
});
it("supports explicit descriptor retry after an incompatible response without caching the failure", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response({ ...descriptor, modelVersion: "2.0.0" }))
    .mockResolvedValueOnce(response(descriptor));
  vi.stubGlobal("fetch", fetch);
  await expect(api.reservationDescriptor()).rejects.toThrow("incompatible");
  expect(await api.reservationDescriptor()).toEqual(descriptor);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("preserves Java overload status and field guidance until an explicit retry succeeds", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      response(
        {
          message: "Keep inputs and retry.",
          fieldErrors: { schedule: "Reduce this workload." },
        },
        503,
      ),
    )
    .mockResolvedValueOnce(response(result));
  vi.stubGlobal("fetch", fetch);
  await expect(api.runReservation(input)).rejects.toMatchObject({
    name: "ApiClientError",
    status: 503,
    message: "Keep inputs and retry.",
    fieldErrors: { schedule: "Reduce this workload." },
  });
  expect(fetch).toHaveBeenCalledOnce();
  expect(await api.runReservation(input)).toEqual(result);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("retains shared offline guidance when the Java backend returns no response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  await expect(api.runReservation(input)).rejects.toEqual(
    new ApiClientError(
      "Cannot reach the Java backend. Start it and try again.",
    ),
  );
});
