import baselineInput from "../../../../contracts/examples/transactions-isolation-baseline-input.json";
import baselineResult from "../../../../contracts/examples/transactions-isolation-baseline-result.json";
import conditionalInput from "../../../../contracts/examples/transactions-isolation-protected-input.json";
import conditionalResult from "../../../../contracts/examples/transactions-isolation-protected-result.json";
import type {
  ReservationDescriptor,
  ReservationInput,
  ReservationResult,
} from "../../api/types";

// Complete artifacts serialized by Java, rather than UI-generated outcomes.
export const input = baselineInput as ReservationInput;
export const result = baselineResult as ReservationResult;
export const protectedInput = conditionalInput as ReservationInput;
export const protectedResult = conditionalResult as ReservationResult;
export const descriptor: ReservationDescriptor = {
  id: "transactions-isolation",
  title: "Transactions & Isolation",
  kind: "simulation",
  modelVersion: "1.0.0",
  description:
    "Compare saved reads with a current-stock conditional reservation.",
  limits: {
    maxInitialUnits: 20,
    minReservations: 2,
    maxReservations: 4,
    maxQuantity: 20,
    maxSteps: 8,
    maxIdLength: 32,
  },
  presets: [
    {
      id: "unsafe-baseline",
      title: "Both read one unit",
      description: "Two distinct reservations read the same last unit.",
      input,
    },
    {
      id: "protected-baseline",
      title: "Check current stock atomically",
      description:
        "Check and allocate from current stock in one modeled action.",
      input: protectedInput,
    },
  ],
  assumptions: result.assumptions,
};
