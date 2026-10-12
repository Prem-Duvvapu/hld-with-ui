import { useRef, useState } from "react";
import { api } from "../../api/client";
import type {
  QueueCapacityDescriptor,
  QueueCapacityInput,
  QueueCapacityResult,
} from "../../api/types";
import { QueueControls } from "./QueueControls";
import { QueueResults } from "./QueueResults";
import {
  queueInput,
  toQueueForm,
  validateQueueForm,
  type QueueErrors,
  type QueueForm,
} from "./queueForm";
import "./Queues.css";
export function QueuePlayground({
  descriptor,
}: {
  descriptor: QueueCapacityDescriptor;
}) {
  const [form, setForm] = useState(() =>
    toQueueForm(descriptor.presets[0]!.input),
  );
  const [activePreset, setActivePreset] = useState(descriptor.presets[0]!.id);
  const [prediction, setPrediction] = useState("");
  const [errors, setErrors] = useState<QueueErrors>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [run, setRun] = useState<{
    id: number;
    form: string;
    input: QueueCapacityInput;
    result: QueueCapacityResult;
  } | null>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  function update(next: QueueForm) {
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
      setForm(toQueueForm(preset.input));
      setActivePreset(id);
      setErrors({});
      setError("");
    }
  }
  async function simulate() {
    if (busy.current) return;
    const invalid = validateQueueForm(form, descriptor.limits);
    setErrors(invalid);
    setError("");
    if (Object.keys(invalid).length) {
      setError("Check the highlighted fields before running.");
      window.requestAnimationFrame(() => errorSummary.current?.focus());
      return;
    }
    const input = queueInput(form);
    const captured = JSON.stringify(form);
    busy.current = true;
    setPending(true);
    try {
      const result = await api.runQueue(input);
      setRun((previous) => ({
        id: (previous?.id ?? 0) + 1,
        form: captured,
        input,
        result,
      }));
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The queue run failed. Your workload is still here; try running again.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const selected = descriptor.presets.find(
    (preset) => preset.id === activePreset,
  );
  return (
    <div className="queue-experience">
      <section
        className="queue-prediction"
        aria-label="Predict the queue behavior"
      >
        <div>
          <p className="eyebrow">Start with a question</p>
          <h2>
            {selected?.question ??
              "Which jobs will wait, complete or be rejected?"}
          </h2>
          <p>
            Before running, predict one outcome. Afterwards, explain it using
            the waiting queue and worker states. A queue is a buffer, not extra
            processing capacity.
          </p>
        </div>
        <label className="queue-field">
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
        <div
          className="queue-error"
          role="alert"
          tabIndex={-1}
          ref={errorSummary}
        >
          {error}
          {run && (
            <p>
              The previous run is still shown below; this attempt produced no
              new result.
            </p>
          )}
        </div>
      )}
      <div className="queue-playground">
        <QueueControls
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
          <QueueResults
            key={run.id}
            result={run.result}
            input={run.input}
            stale={run.form !== JSON.stringify(form)}
          />
        ) : (
          <section className="queue-empty">
            <div className="queue-empty-symbol" aria-hidden="true">
              [ ] → □ □
            </div>
            <p className="eyebrow">Your experiment starts here</p>
            <h2>See the buffer and the workers separately.</h2>
            <p>
              Choose a preset, make a prediction, then run. Step through each
              admitted event to see where work waits and why a full queue
              rejects a job.
            </p>
            <p className="queue-muted">
              One shared in-memory FIFO queue; no broker durability,
              acknowledgments, failures or retries are modeled.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
