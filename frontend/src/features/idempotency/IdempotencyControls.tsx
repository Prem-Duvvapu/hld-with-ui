import { useId, useLayoutEffect, useRef } from "react";
import type { IdempotencyDescriptor } from "../../api/types";
import {
  actions,
  actionLabels,
  modeLabels,
  addIdempotencyCall,
  removeIdempotencyCall,
  addIdempotencyStep,
  removeIdempotencyStep,
  moveIdempotencyStep,
  type IdempotencyForm,
} from "./idempotencyForm";
export function IdempotencyControls({
  descriptor,
  form,
  errors,
  pending,
  activePreset,
  update,
  selectPreset,
  run,
}: {
  descriptor: IdempotencyDescriptor;
  form: IdempotencyForm;
  errors: Record<string, string>;
  pending: boolean;
  activePreset: string;
  update: (form: IdempotencyForm) => void;
  selectPreset: (id: string) => void;
  run: () => void;
}) {
  const scope = useId(),
    region = useRef<HTMLElement>(null);
  const focusTarget = useRef<string | null>(null);
  const addCall = useRef<HTMLButtonElement>(null),
    addStep = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const invalid = region.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    if (invalid) {
      let ancestor = invalid.parentElement;
      while (ancestor && ancestor !== region.current) {
        if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
        ancestor = ancestor.parentElement;
      }
      invalid.focus();
    } else if (Object.keys(errors).length) region.current?.focus();
  }, [errors]);
  useLayoutEffect(() => {
    const target = focusTarget.current;
    if (target === "call") addCall.current?.focus();
    else if (target === "step") addStep.current?.focus();
    else if (target) {
      const button = document.getElementById(
        target,
      ) as HTMLButtonElement | null;
      if (button?.disabled)
        document
          .getElementById(
            target.replace(/(up|down)$/, (_, direction) =>
              direction === "up" ? "down" : "up",
            ),
          )
          ?.focus();
      else button?.focus();
    }
    focusTarget.current = null;
  }, [form]);
  function field(
    label: string,
    value: string,
    uiKey: string,
    errorKey: string,
    change: (value: string) => void,
    numeric = false,
  ) {
    const id = `${scope}-${uiKey}`;
    return (
      <label className="idem-field" htmlFor={id}>
        <span id={`${id}-label`}>{label}</span>
        <input
          id={id}
          aria-labelledby={`${id}-label`}
          value={value}
          inputMode={numeric ? "numeric" : undefined}
          maxLength={numeric ? 6 : descriptor.limits.maxIdLength}
          aria-invalid={!!errors[errorKey]}
          aria-describedby={errors[errorKey] ? `${id}-error` : undefined}
          onChange={(event) => change(event.target.value)}
        />
        {errors[errorKey] && (
          <small className="idem-error-text" id={`${id}-error`}>
            {errors[errorKey]}
          </small>
        )}
      </label>
    );
  }
  return (
    <section
      ref={region}
      tabIndex={-1}
      className="idem-controls"
      aria-label="Edit idempotency calls and schedule"
    >
      <p className="eyebrow">1 · Set up the experiment</p>
      <h2>Same work. Different protection.</h2>
      <fieldset disabled={pending} className="idem-control-set">
        <legend className="sr-only">Idempotency inputs</legend>
        <label className="idem-field" htmlFor={`${scope}-preset`}>
          <span id={`${scope}-preset-label`}>Scenario</span>
          <select
            id={`${scope}-preset`}
            aria-labelledby={`${scope}-preset-label`}
            value={activePreset}
            onChange={(event) => selectPreset(event.target.value)}
          >
            <option value="" disabled>
              Custom inputs
            </option>
            {descriptor.presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() =>
            selectPreset(activePreset || descriptor.defaultPresetId)
          }
        >
          Restore {activePreset ? "selected scenario" : "baseline"}
        </button>
        <label className="idem-field" htmlFor={`${scope}-mode`}>
          <span id={`${scope}-mode-label`}>Protection mode</span>
          <select
            id={`${scope}-mode`}
            aria-labelledby={`${scope}-mode-label`}
            value={form.mode}
            aria-invalid={!!errors.mode}
            aria-describedby={`${scope}-mode-help${errors.mode ? ` ${scope}-mode-error` : ""}`}
            onChange={(event) =>
              update({
                ...form,
                mode: event.target.value as IdempotencyForm["mode"],
              })
            }
          >
            {Object.entries(modeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <small id={`${scope}-mode-help`}>
            Change only this field for a fair comparison: calls, keys and step
            order stay the same.
          </small>
          {errors.mode && (
            <small id={`${scope}-mode-error`} className="idem-error-text">
              {errors.mode}
            </small>
          )}
        </label>
        {field(
          "Result retention (ms)",
          form.retentionMs,
          "retention",
          "retentionMs",
          (retentionMs) => update({ ...form, retentionMs }),
          true,
        )}
        <p className="idem-muted">
          Retention starts when a result is stored. A replay does not extend it.
          Java checks expiry before each authored step.
        </p>
        <details className="idem-editor" open={!!errors.calls}>
          <summary>Calls and identity ({form.calls.length})</summary>
          <p className="idem-muted">
            The server looks up (tenant, key). Operation ID is an audit label
            for intended work; it does not prevent duplicate effects. Tenant
            scope here is namespacing, not authorization.
          </p>
          {errors.calls && <p className="idem-error-text">{errors.calls}</p>}
          {form.calls.map((call, i) => (
            <fieldset className="idem-edit-card" key={call.uiKey}>
              <legend>Call {i + 1}</legend>
              <div className="idem-two-fields">
                {(
                  [
                    ["id", "ID"],
                    ["operationId", "operation ID"],
                    ["tenantId", "tenant ID"],
                    ["key", "key"],
                    ["units", "units"],
                  ] as const
                ).map(([name, label]) => (
                  <div key={name}>
                    {field(
                      `Call ${i + 1} ${label}`,
                      call[name],
                      `${call.uiKey}-${name}`,
                      `call-${i}-${name}`,
                      (value) =>
                        update({
                          ...form,
                          calls: form.calls.map((item) =>
                            item.uiKey === call.uiKey
                              ? { ...item, [name]: value }
                              : item,
                          ),
                        }),
                      name === "units",
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={form.calls.length <= descriptor.limits.minCalls}
                aria-label={`Remove call ${i + 1} and its steps`}
                onClick={() => {
                  focusTarget.current = "call";
                  update(
                    removeIdempotencyCall(form, call.uiKey, descriptor.limits),
                  );
                }}
              >
                Remove call and its steps
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            ref={addCall}
            disabled={
              form.calls.length >= descriptor.limits.maxCalls ||
              form.schedule.length + 4 > descriptor.limits.maxSteps
            }
            onClick={() => update(addIdempotencyCall(form, descriptor.limits))}
          >
            Add call and four steps
          </button>
          <p className="idem-muted">
            A new call appends Look up → Write/prepare → Save → Receive at the
            last authored time. Editing its ID does not rewrite step references.
            Removal deletes steps referencing the current call ID; if that ID is
            duplicated, steps stay for the remaining call. Unresolved old
            references need an explicit edit.
          </p>
        </details>
        <details className="idem-editor" open={!!errors.schedule}>
          <summary>Ordered steps ({form.schedule.length})</summary>
          <p className="idem-muted">
            Times are virtual milliseconds, not measured latency. Equal times
            execute in this order. Change references explicitly; moving a step
            never sorts times or repairs its program.
          </p>
          {errors.schedule && (
            <p className="idem-error-text">{errors.schedule}</p>
          )}
          <ol className="idem-schedule">
            {form.schedule.map((step, i) => (
              <li key={step.uiKey}>
                <p className="idem-step-heading">
                  {i + 1}. {step.callId || "Unknown call"} ·{" "}
                  {actionLabels[step.action]}
                </p>
                <div className="idem-two-fields">
                  {field(
                    `Step ${i + 1} ID`,
                    step.id,
                    `${step.uiKey}-id`,
                    `step-${i}-id`,
                    (id) =>
                      update({
                        ...form,
                        schedule: form.schedule.map((item) =>
                          item.uiKey === step.uiKey ? { ...item, id } : item,
                        ),
                      }),
                  )}
                  {field(
                    `Step ${i + 1} call ID`,
                    step.callId,
                    `${step.uiKey}-call`,
                    `step-${i}-callId`,
                    (callId) =>
                      update({
                        ...form,
                        schedule: form.schedule.map((item) =>
                          item.uiKey === step.uiKey
                            ? { ...item, callId }
                            : item,
                        ),
                      }),
                  )}
                  {field(
                    `Step ${i + 1} time (ms)`,
                    step.timeMs,
                    `${step.uiKey}-time`,
                    `step-${i}-timeMs`,
                    (timeMs) =>
                      update({
                        ...form,
                        schedule: form.schedule.map((item) =>
                          item.uiKey === step.uiKey
                            ? { ...item, timeMs }
                            : item,
                        ),
                      }),
                    true,
                  )}
                </div>
                <label
                  className="idem-field"
                  htmlFor={`${scope}-${step.uiKey}-action`}
                >
                  <span id={`${scope}-${step.uiKey}-action-label`}>
                    Step {i + 1} action
                  </span>
                  <select
                    id={`${scope}-${step.uiKey}-action`}
                    aria-labelledby={`${scope}-${step.uiKey}-action-label`}
                    value={step.action}
                    aria-invalid={!!errors[`step-${i}-action`]}
                    aria-describedby={
                      errors[`step-${i}-action`]
                        ? `${scope}-${step.uiKey}-action-error`
                        : undefined
                    }
                    onChange={(event) =>
                      update({
                        ...form,
                        schedule: form.schedule.map((item) =>
                          item.uiKey === step.uiKey
                            ? {
                                ...item,
                                action: event.target
                                  .value as typeof item.action,
                              }
                            : item,
                        ),
                      })
                    }
                  >
                    {actions.map((action) => (
                      <option key={action} value={action}>
                        {actionLabels[action]}
                      </option>
                    ))}
                  </select>
                  {errors[`step-${i}-action`] && (
                    <small
                      id={`${scope}-${step.uiKey}-action-error`}
                      className="idem-error-text"
                    >
                      {errors[`step-${i}-action`]}
                    </small>
                  )}
                </label>
                <div className="idem-step-moves">
                  {([-1, 1] as const).map((direction) => {
                    const name = direction === -1 ? "up" : "down",
                      id = `${scope}-move-${step.uiKey}-${name}`;
                    return (
                      <button
                        type="button"
                        key={name}
                        id={id}
                        disabled={
                          direction === -1
                            ? i === 0
                            : i === form.schedule.length - 1
                        }
                        aria-label={`Move step ${i + 1} ${name}`}
                        onClick={() => {
                          focusTarget.current = id;
                          update(moveIdempotencyStep(form, i, direction));
                        }}
                      >
                        {direction === -1 ? "↑" : "↓"} {name}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    aria-label={`Remove step ${i + 1}`}
                    onClick={() => {
                      focusTarget.current = "step";
                      update(removeIdempotencyStep(form, step.uiKey));
                    }}
                  >
                    Remove step
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            ref={addStep}
            disabled={form.schedule.length >= descriptor.limits.maxSteps}
            onClick={() => update(addIdempotencyStep(form, descriptor.limits))}
          >
            Add step
          </button>
          <p className="idem-muted">
            New steps need an explicit valid position and action. Every call
            must end in a response, response loss or crash.
          </p>
        </details>
      </fieldset>
      <button
        type="button"
        className="button primary idem-run"
        disabled={pending}
        onClick={run}
      >
        {pending
          ? "Running idempotency in Java…"
          : "Run idempotency experiment"}
      </button>
      <p className="idem-muted">
        Only Run submits the current calls. Changing a field, scenario or tab
        does not run Java.
      </p>
    </section>
  );
}
