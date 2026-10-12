import {
  assertQueueCompatibility,
  assertQueueRunInput,
  QueueCompatibilityError,
} from "./queueCompatibility";
import {
  assertCacheCompatibility,
  CacheCompatibilityError,
} from "./cacheCompatibility";
import type {
  DeliveryDescriptor,
  DeliveryInput,
  DeliveryResult,
  QueueCapacityDescriptor,
  QueueCapacityInput,
  QueueCapacityResult,
  LearningPath,
  SearchResponse,
  CatalogEntry,
  CaseStudyDetail,
  CacheAsideDescriptor,
  CacheAsideInput,
  CacheAsideResult,
  CapacityEstimateInput,
  CapacityEstimateResult,
  CapacityEstimatorDescriptor,
  RequestFlowInput,
  RequestFlowResult,
  RateLimiterDescriptor,
  RateLimiterInput,
  RateLimiterResult,
  SimulationDescriptor,
  TopicDetail,
} from "./types";

function deliveryValidation(validate: (body: unknown) => void) {
  return (body: unknown) => {
    try {
      validate(body);
    } catch (error) {
      // Convert inside the validation boundary so lazy compatibility errors retain their explanation.
      throw new ApiClientError(
        error instanceof Error
          ? error.message
          : "This delivery response is incompatible with this app.",
      );
    }
  };
}

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

async function request<T>(
  path: string,
  init?: RequestInit,
  validate?: (body: unknown) => void,
): Promise<T> {
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
    validate?.(body);
    return body as T;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (
      error instanceof CacheCompatibilityError ||
      error instanceof QueueCompatibilityError
    ) {
      throw new ApiClientError(error.message);
    }
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
  deliveryDescriptor: async () => {
    const { assertDeliveryCompatibility } =
      await import("./deliveryCompatibility");
    return request<DeliveryDescriptor>(
      "/api/v1/simulations/queues-delivery",
      undefined,
      deliveryValidation((body) =>
        assertDeliveryCompatibility(body, "descriptor"),
      ),
    );
  },
  runDelivery: async (input: DeliveryInput) => {
    // Capture before the lazy import yields; edits to a caller's draft cannot change this request.
    const payload = JSON.stringify(input);
    const submitted: DeliveryInput = JSON.parse(payload);
    const { assertDeliveryCompatibility, assertDeliveryRunInput } =
      await import("./deliveryCompatibility");
    return request<DeliveryResult>(
      "/api/v1/simulations/queues-delivery/runs",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      },
      deliveryValidation((body) => {
        assertDeliveryCompatibility(body, "result");
        assertDeliveryRunInput(body as DeliveryResult, submitted);
      }),
    );
  },
  learningPath: (id: string) =>
    request<LearningPath>(`/api/v1/learning-paths/${encodeURIComponent(id)}`),
  search: (query: string, level = "", capability = "") => {
    const params = new URLSearchParams({ q: query });
    if (level) params.set("level", level);
    if (capability) params.set("capability", capability);
    return request<SearchResponse>(`/api/v1/search?${params}`);
  },
  draftTopic: (id: string) =>
    request<TopicDetail>(`/api/v1/draft/topics/${encodeURIComponent(id)}`),
  queueDescriptor: () =>
    request<QueueCapacityDescriptor>(
      "/api/v1/simulations/queues-tail-latency",
      undefined,
      (body) => assertQueueCompatibility(body, "descriptor"),
    ),
  runQueue: (input: QueueCapacityInput) =>
    request<QueueCapacityResult>(
      "/api/v1/simulations/queues-tail-latency/runs",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      (body) => {
        assertQueueCompatibility(body, "result");
        assertQueueRunInput(body as QueueCapacityResult, input);
      },
    ),
  topics: () => request<CatalogEntry[]>("/api/v1/topics"),
  topic: (id: string) => request<TopicDetail>(`/api/v1/topics/${id}`),
  caseStudies: () => request<CatalogEntry[]>("/api/v1/case-studies"),
  caseStudy: (id: string) =>
    request<CaseStudyDetail>(`/api/v1/case-studies/${encodeURIComponent(id)}`),
  descriptor: (id: string) =>
    request<SimulationDescriptor>(`/api/v1/simulations/${id}`),
  runRequestFlow: (input: RequestFlowInput) =>
    request<RequestFlowResult>("/api/v1/simulations/request-flow/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  rateLimiterDescriptor: () =>
    request<RateLimiterDescriptor>(
      "/api/v1/simulations/distributed-rate-limiter",
    ),
  runRateLimiter: (input: RateLimiterInput) =>
    request<RateLimiterResult>(
      "/api/v1/simulations/distributed-rate-limiter/runs",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    ),
  estimator: (id: string) =>
    request<CapacityEstimatorDescriptor>(`/api/v1/estimators/${id}`),
  calculateCapacity: (input: CapacityEstimateInput) =>
    request<CapacityEstimateResult>(
      "/api/v1/estimators/capacity-estimation/calculations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    ),
  cacheAsideDescriptor: () =>
    request<CacheAsideDescriptor>(
      "/api/v1/simulations/cache-aside",
      undefined,
      (body) => assertCacheCompatibility(body, "descriptor"),
    ),
  runCacheAside: (input: CacheAsideInput) =>
    request<CacheAsideResult>(
      "/api/v1/simulations/cache-aside/runs",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      (body) => assertCacheCompatibility(body, "result"),
    ),
};
