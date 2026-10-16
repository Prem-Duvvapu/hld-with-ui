import type {
  RetryEvent,
  RetryRequestState,
  RetryAttemptState,
} from "../../api/types";
export const retryEventLabels: Record<RetryEvent["kind"], string> = {
  REQUEST_ARRIVED: "Caller arrives",
  ATTEMPT_SENT: "Attempt sent; admission pending",
  WORK_QUEUED: "Server work joins the queue",
  WORK_STARTED: "Server work starts",
  ATTEMPT_REJECTED: "Attempt rejected",
  ATTEMPT_TIMED_OUT: "Caller stops waiting for this attempt",
  WORK_COMPLETED: "Server work completes",
  RETRY_SCHEDULED: "Retry scheduled",
  RETRY_BLOCKED_BY_DEADLINE: "Retry proposal misses the deadline",
  REQUEST_SUCCEEDED: "Logical request succeeds",
  REQUEST_FAILED: "Logical request fails",
};
export const requestPhaseLabels: Record<RetryRequestState["phase"], string> = {
  NOT_ARRIVED: "Not arrived",
  READY: "Ready to send",
  WAITING: "Waiting for its active attempt",
  DECIDING_RETRY: "Deciding the retry policy",
  BACKING_OFF: "Waiting for a scheduled retry",
  AWAITING_DEADLINE: "No retry scheduled; awaiting overall deadline",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
};
export const callerLabels: Record<RetryAttemptState["callerState"], string> = {
  WAITING: "Waiting",
  REJECTED: "Rejected",
  TIMED_OUT: "Timed out",
  DEADLINE_EXCEEDED: "Overall deadline exceeded",
  RESPONDED: "Response received",
};
export const workLabels: Record<RetryAttemptState["workState"], string> = {
  PENDING_ADMISSION: "Admission pending",
  NOT_ACCEPTED: "Not accepted",
  QUEUED: "Queued",
  RUNNING: "Running",
  COMPLETED: "Completed",
};
export const retryTime = (value: number | undefined) =>
  value === undefined ? "Not observed" : `${value} ms`;
export const retryFailureLabels: Record<
  NonNullable<RetryRequestState["failureReason"]>,
  string
> = {
  ATTEMPTS_EXHAUSTED: "Maximum attempts reached",
  RETRY_BUDGET_EXHAUSTED: "Shared retry budget exhausted",
  OVERALL_DEADLINE: "Overall deadline reached",
};
export const retryCauseLabels: Record<
  NonNullable<RetryAttemptState["failureCause"]>,
  string
> = {
  DEPENDENCY_UNAVAILABLE: "Dependency unavailable",
  QUEUE_FULL: "Waiting queue full",
  ATTEMPT_TIMEOUT: "Attempt timeout reached",
};
