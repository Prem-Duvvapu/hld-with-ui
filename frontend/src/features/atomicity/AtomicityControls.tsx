import { useId, useLayoutEffect, useRef } from "react";
import type { AtomicityDescriptor } from "../../api/types";
import {
  addAtomicityStep,
  addAtomicityTransaction,
  atomicityActions,
  atomicityActionLabels,
  moveAtomicityStep,
  removeAtomicityStep,
  removeAtomicityTransaction,
  type AtomicityForm,
} from "./atomicityForm";

export function AtomicityControls({
  descriptor,
  form,
  errors,
  pending,
  activePreset,
  update,
  selectPreset,
  run,
}: {
  descriptor: AtomicityDescriptor;
  form: AtomicityForm;
  errors: Record<string, string>;
  pending: boolean;
  activePreset: string;
  update: (form: AtomicityForm) => void;
  selectPreset: (id: string) => void;
  run: () => void;
}) {
  const scope = useId();
  const addActor = useRef<HTMLButtonElement>(null),
    addStep = useRef<HTMLButtonElement>(null);
  const focusTarget = useRef<string | null>(null);
  useLayoutEffect(() => {
    const target = focusTarget.current;
    if (target === "actor") addActor.current?.focus();
    else if (target === "step") addStep.current?.focus();
    else if (target) {
      const button = document.getElementById(
        target,
      ) as HTMLButtonElement | null;
      if (button?.disabled)
        (
          document.getElementById(
            target.replace(/(up|down)$/, (_, direction) =>
              direction === "up" ? "down" : "up",
            ),
          ) as HTMLButtonElement | null
        )?.focus();
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
      <div className="atomicity-field">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          value={value}
          inputMode={numeric ? "numeric" : undefined}
          maxLength={numeric ? 6 : descriptor.limits.maxIdLength}
          aria-invalid={!!errors[errorKey]}
          aria-describedby={errors[errorKey] ? `${id}-error` : undefined}
          onChange={(event) => change(event.target.value)}
        />
        {errors[errorKey] && (
          <small className="atomicity-error-text" id={`${id}-error`}>
            {errors[errorKey]}
          </small>
        )}
      </div>
    );
  }
  return (
    <section
      className="atomicity-controls"
      aria-label="Edit the atomicity schedule"
    >
      <p className="eyebrow">1 · Configure a complete program</p>
      <h2>Stock, writes, terminal decision</h2>
      <p className="atomicity-muted">
        Begin, change stock, record allocation, then commit; or abort after a
        valid prefix. Steps are logical actions, not elapsed time.
      </p>
      <fieldset disabled={pending} className="atomicity-control-set">
        <legend className="sr-only">Atomicity inputs</legend>
        <div className="atomicity-presets" aria-label="Atomicity scenarios">
          {descriptor.presets.map((preset) => (
            <button
              type="button"
              key={preset.id}
              aria-pressed={activePreset === preset.id}
              onClick={() => selectPreset(preset.id)}
            >
              {preset.title}
            </button>
          ))}
        </div>
        {field(
          "Initial stock (units)",
          form.initialUnits,
          "initial",
          "initialUnits",
          (initialUnits) => update({ ...form, initialUnits }),
          true,
        )}
        <div className="atomicity-field">
          <label htmlFor={`${scope}-mode`}>Atomicity mode</label>
          <select
            id={`${scope}-mode`}
            value={form.mode}
            aria-invalid={!!errors.mode}
            aria-describedby={errors.mode ? `${scope}-mode-error` : undefined}
            onChange={(event) =>
              update({
                ...form,
                mode: event.target.value as AtomicityForm["mode"],
              })
            }
          >
            <option value="SPLIT_WRITES">Publish writes separately</option>
            <option value="STAGED_VERSION_CHECK">
              Stage privately, validate revision, publish together
            </option>
          </select>
          {errors.mode && (
            <small id={`${scope}-mode-error`} className="atomicity-error-text">
              {errors.mode}
            </small>
          )}
        </div>
        <h3>Transactions</h3>
        {errors.transactions && (
          <p className="atomicity-error-text">{errors.transactions}</p>
        )}
        <p className="atomicity-muted">
          Editing an actor ID does not rewrite step references. Update those
          explicit references yourself.
        </p>
        {form.transactions.map((actor, i) => (
          <fieldset className="atomicity-edit-card" key={actor.uiKey}>
            <legend>Transaction {i + 1}</legend>
            <div className="atomicity-two-fields">
              {field(
                `Transaction ${i + 1} ID`,
                actor.id,
                `${actor.uiKey}-id`,
                `transaction-${i}-id`,
                (id) =>
                  update({
                    ...form,
                    transactions: form.transactions.map((item) =>
                      item.uiKey === actor.uiKey ? { ...item, id } : item,
                    ),
                  }),
              )}
              {field(
                `Transaction ${i + 1} quantity`,
                actor.quantity,
                `${actor.uiKey}-quantity`,
                `transaction-${i}-quantity`,
                (quantity) =>
                  update({
                    ...form,
                    transactions: form.transactions.map((item) =>
                      item.uiKey === actor.uiKey ? { ...item, quantity } : item,
                    ),
                  }),
                true,
              )}
            </div>
            <button
              type="button"
              disabled={
                form.transactions.length <= descriptor.limits.minTransactions
              }
              aria-label={`Remove transaction ${i + 1} and its steps`}
              onClick={() => {
                focusTarget.current = "actor";
                update(
                  removeAtomicityTransaction(
                    form,
                    actor.uiKey,
                    descriptor.limits,
                  ),
                );
              }}
            >
              Remove transaction and its steps
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          ref={addActor}
          disabled={
            form.transactions.length >= descriptor.limits.maxTransactions ||
            form.schedule.length + 4 > descriptor.limits.maxSteps
          }
          onClick={() =>
            update(addAtomicityTransaction(form, descriptor.limits))
          }
        >
          Add transaction
        </button>
        <p className="atomicity-muted">
          Adding a transaction adds its explicit Begin → stock → allocation →
          Commit input program.
        </p>
        <h3>Step order</h3>
        {errors.schedule && (
          <p className="atomicity-error-text">{errors.schedule}</p>
        )}
        <ol className="atomicity-schedule">
          {form.schedule.map((step, i) => (
            <li key={step.uiKey}>
              <p className="atomicity-step-heading">
                {i + 1}. {step.transactionId || "Unknown transaction"} ·{" "}
                {atomicityActionLabels[step.action]}
              </p>
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
                `Step ${i + 1} transaction ID`,
                step.transactionId,
                `${step.uiKey}-transaction`,
                `step-${i}-transactionId`,
                (transactionId) =>
                  update({
                    ...form,
                    schedule: form.schedule.map((item) =>
                      item.uiKey === step.uiKey
                        ? {
                            ...item,
                            transactionId,
                            ownerKey: form.transactions.find(
                              (actor) => actor.id === transactionId,
                            )?.uiKey,
                          }
                        : item,
                    ),
                  }),
              )}
              <div className="atomicity-field">
                <label htmlFor={`${scope}-${step.uiKey}-action`}>
                  Step {i + 1} action
                </label>
                <select
                  id={`${scope}-${step.uiKey}-action`}
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
                              action: event.target.value as typeof item.action,
                            }
                          : item,
                      ),
                    })
                  }
                >
                  {atomicityActions.map((action) => (
                    <option key={action} value={action}>
                      {atomicityActionLabels[action]}
                    </option>
                  ))}
                </select>
                {errors[`step-${i}-action`] && (
                  <small
                    id={`${scope}-${step.uiKey}-action-error`}
                    className="atomicity-error-text"
                  >
                    {errors[`step-${i}-action`]}
                  </small>
                )}
              </div>
              <div className="atomicity-step-moves">
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
                        update(moveAtomicityStep(form, i, direction));
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
                    update(removeAtomicityStep(form, step.uiKey));
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
          onClick={() => update(addAtomicityStep(form, descriptor.limits))}
        >
          Add step
        </button>
        <p className="atomicity-muted">
          Adding, removing or reordering steps can make a program invalid.
          Validation explains the issue; it does not repair your schedule.
        </p>
      </fieldset>
      <button
        type="button"
        className="atomicity-run"
        disabled={pending}
        onClick={run}
      >
        {pending ? "Running atomicity in Java…" : "Run atomicity experiment"}
      </button>
      <p className="atomicity-muted">
        Only an explicit Run evaluates the submitted input. Java decides
        publication, rejection and abort.
      </p>
    </section>
  );
}
