import Ajv2020 from "ajv/dist/2020.js";
import inputSchema from "../../../contracts/data-access.input.schema.json";
import resultSchema from "../../../contracts/data-access.result.schema.json";
import descriptorSchema from "./schemas/data-access-descriptor.schema.json";
import type {
  DataAccessDescriptor,
  DataAccessInput,
  DataAccessResult,
  DataAccessRow,
} from "./types";

const ajv = new Ajv2020({
  allErrors: false,
  strict: true,
  strictRequired: false,
});
const validInput = ajv.compile(inputSchema);
const validResult = ajv.compile(resultSchema);
const validDescriptor = ajv.compile(descriptorSchema);
const unique = (values: readonly string[]) =>
  new Set(values).size === values.length;
export class DataAccessCompatibilityError extends Error {
  constructor() {
    super(
      "This data-access response is incompatible with this app. Refresh and try again. If this continues, update the frontend and backend together.",
    );
    this.name = "DataAccessCompatibilityError";
  }
}
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => sameValue(value, b[index]))
    );
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.keys(left).every(
      (key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]),
    )
  );
}
function inputReferences(input: DataAccessInput) {
  return (
    unique(input.rows.map((row) => row.id)) &&
    unique(input.operations.map((op) => op.id)) &&
    (!input.enforceBusinessKey ||
      unique(input.rows.map((row) => `${row.tenant}/${row.businessKey}`))) &&
    input.operations.every(
      (operation) =>
        operation.kind === "INSERT" ||
        operation.kind === "LOOKUP_ID" ||
        operation.fromCreatedOrder <= operation.toCreatedOrder,
    )
  );
}
export function assertDataAccessInput(body: unknown): void {
  if (!validInput(body))
    throw new Error(
      `Check the access-analysis input: ${validInput.errors?.[0]?.instancePath || "/"} ${validInput.errors?.[0]?.message || "invalid fields"}.`,
    );
  if (!inputReferences(body as DataAccessInput))
    throw new Error(
      "Check unique record and operation IDs, tenant-scoped business keys, and inclusive range bounds.",
    );
}
export function assertDataAccessDescriptor(body: unknown): void {
  if (!validDescriptor(body)) throw new DataAccessCompatibilityError();
  const value = body as DataAccessDescriptor;
  if (
    !unique(value.presets.map((preset) => preset.id)) ||
    !value.presets.some((preset) => preset.id === "baseline") ||
    !value.presets.every((preset) => inputReferences(preset.input))
  )
    throw new DataAccessCompatibilityError();
}
export function assertDataAccessResult(
  body: unknown,
  submitted: DataAccessInput,
): void {
  if (!validResult(body)) throw new DataAccessCompatibilityError();
  const result = body as DataAccessResult;
  if (
    !sameValue(result.input, submitted) ||
    !inputReferences(result.input) ||
    result.outcomes.length !== submitted.operations.length ||
    !unique(result.finalRows.map((row) => row.id))
  )
    throw new DataAccessCompatibilityError();
  // Apply only Java's reported accepted inserts. This checks evidence references and captured
  // state; it never chooses an access path, evaluates a query or computes result metrics.
  const known = new Map<string, DataAccessRow>(
    submitted.rows.map((row) => [row.id, row]),
  );
  for (let index = 0; index < result.outcomes.length; index++) {
    const outcome = result.outcomes[index]!,
      operation = submitted.operations[index]!;
    if (
      operation.kind === "LOOKUP_ID" &&
      outcome.candidateIds.some((id) => id !== operation.rowId)
    )
      throw new DataAccessCompatibilityError();
    if (operation.kind === "TENANT_RANGE" || operation.kind === "ALL_RANGE") {
      const declaredPath = {
        NONE: "TABLE_SCAN",
        TENANT_CREATED: "TENANT_CREATED_INDEX",
        CREATED_TENANT: "CREATED_TENANT_INDEX",
      }[submitted.indexOrder];
      if (
        outcome.accessPath !== declaredPath ||
        outcome.returnedIds.length > operation.limit
      )
        throw new DataAccessCompatibilityError();
    }
    if (
      outcome.operationId !== operation.id ||
      outcome.kind !== operation.kind ||
      outcome.recordCountBefore !== known.size ||
      ![outcome.candidateIds, outcome.matchedIds, outcome.returnedIds].every(
        (ids) => unique(ids) && ids.every((id) => known.has(id)),
      ) ||
      !outcome.matchedIds.every((id) => outcome.candidateIds.includes(id)) ||
      !outcome.returnedIds.every(
        (id, position) => outcome.matchedIds[position] === id,
      ) ||
      (outcome.conflict && !known.has(outcome.conflict.recordId))
    )
      throw new DataAccessCompatibilityError();
    if (operation.kind === "INSERT" && outcome.accepted) {
      if (
        known.has(operation.row.id) ||
        (submitted.enforceBusinessKey &&
          Array.from(known.values()).some(
            (row) =>
              row.tenant === operation.row.tenant &&
              row.businessKey === operation.row.businessKey,
          ))
      )
        throw new DataAccessCompatibilityError();
      known.set(operation.row.id, operation.row);
    }
    if (operation.kind === "INSERT" && outcome.conflict) {
      const conflict = known.get(outcome.conflict.recordId);
      if (
        !conflict ||
        (outcome.conflict.reason === "DUPLICATE_ID"
          ? conflict.id !== operation.row.id
          : !submitted.enforceBusinessKey ||
            conflict.tenant !== operation.row.tenant ||
            conflict.businessKey !== operation.row.businessKey ||
            known.has(operation.row.id))
      )
        throw new DataAccessCompatibilityError();
    }
    if (outcome.recordCountAfter !== known.size)
      throw new DataAccessCompatibilityError();
  }
  if (!sameValue(result.finalRows, Array.from(known.values())))
    throw new DataAccessCompatibilityError();
}
