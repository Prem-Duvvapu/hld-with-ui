import { describe, expect, it } from "vitest";
import {
  addAtomicityStep,
  addAtomicityTransaction,
  moveAtomicityStep,
  parseAtomicityForm,
  removeAtomicityStep,
  removeAtomicityTransaction,
  toAtomicityForm,
} from "./atomicityForm";
import {
  conflictInput,
  descriptor,
  input,
  protectedInput,
} from "./atomicityTestFixtures";
const parse = (form = toAtomicityForm(input)) =>
  parseAtomicityForm(form, descriptor.limits);

describe("atomicity program authoring", () => {
  it.each([input, protectedInput, conflictInput])(
    "round-trips an actual Java input without UI metadata",
    (actual) => {
      const form = toAtomicityForm(actual),
        before = structuredClone(form);
      expect(parse(form)).toEqual({ input: actual, errors: {} });
      expect(form).toEqual(before);
    },
  );

  it.each(["", " ", "-1", "21", "1.5", "1e0", "0x1"])(
    "rejects invalid initial stock %j without replacing the draft",
    (value) => {
      const form = toAtomicityForm(input);
      form.initialUnits = value;
      expect(parse(form).input).toBeUndefined();
      expect(parse(form).errors.initialUnits).toMatch(/whole number/);
      expect(form.initialUnits).toBe(value);
    },
  );

  it.each(["", " ", "0", "21", "1.5"])(
    "rejects invalid quantity %j",
    (value) => {
      const form = toAtomicityForm(input);
      form.transactions[0]!.quantity = value;
      expect(parse(form).input).toBeUndefined();
      expect(parse(form).errors["transaction-0-quantity"]).toMatch(
        /whole number/,
      );
    },
  );

  it("keeps zero stock and requests above stock valid for Java to reject, and accepts numeric boundaries", () => {
    const form = toAtomicityForm(input);
    form.initialUnits = "0";
    form.transactions[0]!.quantity = "20";
    expect(parse(form).input).toMatchObject({
      initialUnits: 0,
      transactions: [{ id: "a", quantity: 20 }],
    });
    form.initialUnits = "20";
    expect(parse(form).input?.initialUnits).toBe(20);
  });

  it.each(["", "A", " a", "a\n", "é", "a".repeat(33)])(
    "rejects invalid whole actor/step/reference IDs %j",
    (id) => {
      const form = toAtomicityForm(input);
      form.transactions[0]!.id = id;
      form.schedule[0]!.id = id;
      form.schedule[0]!.transactionId = id;
      expect(parse(form).input).toBeUndefined();
      expect(parse(form).errors["transaction-0-id"]).toBeTruthy();
      expect(parse(form).errors["step-0-id"]).toBeTruthy();
      expect(parse(form).errors["step-0-transactionId"]).toBeTruthy();
    },
  );

  it("preserves stable keys and exposes stale references rather than rewriting them after an actor ID edit", () => {
    const form = toAtomicityForm(input),
      before = structuredClone(form);
    form.transactions[0]!.id = "renamed";
    expect(form.transactions[0]!.uiKey).toBe(before.transactions[0]!.uiKey);
    expect(form.schedule).toEqual(before.schedule);
    expect(parse(form).errors["step-0-transactionId"]).toMatch(
      /ID edits do not rewrite/,
    );
    expect(parse(form).input).toBeUndefined();
    form.schedule.forEach((step) => {
      step.transactionId = "renamed";
    });
    expect(
      parse(form).input?.schedule.map((step) => step.transactionId),
    ).toEqual(["renamed", "renamed", "renamed"]);
  });

  it("checks uniqueness separately and accepts a boundary-length identity", () => {
    const form = toAtomicityForm(conflictInput);
    form.schedule[0]!.id = "a";
    expect(parse(form).input).toBeDefined();
    form.transactions[1]!.id = "a";
    expect(parse(form).errors.transactions).toMatch(/different ID/);
    form.transactions[1]!.id = "b";
    form.schedule[1]!.id = "a";
    expect(parse(form).errors.schedule).toMatch(/different ID/);
    const boundary = toAtomicityForm(input),
      id = "a".repeat(32);
    boundary.transactions[0]!.id = id;
    boundary.schedule.forEach((step) => {
      step.transactionId = id;
    });
    expect(parse(boundary).input).toBeDefined();
  });

  it("adds a complete actor program and explicitly removes its linked steps even after an ID edit", () => {
    const original = toAtomicityForm(input),
      before = structuredClone(original);
    const added = addAtomicityTransaction(original, descriptor.limits),
      actor = added.transactions[1]!;
    expect(added.transactions).toHaveLength(2);
    expect(added.schedule.slice(3).map((step) => step.action)).toEqual([
      "BEGIN",
      "DECREMENT_STOCK",
      "RECORD_ALLOCATION",
      "COMMIT",
    ]);
    expect(parse(added).input).toBeDefined();
    actor.id = "new-name";
    expect(parse(added).input).toBeUndefined();
    expect(
      removeAtomicityTransaction(added, actor.uiKey, descriptor.limits),
    ).toEqual(original);
    expect(original).toEqual(before);
    expect(
      removeAtomicityTransaction(
        original,
        original.transactions[0]!.uiKey,
        descriptor.limits,
      ),
    ).toEqual(original);
    const maximum = addAtomicityTransaction(
      addAtomicityTransaction(original, descriptor.limits),
      descriptor.limits,
    );
    expect(maximum.transactions).toHaveLength(3);
    expect(addAtomicityTransaction(maximum, descriptor.limits)).toEqual(
      maximum,
    );
  });

  it("preserves input-step identity during explicit add/remove/reorder and does not repair illegal order", () => {
    const original = toAtomicityForm(input);
    const added = addAtomicityStep(original, descriptor.limits),
      step = added.schedule.at(-1)!;
    expect(new Set(added.schedule.map((item) => item.id)).size).toBe(4);
    expect(parse(added).input).toBeUndefined();
    expect(removeAtomicityStep(added, step.uiKey)).toEqual(original);
    const moved = moveAtomicityStep(original, 1, -1),
      before = structuredClone(moved);
    expect(moved.schedule[0]!.uiKey).toBe(original.schedule[1]!.uiKey);
    expect(parse(moved).errors["step-0-action"]).toBeTruthy();
    expect(moved).toEqual(before);
    expect(original.schedule.map((item) => item.id)).toEqual(
      input.schedule.map((item) => item.id),
    );
    expect(moveAtomicityStep(original, 0, -1)).toEqual(original);
  });

  it("preserves the other actor's owned steps while recovering from duplicate edited IDs", () => {
    const form = toAtomicityForm(conflictInput);
    const removedKey = form.transactions[0]!.uiKey,
      retainedKey = form.transactions[1]!.uiKey;
    const retainedSteps = form.schedule.filter(
      (step) => step.ownerKey === retainedKey,
    );
    form.transactions[0]!.id = "b";
    expect(parse(form).input).toBeUndefined();
    const recovered = removeAtomicityTransaction(
      form,
      removedKey,
      descriptor.limits,
    );
    expect(recovered.schedule).toEqual(retainedSteps);
    expect(recovered.transactions.map((actor) => actor.id)).toEqual(["b"]);
    expect(parse(recovered).input).toBeDefined();
  });

  it("accepts early abort but rejects missing terminal, commit before record and work after terminal", () => {
    const form = toAtomicityForm(input);
    form.schedule.splice(1, 1);
    expect(parse(form).input?.schedule.map((step) => step.action)).toEqual([
      "BEGIN",
      "ABORT",
    ]);
    form.schedule.pop();
    expect(parse(form).input).toBeUndefined();
    const premature = toAtomicityForm(input);
    premature.schedule[2]!.action = "COMMIT";
    expect(parse(premature).errors["step-2-action"]).toBeTruthy();
    const afterTerminal = toAtomicityForm(input);
    afterTerminal.schedule.push({
      ...afterTerminal.schedule[1]!,
      uiKey: "extra",
      id: "after-abort",
    });
    expect(parse(afterTerminal).errors["step-3-action"]).toBeTruthy();
  });

  it("bounds step/actor collections and rejects unsupported input modes/actions", () => {
    const form = toAtomicityForm(input);
    form.transactions = [];
    expect(parse(form).errors.transactions).toBeTruthy();
    form.schedule = [];
    expect(parse(form).errors.schedule).toBeTruthy();
    const full = addAtomicityStep(
      addAtomicityTransaction(
        addAtomicityTransaction(toAtomicityForm(input), descriptor.limits),
        descriptor.limits,
      ),
      descriptor.limits,
    );
    expect(full.schedule).toHaveLength(12);
    expect(addAtomicityStep(full, descriptor.limits)).toEqual(full);
    full.schedule.push({
      ...full.schedule[0]!,
      uiKey: "thirteenth",
      id: "thirteenth",
    });
    expect(parse(full).errors.schedule).toBeTruthy();
    const unknown = {
      ...toAtomicityForm(input),
      mode: "UNKNOWN",
    } as unknown as typeof form;
    expect(parse(unknown).errors.mode).toBeTruthy();
    const unknownAction = toAtomicityForm(input);
    unknownAction.schedule[0]!.action =
      "UNKNOWN" as (typeof unknownAction.schedule)[0]["action"];
    expect(parse(unknownAction).errors["step-0-action"]).toBeTruthy();
  });
});
