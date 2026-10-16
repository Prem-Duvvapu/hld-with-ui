import { useId, useLayoutEffect, useRef, useState } from "react";
import type { RetryDescriptor } from "../../api/types";
import type { RetryErrors, RetryForm, RequestDraft } from "./retryForm";
type Scalar = Exclude<keyof RetryForm, "requests" | "backoff" | "jitter">;
export function RetryControls({
  descriptor,
  form,
  errors,
  pending,
  activePreset,
  update,
  selectPreset,
  run,
}: {
  descriptor: RetryDescriptor;
  form: RetryForm;
  errors: RetryErrors;
  pending: boolean;
  activePreset: string;
  update: (next: RetryForm) => void;
  selectPreset: (id: string) => void;
  run: () => void;
}) {
  const scope = useId(),
    element = useRef<HTMLFormElement>(null),
    serial = useRef(0);
  const [policyNotice, setPolicyNotice] = useState("");
  const l = descriptor.limits;
  useLayoutEffect(() => {
    const invalid = element.current?.querySelector<
      HTMLInputElement | HTMLSelectElement
    >('[aria-invalid="true"]');
    if (invalid) {
      const details = invalid.closest("details");
      if (details) details.open = true;
      invalid.focus();
    }
  }, [errors]);
  function field(label: string, key: Scalar, min: number, max: number) {
    const errorId = `${scope}-${key}-error`;
    return (
      <label className="retry-field">
        <span>{label}</span>
        <input
          aria-label={label}
          type="number"
          step={1}
          min={min}
          max={max}
          value={form[key]}
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? errorId : undefined}
          onChange={(e) => update({ ...form, [key]: e.target.value })}
        />
        {errors[key] && (
          <small id={errorId} className="retry-field-error">
            {errors[key]}
          </small>
        )}
      </label>
    );
  }
  function editRow(
    key: string,
    field: keyof Omit<RequestDraft, "key">,
    value: string,
  ) {
    update({
      ...form,
      requests: form.requests.map((r) =>
        r.key === key ? { ...r, [field]: value } : r,
      ),
    });
  }
  function add() {
    let number = 1;
    while (form.requests.some((r) => r.id === `r${number}`)) number++;
    const key = `new-${serial.current++}`;
    update({
      ...form,
      requests: [
        ...form.requests,
        {
          key,
          id: `r${number}`,
          arrivalTimeMs:
            form.requests[form.requests.length - 1]?.arrivalTimeMs ?? "0",
          serviceTimeMs: "80",
        },
      ],
    });
    window.requestAnimationFrame(() =>
      element.current
        ?.querySelector<HTMLInputElement>(`[data-row-key="${key}"]`)
        ?.focus(),
    );
  }
  function remove(index: number) {
    const next = form.requests.filter((_, i) => i !== index);
    update({ ...form, requests: next });
    const key = next[Math.min(index, next.length - 1)]?.key;
    window.requestAnimationFrame(() =>
      element.current
        ?.querySelector<HTMLInputElement>(`[data-row-key="${key}"]`)
        ?.focus(),
    );
  }
  return (
    <form
      ref={element}
      className="retry-controls"
      noValidate
      aria-label="Edit the retry workload"
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
    >
      <p className="eyebrow">Change one condition</p>
      <h2>Configure caller patience and server work</h2>
      <fieldset disabled={pending} className="retry-inputs">
        <legend className="sr-only">Retry experiment inputs</legend>
        <div className="retry-presets">
          {descriptor.presets.map((p) => (
            <button
              type="button"
              key={p.id}
              aria-pressed={activePreset === p.id}
              onClick={() => {
                selectPreset(p.id);
                setPolicyNotice("");
              }}
            >
              {p.title}
            </button>
          ))}
        </div>
        <div className="retry-fields">
          {field(
            "Attempt timeout (ms)",
            "attemptTimeoutMs",
            1,
            l.maxAttemptTimeoutMs,
          )}
          {field(
            "Overall timeout (ms)",
            "overallTimeoutMs",
            1,
            l.maxOverallTimeoutMs,
          )}
          {field("Maximum attempts", "maxAttempts", 1, l.maxAttempts)}
        </div>
        <p className="retry-muted">
          Attempt timeout includes queue wait. Overall timeout starts at each
          request's arrival. Maximum attempts includes the original.
        </p>
        <label className="retry-field">
          <span>Backoff policy</span>
          <select
            aria-label="Backoff policy"
            value={form.backoff}
            aria-invalid={!!errors.backoff}
            onChange={(e) => {
              const backoff = e.target.value as RetryForm["backoff"];
              update({
                ...form,
                backoff,
                baseDelayMs: backoff === "IMMEDIATE" ? "0" : "40",
                maxDelayMs: backoff === "IMMEDIATE" ? "0" : "80",
                jitter: "NONE",
              });
              setPolicyNotice(
                backoff === "IMMEDIATE"
                  ? "Selecting Immediate reset the base and cap to zero and turned jitter off. Current values are shown in Advanced controls."
                  : "Selecting Exponential reset the base to 40 ms, cap to 80 ms and turned jitter off. Current values are shown in Advanced controls.",
              );
            }}
          >
            <option value="IMMEDIATE">Immediate · retry without delay</option>
            <option value="EXPONENTIAL">
              Exponential · wait longer between retries
            </option>
          </select>
          {errors.backoff && (
            <small className="retry-field-error">{errors.backoff}</small>
          )}
        </label>
        {policyNotice && (
          <p className="retry-muted" role="status">
            {policyNotice}
          </p>
        )}
        <h3>Original requests</h3>
        <p className="retry-muted">
          Each request keeps the same service duration across its attempts. Keep
          arrivals in nondecreasing order; equal times keep row order.
        </p>
        {errors.requests && (
          <p className="retry-field-error">{errors.requests}</p>
        )}
        <ol className="retry-request-editors">
          {form.requests.map((row, index) => (
            <li key={row.key}>
              <p className="eyebrow">Request {index + 1}</p>
              <div className="retry-fields">
                {(
                  [
                    ["id", "ID"],
                    ["arrivalTimeMs", "arrival (ms)"],
                    ["serviceTimeMs", "service (ms)"],
                  ] as const
                ).map(([key, text]) => {
                  const error = errors[`requests.${row.key}.${key}`],
                    errorId = `${scope}-${row.key}-${key}-error`;
                  return (
                    <label className="retry-field" key={key}>
                      <span>{`Request ${index + 1} ${text}`}</span>
                      <input
                        aria-label={`Request ${index + 1} ${text}`}
                        data-row-key={key === "id" ? row.key : undefined}
                        type={key === "id" ? "text" : "number"}
                        step={key === "id" ? undefined : 1}
                        maxLength={key === "id" ? l.maxIdLength : undefined}
                        value={row[key]}
                        aria-invalid={!!error}
                        aria-describedby={error ? errorId : undefined}
                        onChange={(e) => editRow(row.key, key, e.target.value)}
                      />
                      {error && (
                        <small id={errorId} className="retry-field-error">
                          {error}
                        </small>
                      )}
                    </label>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={form.requests.length === 1}
                onClick={() => remove(index)}
              >
                Remove request {index + 1}
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          disabled={form.requests.length >= l.maxRequests}
          onClick={add}
        >
          Add request
        </button>
        <details className="retry-advanced">
          <summary>Advanced controls · server, retry delays and budget</summary>
          <h3>Shared server</h3>
          <div className="retry-fields">
            {field("Workers", "workers", 1, l.maxWorkers)}
            {field(
              "Waiting queue capacity",
              "queueCapacity",
              0,
              l.maxQueueCapacity,
            )}
            {field(
              "Dependency unavailable until (ms)",
              "unavailableUntilMs",
              0,
              l.maxUnavailableUntilMs,
            )}
          </div>
          <p className="retry-muted">
            Waiting capacity excludes running work. Zero waiting slots still
            allows an idle worker to start. The dependency admits normally at
            the exact recovery time.
          </p>
          <h3>Retry delay and replay</h3>
          <div className="retry-fields">
            {field(
              "Base delay (ms)",
              "baseDelayMs",
              form.backoff === "IMMEDIATE" ? 0 : 1,
              l.maxDelayMs,
            )}
            {field(
              "Maximum delay (ms)",
              "maxDelayMs",
              form.backoff === "IMMEDIATE" ? 0 : 1,
              l.maxDelayMs,
            )}
          </div>
          <label className="retry-field">
            <span>Jitter</span>
            <select
              aria-label="Jitter"
              value={form.jitter}
              aria-invalid={!!errors.jitter}
              onChange={(e) =>
                update({
                  ...form,
                  jitter: e.target.value as RetryForm["jitter"],
                })
              }
            >
              <option value="NONE">None</option>
              <option value="FULL">
                Full · choose an inclusive bounded delay
              </option>
            </select>
            {errors.jitter && (
              <small className="retry-field-error">{errors.jitter}</small>
            )}
          </label>
          <p className="retry-muted">
            Immediate requires zero base/cap and no jitter. Exponential starts
            at the base and doubles up to the cap. Full jitter uses Java's
            recorded seeded choices; it does not guarantee improvement.
          </p>
          <div className="retry-fields">
            {field("Shared retry budget", "retryBudget", 0, l.maxRetryBudget)}
            {field("Seed", "seed", -l.maxSafeSeed, l.maxSafeSeed)}
          </div>
          <p className="retry-muted">
            The budget covers this finite batch. Originals cost no token; a
            dispatched retry costs one even when rejected. Planning does not
            reserve a token.
          </p>
        </details>
      </fieldset>
      <button
        type="submit"
        className="button primary retry-run"
        disabled={pending}
      >
        {pending ? "Running retry experiment…" : "Run retry experiment"}
      </button>
    </form>
  );
}
