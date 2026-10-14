import { useLayoutEffect, useRef } from "react";
import type { ReservationDescriptor } from "../../api/types";
import {
  addReservation,
  removeReservation,
  moveReservationStep,
  type ReservationForm,
} from "./reservationForm";
export function ReservationControls({
  descriptor,
  form,
  errors,
  pending,
  activePreset,
  update,
  selectPreset,
  run,
}: {
  descriptor: ReservationDescriptor;
  form: ReservationForm;
  errors: Record<string, string>;
  pending: boolean;
  activePreset: string;
  update: (next: ReservationForm) => void;
  selectPreset: (id: string) => void;
  run: () => void;
}) {
  const addButton = useRef<HTMLButtonElement>(null);
  const focusTarget = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (focusTarget.current === "add") addButton.current?.focus();
    else if (focusTarget.current) {
      const button = document.getElementById(
        focusTarget.current,
      ) as HTMLButtonElement | null;
      if (button?.disabled)
        (
          document.getElementById(
            focusTarget.current.replace(/(up|down)$/, (_, direction) =>
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
    key: string,
    onChange: (value: string) => void,
    numeric = false,
  ) {
    return (
      <div className="reservation-field">
        <label htmlFor={`reservation-${key}`}>{label}</label>
        <input
          id={`reservation-${key}`}
          value={value}
          inputMode={numeric ? "numeric" : undefined}
          maxLength={numeric ? 6 : descriptor.limits.maxIdLength}
          aria-invalid={!!errors[key]}
          aria-describedby={
            errors[key] ? `reservation-error-${key}` : undefined
          }
          onChange={(event) => onChange(event.target.value)}
        />
        {errors[key] && (
          <small
            className="reservation-error-text"
            id={`reservation-error-${key}`}
          >
            {errors[key]}
          </small>
        )}
      </div>
    );
  }
  return (
    <section
      className="reservation-controls"
      aria-label="Edit the reservation schedule"
    >
      <p className="eyebrow">1 · Choose the experiment</p>
      <h2>Stock, reservations, order</h2>
      <p className="reservation-muted">
        Each reservation reads once, then attempts once. Change their order to
        expose a race.
      </p>
      <fieldset disabled={pending} className="reservation-control-set">
        <legend className="sr-only">Reservation inputs</legend>
        <div className="reservation-presets" aria-label="Reservation scenarios">
          {descriptor.presets.map((preset) => (
            <button
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
          "initialUnits",
          (initialUnits) => update({ ...form, initialUnits }),
          true,
        )}
        <div className="reservation-field">
          <label htmlFor="reservation-strategy">Reservation strategy</label>
          <select
            id="reservation-strategy"
            value={form.strategy}
            onChange={(event) =>
              update({
                ...form,
                strategy: event.target.value as ReservationForm["strategy"],
              })
            }
          >
            <option value="STALE_READ_WRITE">
              Use earlier read, then assign stock
            </option>
            <option value="ATOMIC_CONDITIONAL_RESERVATION">
              Check current stock and reserve atomically
            </option>
          </select>
          {errors.strategy && (
            <small className="reservation-error-text">{errors.strategy}</small>
          )}
        </div>
        <h3>Reservations</h3>
        {errors.reservations && (
          <p className="reservation-error-text">{errors.reservations}</p>
        )}
        {form.reservations.map((actor, i) => (
          <fieldset className="reservation-edit-card" key={actor.uiKey}>
            <legend>Reservation {i + 1}</legend>
            <div className="reservation-two-fields">
              {field(
                `Reservation ${i + 1} ID`,
                actor.id,
                `reservation-${i}-id`,
                (id) =>
                  update({
                    ...form,
                    reservations: form.reservations.map((item) =>
                      item.uiKey === actor.uiKey ? { ...item, id } : item,
                    ),
                  }),
              )}
              {field(
                `Reservation ${i + 1} quantity`,
                actor.quantity,
                `reservation-${i}-quantity`,
                (quantity) =>
                  update({
                    ...form,
                    reservations: form.reservations.map((item) =>
                      item.uiKey === actor.uiKey ? { ...item, quantity } : item,
                    ),
                  }),
                true,
              )}
            </div>
            <button
              className="reservation-small-button"
              disabled={
                form.reservations.length <= descriptor.limits.minReservations
              }
              aria-label={`Remove reservation ${i + 1}`}
              onClick={() => {
                focusTarget.current = "add";
                update(removeReservation(form, actor.uiKey));
              }}
            >
              Remove
            </button>
          </fieldset>
        ))}
        <button
          ref={addButton}
          className="reservation-small-button"
          disabled={
            form.reservations.length >= descriptor.limits.maxReservations
          }
          onClick={() => update(addReservation(form))}
        >
          Add reservation
        </button>
        <h3>Step order</h3>
        <p className="reservation-muted">
          Up and down move an input step. Every attempt must follow its own
          read.
        </p>
        {errors.schedule && (
          <p className="reservation-error-text">{errors.schedule}</p>
        )}
        <ol className="reservation-schedule">
          {form.schedule.map((step, i) => (
            <li key={step.uiKey}>
              <div className="reservation-step-heading">
                <span>
                  {i + 1}.{" "}
                  {form.reservations.find(
                    (actor) => actor.uiKey === step.actorKey,
                  )?.id || "Unnamed reservation"}{" "}
                  ·{" "}
                  {step.action === "READ"
                    ? "Read stock"
                    : "Attempt reservation"}
                </span>
              </div>
              {field(`Step ${i + 1} ID`, step.id, `step-${i}-id`, (id) =>
                update({
                  ...form,
                  schedule: form.schedule.map((item) =>
                    item.uiKey === step.uiKey ? { ...item, id } : item,
                  ),
                }),
              )}
              <div className="reservation-step-moves">
                {([-1, 1] as const).map((direction) => {
                  const name = direction === -1 ? "up" : "down";
                  return (
                    <button
                      key={name}
                      id={`reservation-move-${step.uiKey}-${name}`}
                      disabled={
                        direction === -1
                          ? i === 0
                          : i === form.schedule.length - 1
                      }
                      aria-label={`Move step ${i + 1} ${name}`}
                      onClick={() => {
                        focusTarget.current = `reservation-move-${step.uiKey}-${name}`;
                        update(moveReservationStep(form, i, direction));
                      }}
                    >
                      {direction === -1 ? "↑" : "↓"} {name}
                    </button>
                  );
                })}
              </div>
              {errors[`step-${i}-action`] && (
                <p className="reservation-error-text">
                  {errors[`step-${i}-action`]}
                </p>
              )}
            </li>
          ))}
        </ol>
      </fieldset>
      <button className="reservation-run" disabled={pending} onClick={run}>
        {pending ? "Running in Java…" : "Run reservation schedule"}
      </button>
      <p className="reservation-muted">
        No run starts automatically. The analysis uses logical steps, not
        elapsed time.
      </p>
    </section>
  );
}
