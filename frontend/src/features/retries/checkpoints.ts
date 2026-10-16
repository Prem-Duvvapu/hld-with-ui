import type { GuidedCheckpoint, RetryEvent } from "../../api/types";
import { retryEventLabels } from "./retryLabels";

const requestKinds = new Set<string>([
  "REQUEST_ARRIVED",
  "REQUEST_SUCCEEDED",
  "REQUEST_FAILED",
]);

/** Select actual returned evidence by semantic identity, kind and occurrence, never by narration. */
export function resolveRetryCheckpoint(
  events: readonly RetryEvent[],
  target: GuidedCheckpoint["target"],
): number {
  if (
    !target ||
    typeof target !== "object" ||
    Array.isArray(target) ||
    !("requestId" in target)
  )
    return -1;
  const value = target as Record<string, unknown>;
  if (
    typeof value.requestId !== "string" ||
    !/^[a-z][a-z0-9-]{0,31}$/.test(value.requestId) ||
    /\s/.test(value.requestId) ||
    typeof value.kind !== "string" ||
    !Object.hasOwn(retryEventLabels, value.kind) ||
    typeof value.occurrence !== "number" ||
    !Number.isInteger(value.occurrence) ||
    Number(value.occurrence) < 1 ||
    Number(value.occurrence) > 384
  )
    return -1;
  const requestLevel = requestKinds.has(value.kind);
  if (
    Object.keys(value).sort().join(",") !==
    (requestLevel
      ? "kind,occurrence,requestId"
      : "attemptId,kind,occurrence,requestId")
  )
    return -1;
  if (
    !requestLevel &&
    (typeof value.attemptId !== "string" ||
      ![1, 2, 3, 4, 5].some(
        (number) => value.attemptId === `${value.requestId}-a${number}`,
      ))
  )
    return -1;
  let occurrence = 0;
  return events.findIndex(
    (event) =>
      event.requestId === value.requestId &&
      event.kind === value.kind &&
      (requestLevel
        ? event.attemptId === undefined
        : event.attemptId === value.attemptId) &&
      ++occurrence === value.occurrence,
  );
}
