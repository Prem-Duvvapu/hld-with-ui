import type {
  CatalogEntry,
  RequestFlowInput,
  RequestFlowResult,
  SimulationDescriptor,
  TopicDetail,
} from "./types";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(path, { ...init, signal: controller.signal });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const problem = body as {
        message?: string;
        fieldErrors?: Record<string, string>;
      } | null;
      throw new ApiClientError(
        problem?.message || `Request failed with status ${response.status}.`,
        response.status,
        problem?.fieldErrors,
      );
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiClientError("The server took too long to respond.");
    }
    throw new ApiClientError(
      "Cannot reach the Java backend. Start it and try again.",
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export const api = {
  topics: () => request<CatalogEntry[]>("/api/v1/topics"),
  topic: (id: string) => request<TopicDetail>(`/api/v1/topics/${id}`),
  descriptor: (id: string) =>
    request<SimulationDescriptor>(`/api/v1/simulations/${id}`),
  runRequestFlow: (input: RequestFlowInput) =>
    request<RequestFlowResult>("/api/v1/simulations/request-flow/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
};
