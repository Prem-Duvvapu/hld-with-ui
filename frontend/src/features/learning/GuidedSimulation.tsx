import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  useModuleActivity,
  usePanelActive,
} from "../../components/ModuleShell";
import type { GuidedCheckpoint } from "../../api/types";
import { getPracticeStore, MAX_ANSWER_LENGTH } from "./practiceStorage";
import { AnswerStorageControls } from "./AnswerStorageControls";
import "./GuidedSimulation.css";

type Run<Input, Result> = { input: Input; result: Result };
type Progress = { prediction: string; revealed: boolean; choice?: string };
type Props<Input, Result extends { modelVersion: string }> = {
  checkpoints: GuidedCheckpoint[];
  presets: readonly { id: string; title: string; input: Input }[];
  topicId: string;
  topicTitle: string;
  contentVersion: string;
  modelVersion: string;
  execute: (input: Input) => Promise<Result>;
  resolveTarget: (result: Result, target: GuidedCheckpoint["target"]) => number;
  renderEvidence: (
    run: Run<Input, Result>,
    position: number,
    checkpointId: string,
  ) => ReactNode;
};

/** Shared saved-answer learning flow; adapters own Java requests and trace interpretation. */
export function GuidedSimulation<
  Input,
  Result extends { modelVersion: string },
