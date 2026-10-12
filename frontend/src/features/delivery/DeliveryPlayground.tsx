import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type {
  DeliveryDescriptor,
  DeliveryInput,
  DeliveryResult,
} from "../../api/types";
import { DeliveryControls } from "./DeliveryControls";
import { DeliveryResults } from "./DeliveryResults";
import {
  parseDeliveryForm,
  toDeliveryForm,
  type DeliveryErrors,
  type DeliveryForm,
} from "./deliveryForm";
import "./Delivery.css";
export function DeliveryPlayground({
  descriptor,
}: {
  descriptor: DeliveryDescriptor;
}) {
  const [form, setForm] = useState(() =>
    toDeliveryForm(descriptor.presets[0]!.input),
  );
  const [activePreset, setActivePreset] = useState(descriptor.presets[0]!.id);
  const [prediction, setPrediction] = useState("");
  const [errors, setErrors] = useState<DeliveryErrors>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false),
    generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const [run, setRun] = useState<{
    id: number;
    input: DeliveryInput;
    result: DeliveryResult;
  } | null>(null);
  function update(next: DeliveryForm) {
    if (busy.current) return;
    setForm(next);
    setActivePreset("");
    setErrors({});
    setError("");
  }
  function selectPreset(id: string) {
    if (busy.current) return;
    const preset = descriptor.presets.find((preset) => preset.id === id);
    if (preset) {
      setForm(toDeliveryForm(preset.input));
      setActivePreset(id);
      setErrors({});
      setError("");
    }
  }
  async function simulate() {
    if (busy.current) return;
    const parsed = parseDeliveryForm(form, descriptor.limits);
    setErrors(parsed.errors);
    setError("");
    if (!parsed.input) {
      setError(
        "Check the highlighted fields before running. Your workload has been kept.",
      );
      return;
    }
    const input = parsed.input,
      capturedGeneration = generation.current;
    busy.current = true;
    setPending(true);
    try {
      const result = await api.runDelivery(input);
      if (capturedGeneration === generation.current)
        setRun((previous) => ({ id: (previous?.id ?? 0) + 1, input, result }));
    } catch (cause: unknown) {
      if (capturedGeneration === generation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "The Java model could not run. Your workload is still here; try again.",
        );
    } finally {
      busy.current = false;
      if (capturedGeneration === generation.current) setPending(false);
    }
  }
  const selected = descriptor.presets.find(
    (preset) => preset.id === activePreset,
  );
  const draftInput = parseDeliveryForm(form, descriptor.limits).input;
  return (
    <div className="delivery-experience">
      <section
        className="delivery-prediction"
        aria-label="Predict the delivery behavior"
      >
        <div>
          <p className="eyebrow">Start with a question</p>
          <h2>
            {selected?.question ??
              "How many deliveries, committed effects and accepted ACKs will you observe?"}
          </h2>
          <p>
            Predict before running. When an ACK is lost, the ledger may already
            have a record while the broker still has no confirmation.
          </p>
        </div>
        <label className="delivery-field">
          <span>Your prediction (optional)</span>
          <textarea
            aria-label="Your prediction (optional)"
            rows={3}
            maxLength={4000}
            value={prediction}
            onChange={(e) => setPrediction(e.target.value)}
            placeholder="I expect… because…"
          />
          <small>
            Kept on this page. Use Practice to save your explanation.
          </small>
        </label>
      </section>
      {error && (
        <div className="delivery-error" role="alert">
          {error}
          {run && (
            <p>
              The previous submitted run is still shown; this attempt produced
              no new result.
            </p>
          )}
        </div>
      )}
      {pending && (
        <p className="delivery-muted" role="status">
          Running the submitted workload in Java.{" "}
          {run
            ? "Previous results remain visible until this run returns."
            : "No result has been received yet."}
        </p>
      )}
      <div className="delivery-workbench">
        <DeliveryControls
          descriptor={descriptor}
          form={form}
          errors={errors}
          pending={pending}
          activePreset={activePreset}
          update={update}
          selectPreset={selectPreset}
          run={() => void simulate()}
        />
        {run ? (
          <DeliveryResults
            key={run.id}
            input={run.input}
            result={run.result}
            stale={
              !draftInput ||
              JSON.stringify(run.input) !== JSON.stringify(draftInput)
            }
          />
        ) : (
          <section className="delivery-empty">
            <div className="delivery-empty-system" aria-hidden="true">
              Broker → Consumer → Ledger
              <br />← ACK
            </div>
            <p className="eyebrow">Your experiment starts here</p>
            <h2>A completed effect is not a received ACK.</h2>
            <p>
              Run the baseline, then lose one ACK or crash a consumer. Step
              through the trace and compare what the broker knows with what the
              ledger actually contains.
            </p>
            <p className="delivery-muted">
              Illustrative durable broker and ledger, with no transaction
              connecting them and no duplicate protection. This model does not
              emulate a specific broker or an external provider.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
