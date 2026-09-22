export type Capability = "study" | "simulation" | "practice";

export interface CatalogEntry {
  id: string;
  kind: "topic" | "case-study";
  title: string;
  summary: string;
  category: string;
  level: string;
  order: number;
  status: "published";
  prerequisites: string[];
  outcomes: string[];
  capabilities: Capability[];
  contentVersion: string;
}

export interface QuestionOption {
  id: string;
  label: string;
}
export interface Question {
  id: string;
  kind: "prediction" | "diagnosis" | "design-decision";
  prompt: string;
  options?: QuestionOption[];
  correctOptionId?: string;
  explanation?: string;
  followUp?: string;
  rubric?: string[];
  modelAnswer?: string;
}

export interface TopicDetail {
  topic: CatalogEntry;
  lessonMarkdown: string;
  questions: Question[];
}

export type RoutingPolicy = "ROUND_ROBIN" | "LEAST_OUTSTANDING";
export interface RequestFlowInput {
  policy: RoutingPolicy;
  arrivalTimesMs: number[];
  nodeServiceTimesMs: number[];
  workersPerNode: number;
  queueCapacity: number;
  seed: number;
}

export interface SimulationPreset {
  id: string;
  title: string;
  question: string;
  input: RequestFlowInput;
}

export interface SimulationDescriptor {
  id: string;
  title: string;
  kind: "simulation";
  modelVersion: string;
  description: string;
  limits: Record<string, number>;
  presets: SimulationPreset[];
  assumptions: string[];
}

export interface SimulationEvent {
  sequence: number;
  timeMs: number;
  kind: string;
  requestId: string | null;
  nodeId: string | null;
  message: string;
}

export interface RequestOutcome {
  requestId: string;
  nodeId: string;
  status: "COMPLETED" | "REJECTED";
  arrivalMs: number;
  startMs: number | null;
  completionMs: number | null;
  queueMs: number | null;
  serviceMs: number | null;
  latencyMs: number | null;
}

export interface RequestFlowResult {
  simulationId: "request-flow";
  modelVersion: string;
  seed: number;
  status: "completed";
  assumptions: string[];
  events: SimulationEvent[];
  outcomes: RequestOutcome[];
  metrics: {
    completed: number;
    rejected: number;
    meanLatencyMs: number | null;
    p95LatencyMs: number | null;
    throughputPerSecond: number | null;
    observationWindowMs: number;
  };
}
