import { describe, expect, it } from "vitest";
import type { DataAccessInput } from "../../api/types";
import {
  operationDraft,
  parseDataAccessForm,
  toDataAccessForm,
} from "./dataAccessForm";
import { descriptor, input } from "./dataAccessTestFixtures";

const parse = (value = toDataAccessForm(input)) =>
  parseDataAccessForm(value, descriptor.limits);

describe("data-access input editing", () => {
  it("round-trips actual Java inputs and emits only the active operation variant", () => {
    const workload: DataAccessInput = {
      ...input,
      operations: [
        { id: "lookup", kind: "LOOKUP_ID", rowId: "b2" },
        ...input.operations,
        {
          id: "global",
          kind: "ALL_RANGE",
          fromCreatedOrder: 0,
          toCreatedOrder: 1_000_000,
          limit: 1,
        },
        {
          id: "insert",
          kind: "INSERT",
          row: {
            id: "b5",
            tenant: "beta",
            businessKey: "k5",
            createdOrder: 25,
          },
        },
      ],
    };
    expect(parse(toDataAccessForm(workload))).toEqual({
      input: workload,
      errors: {},
    });
    expect(parse().input).toEqual(input);
  });

  it.each(["fromCreatedOrder", "toCreatedOrder", "limit"] as const)(
    "keeps blank %s invalid instead of silently using zero",
    (field) => {
      const form = toDataAccessForm(input);
      form.operations[0]![field] = "";
      const parsed = parse(form);
      expect(parsed.input).toBeNull();
      expect(parsed.errors[`operation-0-${field}`]).toMatch(/whole number/);
      expect(form.operations[0]![field]).toBe("");
    },
  );

  it.each([
    ["fromCreatedOrder", "-1"],
    ["toCreatedOrder", "1000001"],
    ["fromCreatedOrder", "20.5"],
    ["limit", "0"],
    ["limit", "21"],
    ["limit", "1.5"],
  ] as const)(
    "rejects %s outside its whole-number bounds (%s)",
    (field, value) => {
      const form = toDataAccessForm(input);
      form.operations[0]![field] = value;
      expect(parse(form).input).toBeNull();
      expect(parse(form).errors[`operation-0-${field}`]).toBeTruthy();
    },
  );

  it("accepts inclusive equal bounds but rejects a reversed interval", () => {
    const form = toDataAccessForm(input);
    form.operations[0]!.toCreatedOrder = "20";
    expect(parse(form).input?.operations[0]).toMatchObject({
      fromCreatedOrder: 20,
      toCreatedOrder: 20,
    });
    form.operations[0]!.toCreatedOrder = "19";
    expect(parse(form).input).toBeNull();
    expect(parse(form).errors["operation-0-toCreatedOrder"]).toMatch(
      /at least the start/,
    );
  });

  it.each(["", " ", "-1", "1000001", "25.5"])(
    "rejects an invalid insert creation order (%s)",
    (value) => {
      const form = toDataAccessForm(descriptor.presets[3]!.input);
      form.operations[0]!.createdOrder = value;
      expect(parse(form).input).toBeNull();
      expect(parse(form).errors["operation-0-createdOrder"]).toBeTruthy();
    },
  );

  it.each(["", "Beta", "beta\n", " beta", "é", "a".repeat(33)])(
    "rejects an invalid semantic identifier (%s)",
    (tenant) => {
      const form = toDataAccessForm(input);
      form.operations[0]!.tenant = tenant;
      expect(parse(form).input).toBeNull();
      expect(parse(form).errors["operation-0-tenant"]).toBeTruthy();
    },
  );

  it("accepts empty data and boundary values without mutating the draft", () => {
    const form = toDataAccessForm(input);
    form.rowsText = "[]";
    Object.assign(form.operations[0]!, {
      tenant: "a".repeat(32),
      fromCreatedOrder: "0",
      toCreatedOrder: "1000000",
      limit: "20",
    });
    const saved = structuredClone(form);
    expect(parse(form).input).toMatchObject({ rows: [] });
    expect(form).toEqual(saved);
  });

  it.each([
    "",
    "{}",
    "[null]",
    "[[]]",
    '[{"id":"r","tenant":"beta","businessKey":"k","createdOrder":"20"}]',
    '[{"id":"r","tenant":"beta","businessKey":"k","createdOrder":20,"extra":true}]',
  ])("rejects malformed or incompatible initial records (%s)", (rowsText) => {
    const parsed = parse({ ...toDataAccessForm(input), rowsText });
    expect(parsed.input).toBeNull();
    expect(parsed.errors.rows).toMatch(/JSON array/);
  });

  it("enforces initial primary uniqueness independently of scoped business protection", () => {
    const row = input.rows[0]!;
    const form = toDataAccessForm(input);
    form.rowsText = JSON.stringify([row, { ...row, businessKey: "other" }]);
    form.enforceBusinessKey = false;
    expect(parse(form).input).toBeNull();
    expect(parse(form).errors.rows).toMatch(/different ID/);
  });

  it("allows cross-tenant business keys and permits same-tenant duplicates only when disabled", () => {
    expect(parse().input).toEqual(input);
    const row = input.rows[0]!;
    const form = toDataAccessForm(input);
    form.rowsText = JSON.stringify([row, { ...row, id: "other" }]);
    expect(parse(form).input).toBeNull();
    expect(parse(form).errors.rows).toMatch(/within each tenant/);
    form.enforceBusinessKey = false;
    expect(parse(form).input?.rows).toHaveLength(2);
  });

  it("bounds datasets and operation counts, and rejects repeated operation identities", () => {
    const form = toDataAccessForm(input);
    form.rowsText = JSON.stringify(
      Array.from({ length: 21 }, (_, i) => ({
        id: `r${i}`,
        tenant: "beta",
        businessKey: `k${i}`,
        createdOrder: i,
      })),
    );
    expect(parse(form).errors.rows).toBeTruthy();
    form.rowsText = "[]";
    form.operations = [];
    expect(parse(form).errors.operations).toMatch(/1–10/);
    form.operations = Array.from({ length: 11 }, (_, i) => ({
      ...operationDraft(),
      id: `q${i}`,
    }));
    expect(parse(form).errors.operations).toMatch(/1–10/);
    form.operations = [operationDraft(), operationDraft()];
    expect(parse(form).errors.operations).toMatch(/different ID/);
    expect(parse(form).input).toBeNull();
  });

  it("keeps a conflicting insert valid for Java to decide instead of fabricating rejection", () => {
    const preset = descriptor.presets[3]!.input;
    expect(parse(toDataAccessForm(preset))).toEqual({
      input: preset,
      errors: {},
    });
  });
});
