import { describe, expect, it } from "vitest";
import {
  assertDataAccessDescriptor,
  assertDataAccessInput,
  assertDataAccessResult,
  DataAccessCompatibilityError,
} from "./dataAccessCompatibility";
import {
  descriptor,
  input,
  result,
} from "../features/data-access/dataAccessTestFixtures";
import type { DataAccessResult } from "./types";

function acceptedInsert(): DataAccessResult {
  // A compatibility projection fixture; baseline `result` is the actual Java serialization.
  const value = structuredClone(result);
  const row = { id: "b5", tenant: "beta", businessKey: "k5", createdOrder: 25 };
  value.input.operations = [{ id: "write", kind: "INSERT", row }];
  const work = {
    primaryKeyLookups: 1,
    indexSeeks: 0,
    indexEntriesExamined: 0,
    baseRowsExamined: 0,
    matchedRows: 0,
    returnedRows: 0,
    baseWrites: 1,
    secondaryIndexWrites: 1,
    businessKeyChecks: 1,
    businessKeyWrites: 1,
  };
  value.outcomes = [
    {
      operationId: "write",
      kind: "INSERT",
      accessPath: "INSERT",
      candidateIds: [],
      matchedIds: [],
      returnedIds: [],
      recordCountBefore: 12,
      recordCountAfter: 13,
      accepted: true,
      work,
      explanation: "One reported accepted insert.",
    },
  ];
  value.totals = { ...work };
  // HTTP JSON contains separate row values in captured input and returned evidence.
  value.finalRows.push(structuredClone(row));
  return value;
}

