import type { components } from "./generated";

export type DataAccessInput = components["schemas"]["DataAccessInput"];
export type DataAccessResult = components["schemas"]["DataAccessResult"];
export type DataAccessDescriptor =
  components["schemas"]["DataAccessDescriptor"];
export type DataAccessRow = components["schemas"]["DataAccessRow"];
export type DataAccessOperation = components["schemas"]["DataAccessOperation"];
export type DataAccessOutcome = components["schemas"]["DataAccessOutcome"];
export type DataAccessWork = components["schemas"]["DataAccessWork"];
export type DataAccessLimits = components["schemas"]["DataAccessLimits"];

// Application names are aliases over the generated OpenAPI contract. Add a
// schema to contracts/openapi.json before using a new API shape in the UI.
export type CatalogEntry = components["schemas"]["CatalogEntry"];
export type CaseStudyDetail = components["schemas"]["CaseStudyDetail"];
export type Workshop = components["schemas"]["Workshop"];
export type WorkshopStage = components["schemas"]["WorkshopStage"];
export type Capability = CatalogEntry["capabilities"][number];
export type QuestionOption = components["schemas"]["QuestionOption"];
export type Question = components["schemas"]["Question"];
export type TopicDetail = components["schemas"]["TopicDetail"];
export type GuidedCheckpoint = components["schemas"]["GuidedCheckpoint"];
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

export type WorkshopWalkthrough = components["schemas"]["WorkshopWalkthrough"];

export type SearchResponse = components["schemas"]["SearchResponse"];
export type SearchHit = components["schemas"]["SearchHit"];

export type LearningPath = components["schemas"]["LearningPath"];
export type LearningPathStep = components["schemas"]["LearningPathStep"];

export type QueueCapacityInput = components["schemas"]["QueueCapacityInput"];
export type QueueCapacityResult = components["schemas"]["QueueCapacityResult"];
export type QueueCapacityEvent = components["schemas"]["QueueCapacityEvent"];
export type QueueCapacityState = components["schemas"]["QueueCapacityState"];
export type QueueCapacityOutcome =
  components["schemas"]["QueueCapacityOutcome"];
export type QueueCapacityMetrics =
  components["schemas"]["QueueCapacityMetrics"];
export type QueueCapacityDescriptor =
  components["schemas"]["QueueCapacityDescriptor"];
export type QueueCapacityLimits = components["schemas"]["QueueCapacityLimits"];
export type QueueCapacityPreset = components["schemas"]["QueueCapacityPreset"];

export type DeliveryInput = components["schemas"]["DeliveryInput"];
export type DeliveryResult = components["schemas"]["DeliveryResult"];
export type DeliveryDescriptor = components["schemas"]["DeliveryDescriptor"];
export type DeliveryLimits = components["schemas"]["DeliveryLimits"];
export type DeliveryPreset = components["schemas"]["DeliveryPreset"];
export type DeliveryEvent = components["schemas"]["DeliveryEvent"];
export type DeliveryState = components["schemas"]["DeliveryState"];
export type DeliveryChanges = components["schemas"]["DeliveryChanges"];
export type DeliveryMessage = components["schemas"]["DeliveryMessage"];
export type DeliveryConsumer = components["schemas"]["DeliveryConsumer"];
export type DeliveryAttempt = components["schemas"]["DeliveryAttempt"];
export type DeliveryLedgerEntry = components["schemas"]["DeliveryLedgerEntry"];
export type DeliveryMetrics = components["schemas"]["DeliveryMetrics"];
export type DeliveryMessageOutcome =
  components["schemas"]["DeliveryMessageOutcome"];
export type DeliveryFailureOutcome =
  components["schemas"]["DeliveryFailureOutcome"];
export type DeliveryLostAcknowledgmentOutcome =
  components["schemas"]["DeliveryLostAcknowledgmentOutcome"];

export type ReservationInput = components["schemas"]["ReservationInput"];
export type ReservationResult = components["schemas"]["ReservationResult"];
export type ReservationDescriptor =
  components["schemas"]["ReservationDescriptor"];
export type ReservationLimits = components["schemas"]["ReservationLimits"];
export type ReservationPreset = components["schemas"]["ReservationPreset"];
export type ReservationRequest = components["schemas"]["ReservationRequest"];
export type ReservationStep = components["schemas"]["ReservationStep"];
export type ReservationActorState =
  components["schemas"]["ReservationActorState"];
export type ReservationAllocation =
  components["schemas"]["ReservationAllocation"];
export type ReservationInvariants =
  components["schemas"]["ReservationInvariants"];
export type ReservationState = components["schemas"]["ReservationState"];
export type ReservationOutcome = components["schemas"]["ReservationOutcome"];
export type ReservationMetrics = components["schemas"]["ReservationMetrics"];
export type AtomicityInput = components["schemas"]["AtomicityInput"];
export type AtomicityResult = components["schemas"]["AtomicityResult"];
export type AtomicityDescriptor = components["schemas"]["AtomicityDescriptor"];
export type AtomicityLimits = components["schemas"]["AtomicityLimits"];
export type AtomicityPreset = components["schemas"]["AtomicityPreset"];
export type AtomicityIdentifier = components["schemas"]["AtomicityIdentifier"];
export type AtomicityTransaction =
  components["schemas"]["AtomicityTransaction"];
export type AtomicityStep = components["schemas"]["AtomicityStep"];
export type AtomicityPendingAllocation =
  components["schemas"]["AtomicityPendingAllocation"];
export type AtomicityAllocation = components["schemas"]["AtomicityAllocation"];
export type AtomicityTransactionState =
  components["schemas"]["AtomicityTransactionState"];
export type AtomicityInvariants = components["schemas"]["AtomicityInvariants"];
export type AtomicityState = components["schemas"]["AtomicityState"];
export type AtomicityOutcome = components["schemas"]["AtomicityOutcome"];
export type AtomicityMetrics = components["schemas"]["AtomicityMetrics"];

export type RetryInput = components["schemas"]["RetryInput"];
export type RetryResult = components["schemas"]["RetryResult"];
export type RetryDescriptor = components["schemas"]["RetryDescriptor"];
export type RetryLimits = components["schemas"]["RetryLimits"];
export type RetryPreset = components["schemas"]["RetryPreset"];
export type RetryRequest = components["schemas"]["RetryRequest"];
export type RetryState = components["schemas"]["RetryState"];
export type RetryRequestState = components["schemas"]["RetryRequestState"];
export type RetryAttemptState = components["schemas"]["RetryAttemptState"];
export type RetryWorkerState = components["schemas"]["RetryWorkerState"];
export type RetryEvent = components["schemas"]["RetryEvent"];
export type RetryMetrics = RetryResult["metrics"];
