import { useEffect, useId, useRef } from "react";
import type { QueueCapacityDescriptor } from "../../api/types";
import type { QueueErrors, QueueForm } from "./queueForm";
export function QueueControls({
  descriptor,
  form,
  errors,
  pending,
  activePreset,
  update,
  selectPreset,
  run,
}: {
  descriptor: QueueCapacityDescriptor;
  form: QueueForm;
  errors: QueueErrors;
  pending: boolean;
  activePreset: string;
  update: (form: QueueForm) => void;
  selectPreset: (id: string) => void;
  run: () => void;
}) {
  const id = useId();
  const rows = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const focusNew = useRef(false);
  const focusAdd = useRef(false);
  useEffect(() => {
    if (focusAdd.current) {
      addButton.current?.focus();
      focusAdd.current = false;
    }
    if (focusNew.current) {
      rows.current
        ?.querySelector<HTMLInputElement>(
          `[data-job-index="${form.jobs.length - 1}"]`,
        )
        ?.focus();
      focusNew.current = false;
    }
  }, [form.jobs.length]);
  function field(
    label: string,
    value: string,
    key: string,
    onChange: (value: string) => void,
    bounds?: { min: number; max: number },
    jobIndex?: number,
  ) {
    const errorId = `${id}-${key}-error`;
    return (
      <label className="queue-field">
        <span>{label}</span>
        <input
          aria-label={label}
          type={bounds ? "number" : "text"}
          step={bounds ? 1 : undefined}
          min={bounds?.min}
          max={bounds?.max}
          value={value}
          data-job-index={jobIndex}
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? errorId : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {errors[key] && (
          <small id={errorId} className="queue-field-error">
            {errors[key]}
          </small>
        )}
      </label>
    );
  }
  const l = descriptor.limits;
  return (
    <form
      className="queue-controls"
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
      noValidate
      aria-label="Queue workload"
      aria-busy={pending}
    >
      <p className="eyebrow">Predict → run → explain</p>
      <h2>Choose the workload</h2>
      <p className="queue-muted">
        Change one thing. More waiting slots can absorb a burst; only worker
        capacity changes how quickly work can drain.
      </p>
      <fieldset disabled={pending} className="queue-control-set">
        <legend className="sr-only">Queue simulation inputs</legend>
        <div className="queue-presets">
          {descriptor.presets.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className={`queue-preset ${activePreset === preset.id ? "active" : ""}`}
              aria-pressed={activePreset === preset.id}
              onClick={() => selectPreset(preset.id)}
            >
              {preset.title}
            </button>
          ))}
        </div>
        <div className="queue-scalars">
          {field(
            "Workers",
            form.workers,
            "workers",
            (value) => update({ ...form, workers: value }),
            { min: l.minWorkers, max: l.maxWorkers },
          )}
          {field(
            "Waiting slots",
            form.queueCapacity,
            "queueCapacity",
            (value) => update({ ...form, queueCapacity: value }),
            { min: l.minQueueCapacity, max: l.maxQueueCapacity },
          )}
          {field(
            "Seed",
            form.seed,
            "seed",
            (value) => update({ ...form, seed: value }),
            { min: l.minSeed, max: l.maxSeed },
          )}
        </div>
        <p className="queue-muted queue-input-hint">
          Waiting slots exclude running jobs. Seed is replay metadata; this
          version makes no random choices.
        </p>
        <div className="queue-section-heading">
          <h3>Jobs in arrival order</h3>
          <small>
            {form.jobs.length} / {l.maxJobs}
          </small>
        </div>
        <p className="queue-muted queue-input-hint">
          Equal-time arrivals keep row order. Arrival and service times are
          milliseconds of virtual time.
        </p>
        <div className="queue-job-editor" ref={rows}>
          {form.jobs.map((job, index) => (
            <fieldset className="queue-job-row" key={index}>
              <legend>Job {index + 1}</legend>
              {field(
                `Job ${index + 1} ID`,
                job.id,
                `jobs.${index}.id`,
                (value) =>
                  update({
                    ...form,
                    jobs: form.jobs.map((entry, i) =>
                      i === index ? { ...entry, id: value } : entry,
                    ),
                  }),
                undefined,
                index,
              )}
              {field(
                `Job ${index + 1} arrival (ms)`,
                job.arrivalTimeMs,
                `jobs.${index}.arrivalTimeMs`,
                (value) =>
                  update({
                    ...form,
                    jobs: form.jobs.map((entry, i) =>
                      i === index ? { ...entry, arrivalTimeMs: value } : entry,
                    ),
                  }),
                { min: l.minArrivalTimeMs, max: l.maxArrivalTimeMs },
              )}
              {field(
                `Job ${index + 1} service (ms)`,
                job.serviceTimeMs,
                `jobs.${index}.serviceTimeMs`,
                (value) =>
                  update({
                    ...form,
                    jobs: form.jobs.map((entry, i) =>
                      i === index ? { ...entry, serviceTimeMs: value } : entry,
                    ),
                  }),
                { min: l.minServiceTimeMs, max: l.maxServiceTimeMs },
              )}
              <button
                type="button"
                className="queue-remove"
                aria-label={`Remove job ${index + 1}`}
                disabled={form.jobs.length <= l.minJobs}
                onClick={() => {
                  focusAdd.current = true;
                  update({
                    ...form,
                    jobs: form.jobs.filter((_, i) => i !== index),
                  });
                }}
              >
                Remove
              </button>
            </fieldset>
          ))}
        </div>
        {errors.jobs && <p className="queue-field-error">{errors.jobs}</p>}
        <button
          ref={addButton}
          type="button"
          className="button secondary"
          disabled={form.jobs.length >= l.maxJobs}
          onClick={() => {
            let number = 1;
            while (form.jobs.some((job) => job.id === `job-${number}`))
              number++;
            const previous = form.jobs[form.jobs.length - 1]!;
            focusNew.current = true;
            update({
              ...form,
              jobs: [
                ...form.jobs,
                {
                  id: `job-${number}`,
                  arrivalTimeMs: previous.arrivalTimeMs,
                  serviceTimeMs: previous.serviceTimeMs,
                },
              ],
            });
          }}
        >
          Add job
        </button>
      </fieldset>
      <button className="button queue-run" type="submit" disabled={pending}>
        {pending ? "Running queue simulation…" : "Run queue simulation"}
      </button>
    </form>
  );
}
