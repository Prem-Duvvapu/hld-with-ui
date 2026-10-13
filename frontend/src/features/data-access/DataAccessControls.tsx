import { useEffect, useId, useRef } from "react";
import type {
  DataAccessDescriptor,
  DataAccessOperation,
} from "../../api/types";
import {
  operationDraft,
  type DataAccessForm,
  type OperationDraft,
} from "./dataAccessForm";

const kinds: Array<{ value: DataAccessOperation["kind"]; label: string }> = [
  { value: "TENANT_RANGE", label: "One tenant in a range" },
  { value: "ALL_RANGE", label: "Every tenant in a range" },
  { value: "LOOKUP_ID", label: "Find a record by ID" },
  { value: "INSERT", label: "Insert a record" },
];
export const indexLabels = {
  NONE: "No secondary index",
  TENANT_CREATED: "Tenant → created order",
  CREATED_TENANT: "Created order → tenant",
};
export function DataAccessControls({
  descriptor,
  form,
  errors,
  pending,
  activePreset,
  update,
  selectPreset,
  run,
}: {
  descriptor: DataAccessDescriptor;
  form: DataAccessForm;
  errors: Record<string, string>;
  pending: boolean;
  activePreset: string;
  update: (next: DataAccessForm) => void;
  selectPreset: (id: string) => void;
  run: () => void;
}) {
  const scope = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (restoreFocus.current) {
      restoreFocus.current = false;
      addButton.current?.focus();
    }
  }, [form.operations.length]);
  function removeOperation(i: number) {
    if (pending) return;
    restoreFocus.current = true;
    update({
      ...form,
      operations: form.operations.filter((_, index) => index !== i),
    });
  }
  function setOperation(i: number, changes: Partial<OperationDraft>) {
    update({
      ...form,
      operations: form.operations.map((op, index) =>
        index === i ? { ...op, ...changes } : op,
      ),
    });
  }
  function addOperation() {
    let number = 1;
    while (
      form.operations.some(
        (op) =>
          op.id === `operation-${number}` ||
          op.uiKey === `new-operation-${number}`,
      )
    )
      number++;
    update({
      ...form,
      operations: [
        ...form.operations,
        {
          ...operationDraft(),
          uiKey: `new-operation-${number}`,
          id: `operation-${number}`,
        },
      ],
    });
  }
  const field = (
    op: OperationDraft,
    i: number,
    key: keyof OperationDraft,
    label: string,
    numeric = false,
    hint?: string,
  ) => {
    const error = errors[`operation-${i}-${key}`];
    const id = `${scope}-${i}-${key}`;
    return (
      <div className="access-field">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          value={op[key]}
          type={numeric ? "number" : "text"}
          {...(numeric
            ? {
                step: 1,
                min: key === "limit" ? 1 : 0,
                max:
                  key === "limit"
                    ? descriptor.limits.maxQueryLimit
                    : descriptor.limits.maxCreatedOrder,
              }
            : { maxLength: descriptor.limits.maxIdLength })}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${id}-detail` : undefined}
          onChange={(event) => setOperation(i, { [key]: event.target.value })}
        />
        {(error || hint) && (
          <small
            id={`${id}-detail`}
            className={error ? "access-error-text" : "access-muted"}
          >
            {error || hint}
          </small>
        )}
      </div>
    );
  };
  return (
    <section className="access-controls" aria-label="Access pattern controls">
      <p className="eyebrow">Change the design</p>
      <h2>Queries come first</h2>
      <p className="access-muted">
        Choose a scenario, change its key order, then ask Java what work
        remains.
      </p>
      <fieldset disabled={pending} className="access-control-set">
        <legend className="sr-only">Dataset, access path and operations</legend>
        <div
          className="access-presets"
          role="group"
          aria-label="Access pattern scenarios"
        >
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
        <div className="access-field">
          <label htmlFor={`${scope}-index`}>Secondary index order</label>
          <select
            id={`${scope}-index`}
            value={form.indexOrder}
            onChange={(event) =>
              update({
                ...form,
                indexOrder: event.target.value as DataAccessForm["indexOrder"],
              })
            }
          >
            {Object.entries(indexLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <small className="access-muted">
            The primary ID lookup remains available in every design.
          </small>
        </div>
        <label className="access-checkbox">
          <input
            type="checkbox"
            checked={form.enforceBusinessKey}
            onChange={(event) =>
              update({ ...form, enforceBusinessKey: event.target.checked })
            }
          />
          <span>Require a unique business key within each tenant</span>
        </label>
        <p className="access-muted">
          This is a separate rule from unique record IDs.
        </p>
        <div className="access-operation-editor">
          {form.operations.map((op, i) => (
            <fieldset key={op.uiKey} className="access-operation-card">
              <legend>Operation {i + 1}</legend>
              {field(op, i, "id", "Operation ID")}
              <div className="access-field">
                <label htmlFor={`${scope}-${i}-kind`}>Operation</label>
                <select
                  id={`${scope}-${i}-kind`}
                  value={op.kind}
                  onChange={(event) =>
                    setOperation(i, {
                      kind: event.target.value as DataAccessOperation["kind"],
                    })
                  }
                >
                  {kinds.map((kind) => (
                    <option key={kind.value} value={kind.value}>
                      {kind.label}
                    </option>
                  ))}
                </select>
              </div>
              {(op.kind === "LOOKUP_ID" || op.kind === "INSERT") &&
                field(op, i, "rowId", "Record ID")}
              {(op.kind === "TENANT_RANGE" || op.kind === "INSERT") &&
                field(op, i, "tenant", "Tenant")}
              {op.kind === "INSERT" ? (
                <>
                  {field(op, i, "businessKey", "Business key")}
                  {field(
                    op,
                    i,
                    "createdOrder",
                    "Created order",
                    true,
                    "An ordering value, not elapsed time.",
                  )}
                </>
              ) : (
                op.kind !== "LOOKUP_ID" && (
                  <>
                    <div className="access-two-fields">
                      {field(op, i, "fromCreatedOrder", "Range start", true)}
                      {field(op, i, "toCreatedOrder", "Range end", true)}
                    </div>
                    {field(
                      op,
                      i,
                      "limit",
                      "Result limit",
                      true,
                      `Both range bounds are included. Return at most ${descriptor.limits.maxQueryLimit} records; evaluate all candidates before this limit.`,
                    )}
                  </>
                )
              )}
              {form.operations.length > 1 && (
                <button
                  type="button"
                  className="access-small-button"
                  onClick={() => removeOperation(i)}
                >
                  Remove operation {i + 1}
                </button>
              )}
            </fieldset>
          ))}
        </div>
        {errors.operations && (
          <p className="access-error-text">{errors.operations}</p>
        )}
        <button
          type="button"
          ref={addButton}
          className="access-small-button"
          disabled={form.operations.length >= descriptor.limits.maxOperations}
          onClick={addOperation}
        >
          Add operation
        </button>
        <details className="access-dataset" open={!!errors.rows}>
          <summary>Edit the initial records</summary>
          <p className="access-muted">
            Up to {descriptor.limits.maxInitialRows} records. Empty data is
            valid. Configured inserts run after this initial set.
          </p>
          <label htmlFor={`${scope}-rows`}>Initial records (JSON)</label>
          <textarea
            id={`${scope}-rows`}
            value={form.rowsText}
            rows={10}
            maxLength={32768}
            spellCheck={false}
            aria-invalid={!!errors.rows}
            aria-describedby={errors.rows ? `${scope}-rows-error` : undefined}
            onChange={(event) =>
              update({ ...form, rowsText: event.target.value })
            }
          />
          {errors.rows && (
            <p id={`${scope}-rows-error`} className="access-error-text">
              {errors.rows}
            </p>
          )}
        </details>
        <button type="button" className="access-run" onClick={run}>
          {pending ? "Running in Java…" : "Run access analysis"}
        </button>
      </fieldset>
    </section>
  );
}
