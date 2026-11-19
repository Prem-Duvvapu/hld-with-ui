import type { IdempotencyResult, IdempotencyCallState } from "../../api/types";
type Outcome = IdempotencyResult["outcomes"][number];
type Call = IdempotencyCallState;
export const outcomeLabels: Record<Outcome["kind"], string> = {
  LOOKUP_BYPASSED: "Key lookup bypassed",
  LOOKUP_MISSED: "No active result found",
  LOOKUP_REPLAYED: "Original receipt found",
  LOOKUP_CONFLICT: "Payload differs from retained result",
  EFFECT_PUBLISHED: "Effect added to public ledger",
  EFFECT_PREPARED: "Work prepared privately",
  ACTION_SKIPPED: "Business action skipped",
  RESULT_READY: "Receipt ready without retention",
  RESULT_STORED: "Receipt retained after earlier effect",
  RESULT_SAVE_CONFLICT: "Another result won; earlier effect remains",
  ATOMIC_COMMITTED: "Effect and receipt published together",
  REPLAYED_AT_COMMIT: "Publication recheck reuses original receipt",
  CONFLICT_AT_COMMIT: "Publication recheck rejects changed payload",
  RESPONSE_RECEIVED: "Caller received the response",
  RESPONSE_LOST: "Caller did not receive the response",
  HANDLER_CRASHED: "Handler stopped; public state remains",
};
export const phaseLabels: Record<Call["phase"], string> = {
  NOT_STARTED: "Not started",
  LOOKED_UP: "Key lookup finished",
  WORK_DONE: "Write/preparation step finished",
  RESULT_READY: "Result ready",
  RESPONDED: "Response received",
  RESPONSE_LOST: "Response lost",
  CRASHED: "Handler crashed",
};
export const resolutionLabels: Record<
  NonNullable<Call["resolution"]>,
  string
> = {
  EXECUTED: "Executed",
  REPLAYED: "Original receipt reused",
  PAYLOAD_CONFLICT: "Payload conflict",
  RESULT_SAVE_CONFLICT: "Result-save conflict",
};
export const lookupLabels: Record<
  NonNullable<Call["lookupDisposition"]>,
  string
> = {
  BYPASSED: "Bypassed",
  MISSING: "Missing",
  MATCHED: "Matching payload",
  CONFLICT: "Different payload",
};
export function callerObservation(call: Call): string {
  if (call.phase === "RESPONDED")
    return call.receipt ? "Receipt received" : "Error received";
  if (call.phase === "RESPONSE_LOST") return "No response received (lost)";
  if (call.phase === "CRASHED") return "No response received (handler crashed)";
  return "No response received yet";
}
