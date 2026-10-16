import descriptorJson from "../../../contracts/examples/timeouts-retries-descriptor.json";
import inputJson from "../../../contracts/examples/timeouts-retries-baseline-input.json";
import resultJson from "../../../contracts/examples/timeouts-retries-baseline-result.json";
import backoffInputJson from "../../../contracts/examples/timeouts-retries-backoff-input.json";
import backoffResultJson from "../../../contracts/examples/timeouts-retries-backoff-result.json";
import deadlineInputJson from "../../../contracts/examples/timeouts-retries-deadline-input.json";
import deadlineResultJson from "../../../contracts/examples/timeouts-retries-deadline-result.json";
import jitterInputJson from "../../../contracts/examples/timeouts-retries-jitter-input.json";
import jitterResultJson from "../../../contracts/examples/timeouts-retries-jitter-result.json";
import type { RetryDescriptor, RetryInput, RetryResult } from "./types";

/** Actual Java-serialized teaching evidence shared by client and renderer tests. */
export const descriptor = descriptorJson as RetryDescriptor;
export const input = inputJson as RetryInput;
export const result = resultJson as RetryResult;
export const backoffInput = backoffInputJson as RetryInput;
export const backoffResult = backoffResultJson as RetryResult;
export const deadlineInput = deadlineInputJson as RetryInput;
export const deadlineResult = deadlineResultJson as RetryResult;
export const jitterInput = jitterInputJson as RetryInput;
export const jitterResult = jitterResultJson as RetryResult;
