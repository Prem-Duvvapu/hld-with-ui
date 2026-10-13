import { afterEach, expect, it, vi } from "vitest";
import { api, ApiClientError } from "./client";
import {
  descriptor,
  input,
  result,
} from "../features/data-access/dataAccessTestFixtures";
import type { DataAccessInput } from "./types";

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
  expect(await api.dataAccessDescriptor()).toEqual(descriptor);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]![0]).toBe(
    "/api/v1/simulations/data-access-models",
  );
  expect(fetch.mock.calls[0]![1].method).toBeUndefined();
});
it("captures nested inputs before lazy validation yields to caller edits", async () => {
  const fetch = respond(result);
  const draft = structuredClone(input);
  const pending = api.runDataAccess(draft);
  draft.indexOrder = "NONE";
  draft.rows[0]!.id = "changed";
  const operation = draft.operations[0]!;
  if (operation.kind === "TENANT_RANGE") operation.limit = 1;
  expect(await pending).toEqual(result);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]![0]).toBe(
    "/api/v1/simulations/data-access-models/runs",
  );
  expect(fetch.mock.calls[0]![1].method).toBe("POST");
  expect(fetch.mock.calls[0]![1].headers).toEqual({
    "Content-Type": "application/json",
  });
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(input);
});
it("rejects invalid input with useful field guidance before making a POST", async () => {
  const fetch = respond(result);
  await expect(
    api.runDataAccess({ ...input, operations: [] }),
  ).rejects.toMatchObject({
    name: "ApiClientError",
    message: expect.stringContaining("Check the access-analysis input"),
  });
  expect(fetch).not.toHaveBeenCalled();
  await expect(
    api.runDataAccess({
      ...input,
      operations: [
        {
          id: "q1",
          kind: "ALL_RANGE",
          fromCreatedOrder: 30,
          toCreatedOrder: 20,
          limit: 20,
        },
      ],
    } as DataAccessInput),
  ).rejects.toThrow("inclusive range bounds");
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps compatibility failures distinct from offline errors for malformed and unrelated successes", async () => {
  for (const body of [
    null,
    { ...result, modelVersion: "2.0.0" },
    { ...result, input: { ...input, indexOrder: "NONE" } },
  ]) {
    respond(body);
    await expect(api.runDataAccess(input)).rejects.toMatchObject({
      name: "ApiClientError",
      message: expect.stringContaining(
        "This data-access response is incompatible",
      ),
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
  await expect(api.runDataAccess(input)).rejects.toThrow(
    "This data-access response is incompatible",
  );
});
it("supports explicit descriptor retry after an incompatible response without caching the failure", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response({ ...descriptor, modelVersion: "2.0.0" }))
    .mockResolvedValueOnce(response(descriptor));
  vi.stubGlobal("fetch", fetch);
  await expect(api.dataAccessDescriptor()).rejects.toThrow(
    "This data-access response is incompatible",
  );
  expect(await api.dataAccessDescriptor()).toEqual(descriptor);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("preserves Java overload status and field guidance until an explicit retry succeeds", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      response(
        {
          message: "Keep inputs and retry.",
          fieldErrors: { operations: "Reduce this workload." },
        },
        503,
      ),
    )
    .mockResolvedValueOnce(response(result));
  vi.stubGlobal("fetch", fetch);
  await expect(api.runDataAccess(input)).rejects.toMatchObject({
    name: "ApiClientError",
    status: 503,
    message: "Keep inputs and retry.",
    fieldErrors: { operations: "Reduce this workload." },
  });
  expect(fetch).toHaveBeenCalledOnce();
  expect(await api.runDataAccess(input)).toEqual(result);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("retains shared offline guidance when the Java backend returns no response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  await expect(api.runDataAccess(input)).rejects.toEqual(
    new ApiClientError(
      "Cannot reach the Java backend. Start it and try again.",
    ),
  );
});
