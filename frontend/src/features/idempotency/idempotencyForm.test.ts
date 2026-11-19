import { describe, expect, it } from "vitest";
import { descriptor, input, pairs } from "../../api/idempotencyTestFixtures";
import {
  addIdempotencyCall,
  addIdempotencyStep,
  moveIdempotencyStep,
  parseIdempotencyForm,
  removeIdempotencyCall,
  removeIdempotencyStep,
  toIdempotencyForm,
} from "./idempotencyForm";
const parse = (form = toIdempotencyForm(input)) =>
  parseIdempotencyForm(form, descriptor.limits);
describe("authoring idempotency calls without executing publication", () => {
  it.each(pairs)(
    "round-trips the real Java $id input without mutation or UI keys",
    ({ input: actual }) => {
      const form = toIdempotencyForm(actual),
        before = structuredClone(form);
      expect(parse(form)).toEqual({ input: actual, errors: {} });
      expect(form).toEqual(before);
    },
  );
  it.each(["", " ", "0", "10001", "1.5", "1e2", "0x10"])(
    "preserves invalid retention %j",
    (value) => {
      const form = toIdempotencyForm(input);
      form.retentionMs = value;
      expect(parse(form).errors.retentionMs).toMatch(/whole number/);
      expect(parse(form).input).toBeUndefined();
      expect(form.retentionMs).toBe(value);
    },
  );
  it("accepts numeric boundaries but rejects zero units, unsorted times and stale call references", () => {
    const form = toIdempotencyForm(input);
    form.retentionMs = "10000";
    form.calls.forEach((call) => {
      call.units = "1000";
    });
    form.schedule.forEach((step) => {
      step.timeMs = "10000";
    });
    expect(parse(form).input).toMatchObject({ retentionMs: 10000 });
    form.calls[0]!.units = "0";
    expect(parse(form).errors["call-0-units"]).toMatch(/whole number/);
    form.calls[0]!.units = "1000";
    form.schedule[1]!.timeMs = "9999";
    expect(parse(form).errors["step-1-timeMs"]).toMatch(/nondecreasing/);
    form.calls[0]!.id = "renamed";
    expect(parse(form).errors["step-0-callId"]).toMatch(/does not rewrite/);
    expect(form.schedule[0]!.callId).toBe("a");
  });
  it.each(["", "A", " a", "a\n", "é", "a".repeat(33)])(
    "rejects malformed whole IDs %j",
    (value) => {
      const form = toIdempotencyForm(input);
      form.calls[0]!.id = value;
      form.calls[0]!.key = value;
      form.schedule[0]!.id = value;
      form.schedule[0]!.callId = value;
      const errors = parse(form).errors;
      expect(errors["call-0-id"]).toBeTruthy();
      expect(errors["call-0-key"]).toBeTruthy();
      expect(errors["step-0-id"]).toBeTruthy();
      expect(errors["step-0-callId"]).toBeTruthy();
    },
  );
  it("treats audit labels as tenant/operation tuples and validates changed payload intent explicitly", () => {
    const form = toIdempotencyForm(input);
    form.calls[1]!.units = "2";
    expect(parse(form).errors["call-1-units"]).toMatch(/another operation ID/);
    form.calls[1]!.operationId = "different-intent";
    expect(parse(form).input?.calls[1]).toMatchObject({ units: 2, key: "k" });
    form.calls[0]!.tenantId = "a-b";
    form.calls[0]!.operationId = "c";
    form.calls[1]!.tenantId = "a";
    form.calls[1]!.operationId = "b-c";
    expect(parse(form).input).toBeDefined();
  });
  it("changes mode without rewriting calls or schedule, allowing Java to determine the result", () => {
    const form = toIdempotencyForm(input),
      before = structuredClone(form);
    form.mode = "ATOMIC_EFFECT_RECORD";
    expect(parse(form).input).toEqual({
      ...input,
      mode: "ATOMIC_EFFECT_RECORD",
    });
    expect(form.calls).toEqual(before.calls);
    expect(form.schedule).toEqual(before.schedule);
  });
  it("keeps stable step identities when moving and reports illegal grammar instead of repairing it", () => {
    const original = toIdempotencyForm(input),
      before = structuredClone(original);
    const moved = moveIdempotencyStep(original, 1, -1);
    expect(moved.schedule[0]!.uiKey).toBe(original.schedule[1]!.uiKey);
    expect(parse(moved).errors["step-0-action"]).toBeTruthy();
    expect(original).toEqual(before);
    expect(moveIdempotencyStep(original, 0, -1)).toEqual(original);
    const missing = removeIdempotencyStep(
      original,
      original.schedule.at(-1)!.uiKey,
    );
    expect(parse(missing).errors.schedule).toMatch(/Every call/);
  });
  it("allows a crash after lookup and rejects work following a terminal action", () => {
    const form = toIdempotencyForm(input);
    form.calls = [form.calls[0]!];
    form.schedule = [
      form.schedule[0]!,
      { ...form.schedule[1]!, action: "CRASH_HANDLER" },
    ];
    expect(parse(form).input?.schedule.map((step) => step.action)).toEqual([
      "LOOKUP",
      "CRASH_HANDLER",
    ]);
    form.schedule.push({
      ...form.schedule[0]!,
      id: "after-crash",
      uiKey: "extra",
    });
    expect(parse(form).errors["step-2-action"]).toBeTruthy();
  });
  it("adds a whole new call program and removes current referenced steps rather than stale UI ownership", () => {
    const original = toIdempotencyForm(input),
      added = addIdempotencyCall(original, descriptor.limits);
    expect(added.calls).toHaveLength(3);
    expect(added.schedule.slice(-4).map((step) => step.action)).toEqual([
      "LOOKUP",
      "WRITE_EFFECT",
      "SAVE_RESULT",
      "RESPOND",
    ]);
    expect(parse(added).input).toBeDefined();
    expect(
      removeIdempotencyCall(added, added.calls[2]!.uiKey, descriptor.limits),
    ).toEqual(original);
    const reassigned = toIdempotencyForm(input);
    reassigned.schedule[0]!.callId = "b";
    const removed = removeIdempotencyCall(
      reassigned,
      reassigned.calls[0]!.uiKey,
      descriptor.limits,
    );
    expect(removed.schedule[0]!.id).toBe("lookup-a");
    expect(removed.schedule.every((step) => step.callId === "b")).toBe(true);
    expect(parse(removed).input).toBeUndefined();
    const renamed = toIdempotencyForm(input);
    renamed.calls[0]!.id = "new-name";
    expect(
      removeIdempotencyCall(renamed, renamed.calls[0]!.uiKey, descriptor.limits)
        .schedule,
    ).toEqual(renamed.schedule);
  });
  it("preserves steps when removing one of two duplicate current call IDs", () => {
    const form = toIdempotencyForm(input);
    form.calls[0]!.id = "b";
    const removed = removeIdempotencyCall(
      form,
      form.calls[0]!.uiKey,
      descriptor.limits,
    );
    expect(removed.calls.map((call) => call.id)).toEqual(["b"]);
    expect(removed.schedule).toEqual(form.schedule);
    expect(parse(removed).input).toBeUndefined();
  });
  it("bounds collections and does not turn an added raw step into a valid program automatically", () => {
    const original = toIdempotencyForm(input),
      added = addIdempotencyStep(original, descriptor.limits);
    expect(parse(added).input).toBeUndefined();
    expect(removeIdempotencyStep(added, added.schedule.at(-1)!.uiKey)).toEqual(
      original,
    );
    let full = original;
    while (full.calls.length < descriptor.limits.maxCalls)
      full = addIdempotencyCall(full, descriptor.limits);
    expect(full.calls).toHaveLength(12);
    expect(full.schedule).toHaveLength(48);
    expect(addIdempotencyCall(full, descriptor.limits)).toBe(full);
    expect(addIdempotencyStep(full, descriptor.limits)).toBe(full);
    expect(parse(full).input).toBeDefined();
    full.calls = [];
    expect(parse(full).errors.calls).toBeTruthy();
  });
});