describe("canonical data-access compatibility", () => {
  it("accepts actual Java baseline evidence and descriptor without changing them", () => {
    const original = JSON.stringify({ descriptor, input, result });
    expect(() => assertDataAccessInput(input)).not.toThrow();
    expect(() => assertDataAccessDescriptor(descriptor)).not.toThrow();
    expect(() => assertDataAccessResult(result, input)).not.toThrow();
    expect(JSON.stringify({ descriptor, input, result })).toBe(original);
  });
  it("rejects malformed scalars, closed variant mixing, unsupported versions and unknown result fields", () => {
    for (const body of [
      null,
      false,
      42,
      "analysis",
      [],
      {},
      { ...result, modelVersion: "2.0.0" },
      { ...result, schemaVersion: "2.0" },
      { ...result, kind: "benchmark" },
      { ...result, latencyMs: 5 },
    ])
      expect(() => assertDataAccessResult(body, input)).toThrow(
        DataAccessCompatibilityError,
      );
    for (const body of [
      null,
      [],
      { ...input, seed: 42 },
      { ...input, operations: [{ ...input.operations[0], rowId: "b2" }] },
      { ...input, enforceBusinessKey: "true" },
    ])
      expect(() => assertDataAccessInput(body)).toThrow(
        "Check the access-analysis input",
      );
  });
  it("checks semantic input identities, scoped uniqueness and inclusive range order", () => {
    const duplicateRow = structuredClone(input);
    duplicateRow.rows[1]!.id = duplicateRow.rows[0]!.id;
    const duplicateBusiness = structuredClone(input);
    duplicateBusiness.rows[1]!.businessKey =
      duplicateBusiness.rows[0]!.businessKey;
    const duplicateOperation = {
      ...input,
      operations: [...input.operations, ...input.operations],
    };
    const reversedRange = {
      ...input,
      operations: [
        {
          id: "q1",
          kind: "ALL_RANGE" as const,
          fromCreatedOrder: 30,
          toCreatedOrder: 20,
          limit: 20,
        },
      ],
    };
    for (const body of [
      duplicateRow,
      duplicateBusiness,
      duplicateOperation,
      reversedRange,
    ])
      expect(() => assertDataAccessInput(body)).toThrow(
        "Check unique record and operation IDs",
      );
    expect(() =>
      assertDataAccessInput({
        ...duplicateBusiness,
        enforceBusinessKey: false,
      }),
    ).not.toThrow();
  });
  it("accepts object key reordering while correlating arrays and meaningful captured fields", () => {
    const value = structuredClone(result);
    value.input = {
      operations: value.input.operations.map(
        (operation) =>
          Object.fromEntries(
            Object.entries(operation).reverse(),
          ) as typeof operation,
      ),
      rows: value.input.rows.map(
        ({ createdOrder, businessKey, tenant, id }) => ({
          createdOrder,
          businessKey,
          tenant,
          id,
        }),
      ),
      enforceBusinessKey: value.input.enforceBusinessKey,
      indexOrder: value.input.indexOrder,
      modelVersion: value.input.modelVersion,
      schemaVersion: value.input.schemaVersion,
    };
    expect(() => assertDataAccessResult(value, input)).not.toThrow();
    for (const submitted of [
      { ...input, indexOrder: "NONE" as const },
      { ...input, enforceBusinessKey: false },
      { ...input, rows: [...input.rows].reverse() },
      {
        ...input,
        operations: [
          {
            id: "q1",
            kind: "TENANT_RANGE" as const,
            tenant: "beta",
            fromCreatedOrder: 20,
            toCreatedOrder: 30,
            limit: 1,
          },
        ],
      },
    ])
      expect(() => assertDataAccessResult(result, submitted)).toThrow(
        DataAccessCompatibilityError,
      );
  });
  it("rejects unknown/duplicate references and returned rows outside the reported matched prefix", () => {
    for (const mutate of [
      (value: DataAccessResult) => {
        value.outcomes[0]!.candidateIds.push("missing");
      },
      (value: DataAccessResult) => {
        value.outcomes[0]!.candidateIds.push("b2");
      },
      (value: DataAccessResult) => {
        value.outcomes[0]!.matchedIds = ["a1"];
      },
      (value: DataAccessResult) => {
        value.outcomes[0]!.returnedIds.reverse();
      },
    ]) {
      const value = structuredClone(result);
      mutate(value);
      expect(() => assertDataAccessResult(value, input)).toThrow(
        DataAccessCompatibilityError,
      );
    }
  });
  it("rejects mutated, duplicate and reordered final rows rather than rendering unrelated state", () => {
    for (const mutate of [
      (value: DataAccessResult) => {
        value.finalRows[0]!.businessKey = "changed";
      },
      (value: DataAccessResult) => {
        value.finalRows[1]!.id = value.finalRows[0]!.id;
      },
      (value: DataAccessResult) => {
        value.finalRows.reverse();
      },
    ]) {
      const value = structuredClone(result);
      mutate(value);
      expect(() => assertDataAccessResult(value, input)).toThrow(
        DataAccessCompatibilityError,
      );
    }
  });
  it("requires outcomes to align with captured operations and reported record populations", () => {
    for (const mutate of [
      (value: DataAccessResult) => {
        value.outcomes[0]!.operationId = "different";
      },
      (value: DataAccessResult) => {
        value.outcomes.push(structuredClone(value.outcomes[0]!));
      },
      (value: DataAccessResult) => {
        value.outcomes[0]!.recordCountBefore = 11;
      },
      (value: DataAccessResult) => {
        value.outcomes[0]!.recordCountAfter = 13;
      },
    ]) {
      const value = structuredClone(result);
      mutate(value);
      expect(() => assertDataAccessResult(value, input)).toThrow(
        DataAccessCompatibilityError,
      );
    }
  });
  it("projects only reported accepted inserts and requires their exact captured rows", () => {
    const value = acceptedInsert();
    expect(() => assertDataAccessResult(value, value.input)).not.toThrow();
    const missing = structuredClone(value);
    missing.finalRows.pop();
    expect(() => assertDataAccessResult(missing, missing.input)).toThrow(
      DataAccessCompatibilityError,
    );
    const changed = structuredClone(value);
    changed.finalRows.at(-1)!.createdOrder = 26;
    expect(() => assertDataAccessResult(changed, changed.input)).toThrow(
      DataAccessCompatibilityError,
    );
    const existing = structuredClone(value);
    const operation = existing.input.operations[0]!;
    if (operation.kind === "INSERT") operation.row.id = "b2";
    expect(() => assertDataAccessResult(existing, existing.input)).toThrow(
      DataAccessCompatibilityError,
    );
  });
  it("rejects duplicate/missing baseline presets and incompatible limits before displaying controls", () => {
    for (const body of [
      null,
      { ...descriptor, limits: { ...descriptor.limits, maxInitialRows: 999 } },
      {
        ...descriptor,
        presets: [...descriptor.presets, descriptor.presets[0]],
      },
      {
        ...descriptor,
        presets: descriptor.presets.filter(
          (preset) => preset.id !== "baseline",
        ),
      },
    ])
      expect(() => assertDataAccessDescriptor(body)).toThrow(
        DataAccessCompatibilityError,
      );
  });
  it("correlates range access paths and returned result ceilings with submitted controls", () => {
    const wrongPath = structuredClone(result);
    wrongPath.outcomes[0]!.accessPath = "TABLE_SCAN";
    expect(() => assertDataAccessResult(wrongPath, input)).toThrow(
      DataAccessCompatibilityError,
    );
    const exceededLimit = structuredClone(result);
    const operation = exceededLimit.input.operations[0]!;
    if (operation.kind === "TENANT_RANGE") operation.limit = 1;
    expect(() =>
      assertDataAccessResult(exceededLimit, exceededLimit.input),
    ).toThrow(DataAccessCompatibilityError);
  });
  it("rejects a primary-key response that points at another known record", () => {
    const value = structuredClone(result);
    value.input.operations = [{ id: "point", kind: "LOOKUP_ID", rowId: "b2" }];
    const work = {
      primaryKeyLookups: 1,
      indexSeeks: 0,
      indexEntriesExamined: 0,
      baseRowsExamined: 1,
      matchedRows: 1,
      returnedRows: 1,
      baseWrites: 0,
      secondaryIndexWrites: 0,
      businessKeyChecks: 0,
      businessKeyWrites: 0,
    };
    value.outcomes = [
      {
        ...value.outcomes[0]!,
        operationId: "point",
        kind: "LOOKUP_ID",
        accessPath: "PRIMARY_KEY",
        candidateIds: ["b2"],
        matchedIds: ["b2"],
        returnedIds: ["b2"],
        work,
      },
    ];
    value.totals = work;
    expect(() => assertDataAccessResult(value, value.input)).not.toThrow();
    Object.assign(value.outcomes[0]!, {
      candidateIds: ["b3"],
      matchedIds: ["b3"],
      returnedIds: ["b3"],
    });
    expect(() => assertDataAccessResult(value, value.input)).toThrow(
      DataAccessCompatibilityError,
    );
  });
  it("rejects accepted inserts that violate enabled tenant-scoped business uniqueness", () => {
    const value = acceptedInsert();
    const operation = value.input.operations[0]!;
    if (operation.kind === "INSERT") operation.row.businessKey = "k2";
    value.finalRows.at(-1)!.businessKey = "k2";
    expect(() => assertDataAccessResult(value, value.input)).toThrow(
      DataAccessCompatibilityError,
    );
    value.input.enforceBusinessKey = false;
    expect(() => assertDataAccessResult(value, value.input)).not.toThrow();
  });
  it("binds conflict reasons to the proposed key, enforcement scope and duplicate-ID precedence", () => {
    const rejected = acceptedInsert();
    const operation = rejected.input.operations[0]!;
    if (operation.kind === "INSERT") operation.row.businessKey = "k2";
    rejected.finalRows.pop();
    const outcome = rejected.outcomes[0]!;
    outcome.accepted = false;
    outcome.conflict = { reason: "DUPLICATE_BUSINESS_KEY", recordId: "b2" };
    outcome.recordCountAfter = 12;
    outcome.work.baseWrites =
      outcome.work.secondaryIndexWrites =
      outcome.work.businessKeyWrites =
        0;
    rejected.totals = { ...outcome.work };
    expect(() =>
      assertDataAccessResult(rejected, rejected.input),
    ).not.toThrow();
    for (const mutate of [
      (value: DataAccessResult) => {
        value.outcomes[0]!.conflict!.reason = "DUPLICATE_ID";
      },
      (value: DataAccessResult) => {
        value.outcomes[0]!.conflict!.recordId = "b3";
      },
      (value: DataAccessResult) => {
        value.input.enforceBusinessKey = false;
      },
      (value: DataAccessResult) => {
        const insert = value.input.operations[0]!;
        if (insert.kind === "INSERT") insert.row.id = "b2";
      },
    ]) {
      const value = structuredClone(rejected);
      mutate(value);
      expect(() => assertDataAccessResult(value, value.input)).toThrow(
        DataAccessCompatibilityError,
      );
    }
    if (operation.kind === "INSERT") operation.row.id = "b2";
    outcome.conflict.reason = "DUPLICATE_ID";
    outcome.work.businessKeyChecks = 0;
    rejected.totals = { ...outcome.work };
    expect(() =>
      assertDataAccessResult(rejected, rejected.input),
    ).not.toThrow();
  });
});
