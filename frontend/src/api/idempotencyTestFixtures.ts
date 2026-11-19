import descriptorJson from "../../../contracts/examples/idempotency-descriptor.json";
import input0 from "../../../contracts/examples/idempotency-unprotected-response-loss-input.json";
import result0 from "../../../contracts/examples/idempotency-unprotected-response-loss-result.json";
import input1 from "../../../contracts/examples/idempotency-split-crash-gap-input.json";
import result1 from "../../../contracts/examples/idempotency-split-crash-gap-result.json";
import input2 from "../../../contracts/examples/idempotency-split-race-input.json";
import result2 from "../../../contracts/examples/idempotency-split-race-result.json";
import input3 from "../../../contracts/examples/idempotency-atomic-response-loss-input.json";
import result3 from "../../../contracts/examples/idempotency-atomic-response-loss-result.json";
import input4 from "../../../contracts/examples/idempotency-atomic-race-input.json";
import result4 from "../../../contracts/examples/idempotency-atomic-race-result.json";
import input5 from "../../../contracts/examples/idempotency-payload-conflict-input.json";
import result5 from "../../../contracts/examples/idempotency-payload-conflict-result.json";
import input6 from "../../../contracts/examples/idempotency-atomic-payload-race-input.json";
import result6 from "../../../contracts/examples/idempotency-atomic-payload-race-result.json";
import input7 from "../../../contracts/examples/idempotency-retention-boundary-input.json";
import result7 from "../../../contracts/examples/idempotency-retention-boundary-result.json";
import input8 from "../../../contracts/examples/idempotency-key-and-tenant-scope-input.json";
import result8 from "../../../contracts/examples/idempotency-key-and-tenant-scope-result.json";
import type {
  IdempotencyDescriptor,
  IdempotencyInput,
  IdempotencyResult,
} from "./types";

/** Actual configured-Java examples; never hand-authored simulated results. */
export const descriptor = descriptorJson as IdempotencyDescriptor;
export const pairs = [
  {
    id: "unprotected-response-loss",
    input: input0 as IdempotencyInput,
    result: result0 as IdempotencyResult,
  },
  {
    id: "split-crash-gap",
    input: input1 as IdempotencyInput,
    result: result1 as IdempotencyResult,
  },
  {
    id: "split-race",
    input: input2 as IdempotencyInput,
    result: result2 as IdempotencyResult,
  },
  {
    id: "atomic-response-loss",
    input: input3 as IdempotencyInput,
    result: result3 as IdempotencyResult,
  },
  {
    id: "atomic-race",
    input: input4 as IdempotencyInput,
    result: result4 as IdempotencyResult,
  },
  {
    id: "payload-conflict",
    input: input5 as IdempotencyInput,
    result: result5 as IdempotencyResult,
  },
  {
    id: "atomic-payload-race",
    input: input6 as IdempotencyInput,
    result: result6 as IdempotencyResult,
  },
  {
    id: "retention-boundary",
    input: input7 as IdempotencyInput,
    result: result7 as IdempotencyResult,
  },
  {
    id: "key-and-tenant-scope",
    input: input8 as IdempotencyInput,
    result: result8 as IdempotencyResult,
  },
];
export const input = pairs[0]!.input;
export const result = pairs[0]!.result;
export const splitInput = pairs[1]!.input;
export const splitResult = pairs[1]!.result;
export const atomicInput = pairs[3]!.input;
export const atomicResult = pairs[3]!.result;
