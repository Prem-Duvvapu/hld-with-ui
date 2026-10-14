import { describe, expect, it } from "vitest";
import {
  addReservation,
  moveReservationStep,
  parseReservationForm,
  removeReservation,
  toReservationForm,
} from "./reservationForm";
import { descriptor, input, protectedInput } from "./reservationTestFixtures";

const parse = (form = toReservationForm(input)) =>
  parseReservationForm(form, descriptor.limits);

describe("reservation schedule authoring", () => {
  it.each([input, protectedInput])(
    "round-trips actual Java inputs without leaking UI keys",
    (actual) => {
      const form = toReservationForm(actual);
      const before = structuredClone(form);
      expect(parse(form)).toEqual({ input: actual, errors: {} });
      expect(form).toEqual(before);
    },
  );

  it.each(["", " ", "-1", "21", "1.5"])(
    "rejects invalid initial stock %j without using a fallback",
    (value) => {
      const form = toReservationForm(input);
      form.initialUnits = value;
      expect(parse(form).input).toBeUndefined();
      expect(parse(form).errors.initialUnits).toMatch(/whole number/);
      expect(form.initialUnits).toBe(value);
    },
  );

  it.each(["", " ", "0", "21", "1.5"])(
    "rejects invalid quantity %j",
    (quantity) => {
      const form = toReservationForm(input);
      form.reservations[0]!.quantity = quantity;
      expect(parse(form).input).toBeUndefined();
      expect(parse(form).errors["reservation-0-quantity"]).toMatch(
        /whole number/,
      );
    },
  );

  it("accepts stock boundaries and quantities greater than available stock for Java to decide", () => {
    const form = toReservationForm(input);
    form.initialUnits = "0";
    form.reservations[0]!.quantity = "20";
    expect(parse(form).input).toMatchObject({
      initialUnits: 0,
      reservations: [
        { id: "a", quantity: 20 },
        { id: "b", quantity: 1 },
      ],
    });
    form.initialUnits = "20";
    expect(parse(form).input?.initialUnits).toBe(20);
  });

  it.each(["", "A", " a", "a\n", "é", "a".repeat(33)])(
    "rejects whole invalid actor and step IDs %j",
    (id) => {
      const actorForm = toReservationForm(input);
      actorForm.reservations[0]!.id = id;
      expect(parse(actorForm).errors["reservation-0-id"]).toBeTruthy();
      const stepForm = toReservationForm(input);
      stepForm.schedule[0]!.id = id;
      expect(parse(stepForm).errors["step-0-id"]).toBeTruthy();
      expect(parse(actorForm).input).toBeUndefined();
      expect(parse(stepForm).input).toBeUndefined();
    },
  );

  it("preserves actor and step keys while translating an edited actor ID in every linked step", () => {
    const form = toReservationForm(input);
    const actorKey = form.reservations[0]!.uiKey;
    const stepKeys = form.schedule.map((step) => step.uiKey);
    form.reservations[0]!.id = "reservation-new";
    form.schedule[0]!.id = "preview-new";
    const parsed = parse(form);
    expect(form.reservations[0]!.uiKey).toBe(actorKey);
    expect(form.schedule.map((step) => step.uiKey)).toEqual(stepKeys);
    expect(parsed.input?.schedule).toEqual([
      { id: "preview-new", reservationId: "reservation-new", action: "READ" },
      input.schedule[1],
      { ...input.schedule[2], reservationId: "reservation-new" },
      input.schedule[3],
    ]);
  });

  it("checks actor and step uniqueness in their own scopes", () => {
    const form = toReservationForm(input);
    form.schedule[0]!.id = "a";
    expect(parse(form).input).toBeDefined();
    form.reservations[1]!.id = "a";
    expect(parse(form).errors.reservations).toMatch(/different ID/);
    form.reservations[1]!.id = "b";
    form.schedule[1]!.id = "a";
    expect(parse(form).errors.schedule).toMatch(/different ID/);
  });

  it("accepts identifiers at the declared length boundary and rejects unsupported strategies", () => {
    const form = toReservationForm(input);
    form.reservations[0]!.id = "a".repeat(descriptor.limits.maxIdLength);
    form.schedule[0]!.id = "s".repeat(descriptor.limits.maxIdLength);
    expect(parse(form).input).toBeDefined();
    const unsupported = {
      ...form,
      strategy: "UNKNOWN",
    } as unknown as typeof form;
    expect(parse(unsupported).input).toBeUndefined();
    expect(parse(unsupported).errors.strategy).toMatch(/supported/);
  });

  it("adds a complete independently linked pair and removes only that actor's input steps", () => {
    const original = toReservationForm(input);
    const before = structuredClone(original);
    const added = addReservation(original);
    const actor = added.reservations[2]!;
    expect(added.reservations).toHaveLength(3);
    expect(added.schedule).toHaveLength(6);
    expect(
      added.schedule.slice(4).map((step) => [step.actorKey, step.action]),
    ).toEqual([
      [actor.uiKey, "READ"],
      [actor.uiKey, "ATTEMPT_RESERVE"],
    ]);
    expect(parse(added).input).toBeDefined();
    expect(removeReservation(added, actor.uiKey)).toEqual(original);
    expect(original).toEqual(before);
    expect(
      removeReservation(original, original.reservations[0]!.uiKey),
    ).toEqual(original);
    const maximum = addReservation(added);
    expect(maximum.reservations).toHaveLength(4);
    expect(maximum.schedule).toHaveLength(8);
    expect(addReservation(maximum)).toEqual(maximum);
  });

  it("preserves step identity on reorder and reports an attempt before its read without repairing it", () => {
    const original = toReservationForm(input);
    const moved = moveReservationStep(original, 2, -1);
    expect(moved.schedule.map((step) => step.id)).toEqual([
      "read-a",
      "attempt-a",
      "read-b",
      "attempt-b",
    ]);
    expect(moved.schedule[1]!.uiKey).toBe(original.schedule[2]!.uiKey);
    expect(parse(moved).input).toBeDefined();
    const invalid = moveReservationStep(moved, 1, -1);
    const before = structuredClone(invalid);
    expect(parse(invalid).input).toBeUndefined();
    expect(parse(invalid).errors["step-0-action"]).toMatch(/Read once before/);
    expect(invalid).toEqual(before);
    expect(original.schedule.map((step) => step.id)).toEqual(
      input.schedule.map((step) => step.id),
    );
    expect(moveReservationStep(original, 0, -1)).toEqual(original);
    expect(moveReservationStep(original, 3, 1)).toEqual(original);
  });

  it("requires every actor's exact read-attempt pair and a known actor link", () => {
    const form = toReservationForm(input);
    form.schedule.pop();
    expect(parse(form).errors.schedule).toBeTruthy();
    form.schedule.push({
      ...toReservationForm(input).schedule[3]!,
      actorKey: "unknown",
    });
    expect(parse(form).errors["step-3-action"]).toBeTruthy();
    expect(parse(form).input).toBeUndefined();
    form.schedule = toReservationForm(input).schedule;
    form.schedule[1]!.actorKey = form.reservations[0]!.uiKey;
    expect(parse(form).errors["step-1-action"]).toBeTruthy();
  });

  it("enforces actor collection bounds before accepting a schedule", () => {
    const form = toReservationForm(input);
    form.reservations.pop();
    expect(parse(form).errors.reservations).toBeTruthy();
    const five = addReservation(addReservation(toReservationForm(input)));
    five.reservations.push({ uiKey: "fifth", id: "fifth", quantity: "1" });
    expect(parse(five).errors.reservations).toBeTruthy();
    expect(parse(five).input).toBeUndefined();
  });
});
