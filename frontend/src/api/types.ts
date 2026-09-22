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
export type RequestOutcome = components["schemas"]["RequestOutcome"];
export type RequestFlowResult = components["schemas"]["RequestFlowResult"];
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