>(props: Props<Input, Result>) {
  if (!props.checkpoints.length)
    return (
      <p role="status">No guided checkpoints are available for this lesson.</p>
    );
  return (
    <GuidedSession
      key={`${props.topicId}/${props.contentVersion}/${props.modelVersion}`}
      {...props}
    />
  );
}
function GuidedSession<Input, Result extends { modelVersion: string }>({
  checkpoints,
  presets,
  topicId,
  topicTitle,
  contentVersion,
  execute,
  resolveTarget,
  renderEvidence,
}: Props<Input, Result>) {
  const [localCurrent, setCurrent] = useState(0);
  const { checkpoint: requested, selectCheckpoint } = useModuleActivity();
  const active = usePanelActive();
  const requestedIndex = checkpoints.findIndex((item) => item.id === requested);
  const current = selectCheckpoint ? Math.max(0, requestedIndex) : localCurrent;
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (!active || requestedIndex < 0) return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [active, requestedIndex]);
  const store = getPracticeStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  // One Java run per preset, shared by every checkpoint that uses it.
  const [runs, setRuns] = useState<Record<string, Run<Input, Result>>>({});
  const [pendingPreset, setPendingPreset] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveMessage, setSaveMessage] = useState("");
  const [sessionReveals, setSessionReveals] = useState<Record<string, number>>(
    {},
  );
  const generation = useRef(0);
  const busy = useRef(false);
  const titleId = useId();
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  const checkpoint = checkpoints[current]!;
  const error = errors[checkpoint.id] ?? "";
  const preset = presets.find((p) => p.id === checkpoint.presetId);
  const run = runs[checkpoint.presetId];
  const position = run ? resolveTarget(run.result, checkpoint.target) : -1;
  const matched = position >= 0;
  const resetVersion = store.getResetVersion(topicId);
  const prediction = snapshot.answers.find(
    (answer) =>
      answer.topicId === topicId &&
      answer.activityId === `${checkpoint.id}-prediction`,
  );
  const tradeoff = snapshot.answers.find(
    (answer) =>
      answer.topicId === topicId &&
      answer.activityId === `${checkpoint.id}-tradeoff`,
  );
  const savedTradeoffId =
    tradeoff?.answer.kind === "choice" ? tradeoff.answer.optionId : null;
  const state: Progress = {
    prediction:
      prediction?.answer.kind === "text" ? prediction.answer.text : "",
    // A persisted reveal is not a persisted trace. Never run or fabricate evidence on load.
    revealed: Boolean(
      run &&
      matched &&
      ((prediction?.referenceViewed &&
        prediction.contentVersion === contentVersion) ||
        sessionReveals[checkpoint.id] === resetVersion),
    ),
    choice:
      tradeoff?.answer.kind === "choice" &&
      tradeoff.contentVersion === contentVersion
        ? (tradeoff.answer.optionId ?? undefined)
        : undefined,
  };

  function isRevealed(item: GuidedCheckpoint) {
    const evidence = runs[item.presetId];
    return Boolean(
      evidence &&
      resolveTarget(evidence.result, item.target) >= 0 &&
      (sessionReveals[item.id] === resetVersion ||
        snapshot.answers.some(
          (answer) =>
            answer.topicId === topicId &&
            answer.activityId === `${item.id}-prediction` &&
            answer.contentVersion === contentVersion &&
            answer.referenceViewed,
        )),
    );
  }

  function remember(result: { ok: boolean; message?: string }) {
    setSaveMessage(
      result.ok
        ? ""
        : (result.message ??
            "Your answer could not be saved. Download a backup before leaving."),
    );
  }
  function update(id: string, patch: Partial<Progress>) {
    const previous = store
      .getSnapshot()
      .answers.find(
        (answer) =>
          answer.topicId === topicId &&
          answer.activityId === `${id}-prediction`,
      );
    if (patch.prediction !== undefined || patch.revealed !== undefined) {
      const saved = store.save({
        topicId,
        activityId: `${id}-prediction`,
        contentVersion,
        answer: {
          kind: "text",
          text:
            patch.prediction ??
            (previous?.answer.kind === "text" ? previous.answer.text : ""),
        },
        referenceViewed:
          patch.revealed ??
          Boolean(
            previous?.referenceViewed &&
            previous.contentVersion === contentVersion,
          ),
      });
      remember(saved);
      const acceptedReview = store
        .getSnapshot()
        .answers.some(
          (answer) =>
            answer.topicId === topicId &&
            answer.activityId === `${id}-prediction` &&
            answer.contentVersion === contentVersion &&
            answer.referenceViewed,
        );
      if (patch.revealed && !saved.ok && !acceptedReview)
        setSessionReveals((previous) => ({
          ...previous,
          [id]: store.getResetVersion(topicId),
        }));
    }
    if (patch.choice !== undefined)
      remember(
        store.save({
          topicId,
          activityId: `${id}-tradeoff`,
          contentVersion,
          answer: { kind: "choice", optionId: patch.choice },
          referenceViewed: true,
        }),
      );
  }

  function select(index: number) {
    setCurrent(index);
    if (selectCheckpoint && requested !== checkpoints[index]!.id)
      selectCheckpoint(checkpoints[index]!.id);
    heading.current?.focus({ preventScroll: true });
  }

  async function reveal() {
    if (!preset || busy.current) return;
    const id = checkpoint.id;
    const capturedReset = store.getResetVersion(topicId);
    const capturedGeneration = generation.current;
    const target = checkpoint.target;
    setErrors((previous) => ({ ...previous, [id]: "" }));
    function showEvidence(result: Result) {
      if (resolveTarget(result, target) < 0) {
        setErrors((previous) => ({
          ...previous,
          [id]: `This checkpoint no longer matches the Java evidence (model v${result.modelVersion}). The playground still works.`,
        }));
        return;
      }
      update(id, { revealed: true });
    }
    if (runs[preset.id]) return showEvidence(runs[preset.id]!.result);
    busy.current = true;
    setPendingPreset(preset.id);
    try {
      const result = await execute(preset.input);
      if (
        capturedReset !== store.getResetVersion(topicId) ||
        capturedGeneration !== generation.current
      )
        return;
      setRuns((previous) => ({
        ...previous,
        [preset.id]: { input: preset.input, result },
      }));
      showEvidence(result);
    } catch (cause: unknown) {
      if (
        capturedReset === store.getResetVersion(topicId) &&
        capturedGeneration === generation.current
      )
        setErrors((previous) => ({
          ...previous,
          [id]:
            cause instanceof Error
              ? cause.message
              : "The Java model could not run.",
        }));
    } finally {
      busy.current = false;
      if (capturedGeneration === generation.current) setPendingPreset(null);
    }
  }

  const pending = pendingPreset !== null;
  const chosen = checkpoint.tradeoff.options.find(
    (option) => option.id === state.choice,
  );
  const recommended = checkpoint.tradeoff.options.find(
    (option) => option.id === checkpoint.tradeoff.recommendedOptionId,
  );

  return (
    <div>
      <AnswerStorageControls
        topicId={topicId}
        topicTitle={topicTitle}
        label="Guided answer storage"
      />
      <div className="guided">
        <nav className="guided-steps" aria-label="Checkpoints">
          <ol>
            {checkpoints.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={index === current ? "step" : undefined}
                  onClick={() => select(index)}
                >
                  <span aria-hidden="true">
                    {isRevealed(item) ? "✓" : index + 1}
                  </span>
                  {item.title}
                  {isRevealed(item) && (
                    <span className="sr-only"> (revealed)</span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <article className="guided-card" aria-labelledby={titleId}>
          <p className="overline">
            Checkpoint {current + 1} of {checkpoints.length} · Preset:{" "}
            {preset?.title ?? checkpoint.presetId}
          </p>
          <h2 id={titleId} ref={heading} tabIndex={-1}>
            {checkpoint.title}
          </h2>
          {requested && requestedIndex < 0 && (
            <p className="practice-version-note" role="note">
              This saved checkpoint is no longer available. Your answers remain
              in your backup; start with the current first checkpoint.
            </p>
          )}
          {prediction && prediction.contentVersion !== contentVersion && (
            <p className="practice-version-note" role="note">
              Your prediction was saved for content v{prediction.contentVersion}
              . Review it against this lesson and run the model again.
            </p>
          )}
          {tradeoff &&
            (tradeoff.contentVersion !== contentVersion ||
              (tradeoff.answer.kind === "choice" &&
                !checkpoint.tradeoff.options.some(
                  (option) => option.id === savedTradeoffId,
                ))) && (
              <p className="practice-version-note" role="note">
                Previous tradeoff choice:{" "}
                {tradeoff.answer.kind === "choice"
                  ? (tradeoff.answer.optionId ?? "No choice")
                  : "No choice"}
                , saved for content v{tradeoff.contentVersion}. Choose again
                after revealing the evidence; your previous answer stays in the
                backup until you revise it.
              </p>
            )}
          {prediction?.referenceViewed && !run && (
            <p className="practice-version-note">
              Your saved answer is restored. Run and reveal to generate the Java
              evidence again; model results are not stored.
            </p>
          )}

          <section className="guided-step">
            <h3>1. Predict</h3>
            <p>{checkpoint.prompt}</p>
            <label className="guided-prediction">
              <span>
                {state.revealed
                  ? "Your prediction (revise it after seeing the evidence)"
                  : "Your prediction (optional)"}
              </span>
              <textarea
                rows={3}
                maxLength={MAX_ANSWER_LENGTH}
                value={state.prediction}
                onChange={(event) =>
                  update(checkpoint.id, { prediction: event.target.value })
                }
              />
            </label>
            {!state.revealed && (
              <button
                type="button"
                className="button primary"
                onClick={reveal}
                disabled={pending || !preset}
              >
                {pending ? "Running the Java model…" : "Run and reveal"}
              </button>
            )}
            {!preset && (
              <p className="error-text" role="alert">
                The preset “{checkpoint.presetId}” is not available from the
                Java model, so this checkpoint cannot run.
              </p>
            )}
            {saveMessage && (
              <p className="error-text" role="alert">
                {saveMessage}
              </p>
            )}
            {error && (
              <p className="error-text" role="alert">
                {error} Select “Run and reveal” to try again.
              </p>
            )}
          </section>

          {state.revealed && run && (
            <>
              <section className="guided-step">
                <h3>2. Look at the evidence</h3>
                <p>{checkpoint.lookFor}</p>
                {renderEvidence(run, position, checkpoint.id)}
              </section>

              <section className="guided-step">
                <h3>3. Why it happens</h3>
                <p>{checkpoint.explanation}</p>
              </section>

              <fieldset className="guided-step guided-tradeoff">
                <legend>
                  <h3>4. Choose a tradeoff</h3>
                </legend>
                <p>{checkpoint.tradeoff.prompt}</p>
                {checkpoint.tradeoff.options.map((option) => (
                  <label key={option.id} className="guided-option">
                    <input
                      type="radio"
                      name={`tradeoff-${checkpoint.id}`}
                      value={option.id}
                      checked={state.choice === option.id}
                      onChange={() =>
                        update(checkpoint.id, { choice: option.id })
                      }
                    />
                    {option.label}
                  </label>
                ))}
                {chosen && (
                  <div className="guided-feedback" role="status">
                    <strong>
                      {chosen.id === recommended?.id
                        ? "Recommended choice."
                        : `Recommended: ${recommended?.label}.`}
                    </strong>
                    <p>{chosen.feedback}</p>
                    {chosen.id !== recommended?.id && recommended && (
                      <p>{recommended.feedback}</p>
                    )}
                  </div>
                )}
              </fieldset>
            </>
          )}

          <div className="guided-nav">
            <button
              type="button"
              className="button secondary"
              disabled={current === 0}
              onClick={() => select(current - 1)}
            >
              ← Previous checkpoint
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={current === checkpoints.length - 1}
              onClick={() => select(current + 1)}
            >
              Next checkpoint →
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
