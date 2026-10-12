import { useId, useLayoutEffect, useRef } from "react";
import type { DeliveryDescriptor } from "../../api/types";
import type { DeliveryErrors, DeliveryForm } from "./deliveryForm";
export function DeliveryControls({
  descriptor,
  form,
  errors,
  pending,
  activePreset,
  update,
  selectPreset,
  run,
}: {
  descriptor: DeliveryDescriptor;
  form: DeliveryForm;
  errors: DeliveryErrors;
  pending: boolean;
  activePreset: string;
  update: (form: DeliveryForm) => void;
  selectPreset: (id: string) => void;
  run: () => void;
}) {
  const id = useId();
  const element = useRef<HTMLFormElement>(null);
  const l = descriptor.limits;
  useLayoutEffect(() => {
    const invalid = element.current?.querySelector<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >('[aria-invalid="true"]');
    if (!invalid) return;
    const details = invalid.closest("details");
    if (details) details.open = true;
    invalid.focus();
  }, [errors]);
  function numeric(
    label: string,
    field: keyof Pick<
      DeliveryForm,
      | "processingTimeMs"
      | "acknowledgmentDelayMs"
      | "visibilityTimeoutMs"
      | "maxDeliveryAttempts"
      | "seed"
    >,
    min: number,
    max: number,
  ) {
    const errorId = `${id}-${field}`;
    return (
      <label className="delivery-field">
        <span>{label}</span>
        <input
          aria-label={label}
          type="number"
          step={1}
          min={min}
          max={max}
          value={form[field]}
          aria-invalid={!!errors[field]}
          aria-describedby={errors[field] ? errorId : undefined}
          onChange={(e) => update({ ...form, [field]: e.target.value })}
        />
        {errors[field] && (
          <small id={errorId} className="delivery-field-error">
            {errors[field]}
          </small>
        )}
      </label>
    );
  }
  function editor(
    label: string,
    field: "messages" | "consumers" | "failures" | "lostAcknowledgments",
    help: string,
    example: string,
  ) {
    const hintId = `${id}-${field}-hint`,
      errorId = `${id}-${field}-error`;
    return (
      <label className="delivery-field">
        <span>{label}</span>
        <textarea
          aria-label={label}
          rows={field === "messages" ? 4 : 3}
          maxLength={4096}
          value={form[field]}
          placeholder={example}
          spellCheck={false}
          aria-invalid={!!errors[field]}
          aria-describedby={`${hintId}${errors[field] ? ` ${errorId}` : ""}`}
          onChange={(e) => update({ ...form, [field]: e.target.value })}
        />
        <small id={hintId}>{help}</small>
        {errors[field] && (
          <small id={errorId} className="delivery-field-error">
            {errors[field]}
          </small>
        )}
      </label>
    );
  }
  return (
    <form
      ref={element}
      className="delivery-controls"
      noValidate
      aria-label="Delivery workload"
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
    >
      <p className="eyebrow">Choose one changed condition</p>
      <h2>Configure the delivery</h2>
      <p className="delivery-muted">
        An ACK changes the broker's knowledge. An effect changes the ledger.
        Neither happens automatically when the other does.
      </p>
      <fieldset className="delivery-control-set" disabled={pending}>
        <legend className="sr-only">Delivery simulation inputs</legend>
        <div className="delivery-presets">
          {descriptor.presets.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className={`delivery-preset ${activePreset === preset.id ? "active" : ""}`}
              aria-pressed={activePreset === preset.id}
              onClick={() => selectPreset(preset.id)}
            >
              {preset.title}
            </button>
          ))}
        </div>
        <label className="delivery-field">
          <span>ACK policy</span>
          <select
            aria-label="ACK policy"
            value={form.acknowledgmentPolicy}
            aria-invalid={!!errors.acknowledgmentPolicy}
            onChange={(e) =>
              update({
                ...form,
                acknowledgmentPolicy: e.target
                  .value as DeliveryForm["acknowledgmentPolicy"],
              })
            }
          >
            <option value="ACK_AFTER_EFFECT">ACK after effect</option>
            <option value="ACK_BEFORE_EFFECT">ACK before effect</option>
          </select>
          {errors.acknowledgmentPolicy && (
            <small className="delivery-field-error">
              {errors.acknowledgmentPolicy}
            </small>
          )}
        </label>
        <p className="delivery-muted delivery-input-hint">
          After effect: send after processing + ACK delay. Before effect: send
          after ACK delay; processing still needs its own time.
        </p>
        <div className="delivery-scalar-grid">
          {numeric(
            "Processing time (ms)",
            "processingTimeMs",
            l.minProcessingTimeMs,
            l.maxProcessingTimeMs,
          )}
          {numeric(
            "ACK delay (ms)",
            "acknowledgmentDelayMs",
            l.minAcknowledgmentDelayMs,
            l.maxAcknowledgmentDelayMs,
          )}
          {numeric(
            "Visibility lease (ms)",
            "visibilityTimeoutMs",
            l.minVisibilityTimeoutMs,
            l.maxVisibilityTimeoutMs,
          )}
          {numeric(
            "Maximum delivery attempts",
            "maxDeliveryAttempts",
            l.minDeliveryAttempts,
            l.maxDeliveryAttempts,
          )}
        </div>
        <details className="delivery-advanced">
          <summary>Advanced workload and faults</summary>
          <p className="delivery-muted">
            One row per item; use commas between fields. Message and failure
            rows may be out of time order. Equal-time ties keep input order.
          </p>
          <div className="delivery-editors">
            {numeric("Seed", "seed", l.minSeed, l.maxSeed)}
            <p className="delivery-muted">
              Seed is replay metadata. This model makes no random choices.
            </p>
            {editor(
              "Messages",
              "messages",
              `${l.minMessages}–${l.maxMessages} rows: ID, enqueue time (${l.minTimeMs}–${l.maxTimeMs} ms).`,
              "m1, 0",
            )}
            {editor(
              "Consumers",
              "consumers",
              `${l.minConsumers}–${l.maxConsumers} IDs, one per row. Each consumer has one processing slot.`,
              "c1\nc2",
            )}
            {editor(
              "Consumer failures",
              "failures",
              `At most ${l.maxFailures} actions total: consumer ID, CRASH or RECOVER, time (${l.minTimeMs}–${l.maxTimeMs} ms). Empty means no failures.`,
              "c1, CRASH, 25\nc1, RECOVER, 75",
            )}
            {editor(
              "Lost ACK selectors",
              "lostAcknowledgments",
              `At most ${l.maxLostAcknowledgments} rows: message ID, attempt number. Empty means no configured ACK loss.`,
              "m1, 1",
            )}
          </div>
        </details>
      </fieldset>
      <button
        type="submit"
        className="button primary delivery-run"
        disabled={pending}
      >
        {pending ? "Running delivery simulation…" : "Run delivery simulation"}
      </button>
    </form>
  );
}
