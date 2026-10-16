import baselineInput from "../../../../contracts/examples/transaction-atomicity-baseline-input.json";
import baselineResult from "../../../../contracts/examples/transaction-atomicity-baseline-result.json";
import stagedInput from "../../../../contracts/examples/transaction-atomicity-protected-input.json";
import stagedResult from "../../../../contracts/examples/transaction-atomicity-protected-result.json";
import contentionInput from "../../../../contracts/examples/transaction-atomicity-conflict-input.json";
import contentionResult from "../../../../contracts/examples/transaction-atomicity-conflict-result.json";
import type {
  AtomicityDescriptor,
  AtomicityInput,
  AtomicityResult,
} from "../../api/types";

// Complete artifacts from the configured Java serialization test.
export const input = baselineInput as AtomicityInput;
export const result = baselineResult as AtomicityResult;
export const protectedInput = stagedInput as AtomicityInput;
export const protectedResult = stagedResult as AtomicityResult;
export const conflictInput = contentionInput as AtomicityInput;
export const conflictResult = contentionResult as AtomicityResult;
export const descriptor: AtomicityDescriptor = {
  id: "transaction-atomicity",
  title: "Atomicity & Abort",
  kind: "simulation",
  modelVersion: "1.0.0",
  description:
    "Compare published split writes with revision-checked private work.",
  limits: {
    maxInitialUnits: 20,
    minTransactions: 1,
    maxTransactions: 3,
    maxQuantity: 20,
    minSteps: 2,
    maxSteps: 12,
    maxIdLength: 32,
  },
  presets: [
    {
      id: "baseline",
      title: "Abort between separate writes",
      description: "What remains when stock changes before its record?",
      input,
    },
    {
      id: "protected-baseline",
      title: "Discard unpublished stock work",
      description: "What does abort discard before publication?",
      input: protectedInput,
    },
    {
      id: "protected-conflict",
      title: "Two private proposals share one base",
      description:
        "Which proposal can publish after the shared revision changes?",
      input: conflictInput,
    },
  ],
  assumptions: result.assumptions,
};
