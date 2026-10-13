import baselineInput from "../../../../contracts/examples/data-access-baseline-input.json";
import baselineResult from "../../../../contracts/examples/data-access-baseline-result.json";
import type {
  DataAccessDescriptor,
  DataAccessInput,
  DataAccessResult,
} from "../../api/types";

// These baseline artifacts are authored by the actual Java serialization test.
export const input = baselineInput as DataAccessInput;
export const result = baselineResult as DataAccessResult;
export const descriptor: DataAccessDescriptor = {
  id: "data-access-models",
  title: "Data Models & Access Patterns",
  kind: "simulation",
  modelVersion: "1.0.0",
  description: "A finite sequential access-path teaching model.",
  limits: {
    maxInitialRows: 20,
    maxOperations: 10,
    maxCreatedOrder: 1_000_000,
    maxResultRows: 30,
    maxQueryLimit: 20,
    maxIdLength: 32,
  },
  presets: [
    {
      id: "baseline",
      title: "Tenant-first lookup",
      question: "How much work finds beta's records from 20 through 30?",
      input,
    },
    {
      id: "table-scan",
      title: "Remove the secondary index",
      question: "Do the answers change, or only the access work?",
      input: { ...input, indexOrder: "NONE" },
    },
    {
      id: "time-first",
      title: "Created order first",
      question: "Which other tenants share the candidate time interval?",
      input: { ...input, indexOrder: "CREATED_TENANT" },
    },
    {
      id: "duplicate-key",
      title: "Reject a duplicate business key",
      question: "Does a new primary ID make the same business key valid?",
      input: {
        ...input,
        operations: [
          {
            id: "op1",
            kind: "INSERT",
            row: {
              id: "b5",
              tenant: "beta",
              businessKey: "k2",
              createdOrder: 25,
            },
          },
          ...input.operations,
        ],
      },
    },
  ],
  assumptions: result.assumptions,
};
