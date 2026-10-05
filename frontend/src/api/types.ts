import type { components } from "./generated";

// Application names are aliases over the generated OpenAPI contract. Add a
// schema to contracts/openapi.json before using a new API shape in the UI.
export type CatalogEntry = components["schemas"]["CatalogEntry"];
export type Capability = CatalogEntry["capabilities"][number];
export type QuestionOption = components["schemas"]["QuestionOption"];
export type Question = components["schemas"]["Question"];
export type TopicDetail = components["schemas"]["TopicDetail"];
export type RequestFlowInput = components["schemas"]["RequestFlowInput"];
export type RoutingPolicy = RequestFlowInput["policy"];
export type SimulationPreset = components["schemas"]["SimulationPreset"];
export type SimulationDescriptor =
  components["schemas"]["SimulationDescriptor"];
export type SimulationEvent = components["schemas"]["SimulationEvent"];
export type FailureScheduleEntry =
  components["schemas"]["FailureScheduleEntry"];
export type RequestOutcome = components["schemas"]["RequestOutcome"];
export type RequestFlowResult = components["schemas"]["RequestFlowResult"];
export type RateLimiterInput = components["schemas"]["RateLimiterInput"];
export type RateLimiterResult = components["schemas"]["RateLimiterResult"];
export type RateLimiterDescriptor =
  components["schemas"]["RateLimiterDescriptor"];
export type CapacityEstimateInput =
  components["schemas"]["CapacityEstimateInput"];
export type CapacityMetrics = components["schemas"]["CapacityMetrics"];
export type CalculationStep = components["schemas"]["CalculationStep"];
export type SensitivityPoint = components["schemas"]["SensitivityPoint"];
export type CapacityEstimateResult =
  components["schemas"]["CapacityEstimateResult"];
export type CapacityEstimatorDescriptor =
  components["schemas"]["CapacityEstimatorDescriptor"];
export type ApiError = components["schemas"]["ApiError"];
export type CacheOperation = components["schemas"]["CacheOperation"];
export type CacheAsideInput = components["schemas"]["CacheAsideInput"];
export type CacheGetOutcome = components["schemas"]["CacheGetOutcome"];
export type CacheAsideMetrics = components["schemas"]["CacheAsideMetrics"];
export type CacheAsideResult = components["schemas"]["CacheAsideResult"];
export type CacheAsidePreset = components["schemas"]["CacheAsidePreset"];
export type CacheAsideDescriptor =
  components["schemas"]["CacheAsideDescriptor"];
export type CacheAsideEvent = components["schemas"]["CacheAsideEvent"];
export type CacheAsideLimits = components["schemas"]["CacheAsideLimits"];
export type CacheEntryState = components["schemas"]["CacheEntryState"];
export type OriginValueState = components["schemas"]["OriginValueState"];
