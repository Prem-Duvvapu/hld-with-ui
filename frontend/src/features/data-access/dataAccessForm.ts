import type {
  DataAccessInput,
  DataAccessOperation,
  DataAccessRow,
  DataAccessLimits,
} from "../../api/types";

export type OperationDraft = {
  uiKey: string;
  id: string;
  kind: DataAccessOperation["kind"];
  rowId: string;
  tenant: string;
  businessKey: string;
  createdOrder: string;
  fromCreatedOrder: string;
  toCreatedOrder: string;
  limit: string;
};
export type DataAccessForm = {
  indexOrder: DataAccessInput["indexOrder"];
  enforceBusinessKey: boolean;
  rowsText: string;
  operations: OperationDraft[];
};
export function operationDraft(
  operation?: DataAccessOperation,
): OperationDraft {
  const base: OperationDraft = {
    uiKey: operation?.id ?? "query-1",
    id: operation?.id ?? "query-1",
    kind: operation?.kind ?? "TENANT_RANGE",
    rowId: "b2",
    tenant: "beta",
    businessKey: "k5",
    createdOrder: "25",
    fromCreatedOrder: "20",
    toCreatedOrder: "30",
    limit: "20",
  };
  if (!operation) return base;
  if (operation.kind === "LOOKUP_ID")
    return { ...base, rowId: operation.rowId };
  if (operation.kind === "INSERT")
    return {
      ...base,
      rowId: operation.row.id,
      tenant: operation.row.tenant,
      businessKey: operation.row.businessKey,
      createdOrder: String(operation.row.createdOrder),
    };
  return {
    ...base,
    ...(operation.kind === "TENANT_RANGE" ? { tenant: operation.tenant } : {}),
    fromCreatedOrder: String(operation.fromCreatedOrder),
    toCreatedOrder: String(operation.toCreatedOrder),
    limit: String(operation.limit),
  };
}
export function toDataAccessForm(input: DataAccessInput): DataAccessForm {
  return {
    indexOrder: input.indexOrder,
    enforceBusinessKey: input.enforceBusinessKey,
    rowsText: JSON.stringify(input.rows, null, 2),
    operations: input.operations.map(operationDraft),
  };
}
const identifier = /^[a-z][a-z0-9-]{0,31}$/;
const validId = (value: unknown): value is string =>
  typeof value === "string" && identifier.test(value) && !/\s/.test(value);
function isRow(value: unknown, maximum: number): value is DataAccessRow {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const row = value as Record<string, unknown>;
  return (
    Object.keys(row).sort().join(",") ===
      "businessKey,createdOrder,id,tenant" &&
    validId(row.id) &&
    validId(row.tenant) &&
    validId(row.businessKey) &&
    typeof row.createdOrder === "number" &&
    Number.isSafeInteger(row.createdOrder) &&
    row.createdOrder >= 0 &&
    row.createdOrder <= maximum
  );
}
export function parseDataAccessForm(
  form: DataAccessForm,
  limits: DataAccessLimits,
) {
  const errors: Record<string, string> = {};
  let rows: DataAccessRow[] = [];
  try {
    if (form.rowsText.length > 32768) throw new Error("size");
    const parsed: unknown = JSON.parse(form.rowsText);
    if (
      !Array.isArray(parsed) ||
      parsed.length > limits.maxInitialRows ||
      !parsed.every((row) => isRow(row, limits.maxCreatedOrder))
    )
      throw new Error("shape");
    rows = parsed;
    if (new Set(rows.map((row) => row.id)).size !== rows.length)
      errors.rows = "Every initial record needs a different ID.";
    if (
      form.enforceBusinessKey &&
      new Set(rows.map((row) => `${row.tenant}/${row.businessKey}`)).size !==
        rows.length
    )
      errors.rows =
        "Initial records must have different business keys within each tenant while uniqueness is enabled.";
  } catch {
    errors.rows = `Enter a JSON array of 0–${limits.maxInitialRows} records with id, tenant, businessKey and integer createdOrder (0–${limits.maxCreatedOrder}). IDs use lowercase letters, digits and hyphens, starting with a letter.`;
  }
  const integer = (value: string, key: string, min: number, max: number) => {
    const parsed = value.trim() ? Number(value) : NaN;
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
      errors[key] = `Enter a whole number from ${min} to ${max}.`;
    return parsed;
  };
  const text = (value: string, key: string) => {
    if (!validId(value))
      errors[key] =
        "Use 1–32 lowercase letters, digits or hyphens, starting with a letter.";
    return value;
  };
  if (!form.operations.length || form.operations.length > limits.maxOperations)
    errors.operations = `Use 1–${limits.maxOperations} operations.`;
  const operations: DataAccessOperation[] = form.operations.map((op, i) => {
    const prefix = `operation-${i}`;
    const id = text(op.id, `${prefix}-id`);
    if (op.kind === "LOOKUP_ID")
      return { id, kind: op.kind, rowId: text(op.rowId, `${prefix}-rowId`) };
    if (op.kind === "INSERT")
      return {
        id,
        kind: op.kind,
        row: {
          id: text(op.rowId, `${prefix}-rowId`),
          tenant: text(op.tenant, `${prefix}-tenant`),
          businessKey: text(op.businessKey, `${prefix}-businessKey`),
          createdOrder: integer(
            op.createdOrder,
            `${prefix}-createdOrder`,
            0,
            limits.maxCreatedOrder,
          ),
        },
      };
    const fromCreatedOrder = integer(
      op.fromCreatedOrder,
      `${prefix}-fromCreatedOrder`,
      0,
      limits.maxCreatedOrder,
    );
    const toCreatedOrder = integer(
      op.toCreatedOrder,
      `${prefix}-toCreatedOrder`,
      0,
      limits.maxCreatedOrder,
    );
    if (fromCreatedOrder > toCreatedOrder)
      errors[`${prefix}-toCreatedOrder`] =
        "The end must be at least the start; both bounds are included.";
    const range = {
      id,
      kind: op.kind,
      fromCreatedOrder,
      toCreatedOrder,
      limit: integer(op.limit, `${prefix}-limit`, 1, limits.maxQueryLimit),
    };
    return op.kind === "TENANT_RANGE"
      ? { ...range, kind: op.kind, tenant: text(op.tenant, `${prefix}-tenant`) }
      : { ...range, kind: "ALL_RANGE" };
  });
  if (new Set(operations.map((op) => op.id)).size !== operations.length)
    errors.operations = "Give each operation a different ID.";
  const input: DataAccessInput | null = Object.keys(errors).length
    ? null
    : {
        schemaVersion: "1.0",
        modelVersion: "1.0.0",
        indexOrder: form.indexOrder,
        enforceBusinessKey: form.enforceBusinessKey,
        rows,
        operations,
      };
  return { input, errors };
}
