import { useId, useLayoutEffect, useRef, useState } from "react";
import paths from "./atomicityAuthoredPaths.json";
import "./AtomicityConceptViews.css";

type AuthoredStep = (typeof paths)[number]["steps"][number];
function AuthoredState({ step }: { step: AuthoredStep }) {
  return (
    <div className="atomicity-authored-state">
      <dl className="atomicity-authored-counts">
        <div>
          <dt>Published remaining units</dt>
          <dd>{step.remainingUnits}</dd>
        </div>
        <div>
          <dt>Published allocated units</dt>
          <dd>{step.allocatedUnits}</dd>
        </div>
        <div>
          <dt>Published revision</dt>
          <dd>{step.revision}</dd>
        </div>
      </dl>
      <ul className="atomicity-authored-actors">
        {step.actors.map((actor) => (
          <li key={actor.id}>
            <h4>
              Transaction {actor.id} · {actor.phase}
            </h4>
            <dl>
              <div>
                <dt>Captured stock / revision</dt>
                <dd>
                  {actor.baseRemaining ?? "Not begun"} /{" "}
                  {actor.baseRevision ?? "Not begun"}
                </dd>
              </div>
              <div>
                <dt>Private remaining proposal</dt>
                <dd>
                  {"workingRemaining" in actor
                    ? actor.workingRemaining
                    : "No private workspace"}
                </dd>
              </div>
              <div>
                <dt>Pending stock units</dt>
                <dd>{actor.pendingStockUnits}</dd>
              </div>
              <div>
                <dt>Private allocation</dt>
                <dd>
                  {actor.pendingAllocation
                    ? "1 unit · not published"
                    : "No private allocation"}
                </dd>
              </div>
              <div>
                <dt>Stock units already published</dt>
                <dd>{actor.appliedStockUnits}</dd>
              </div>
              {"failureReason" in actor && actor.failureReason && (
                <div>
                  <dt>Decision reason</dt>
                  <dd>{actor.failureReason}</dd>
                </div>
              )}
            </dl>
          </li>
        ))}
      </ul>
      <dl className="atomicity-authored-checks">
        {[
          ["Remaining stock is nonnegative", step.remainingNonnegative],
          [
            "Allocated units fit initial capacity",
            step.allocatedWithinCapacity,
          ],
          ["Remaining + allocated equals initial stock", step.unitsConserved],
          [
            "Aborted transactions have no published effects",
            step.abortedEffectsAbsent,
          ],
        ].map(([label, passed]) => (
          <div key={String(label)}>
            <dt>{label}</dt>
            <dd>{passed ? "Preserved" : "Violated"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function AtomicitySequenceView() {
  const scope = useId();
  const [pathId, setPathId] = useState("split-abort");
  const [position, setPosition] = useState(0);
  const previousButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const path = paths.find((item) => item.id === pathId)!;
  const step = path.steps[position]!;
  useLayoutEffect(() => {
    if (
      document.activeElement === nextButton.current &&
      nextButton.current?.disabled
    )
      previousButton.current?.focus();
    else if (
      document.activeElement === previousButton.current &&
      previousButton.current?.disabled
    )
      nextButton.current?.focus();
  }, [position]);
  return (
    <div className="atomicity-concepts">
      <header className="atomicity-concept-intro">
        <p className="eyebrow">Operation sequence · Atomicity & abort</p>
        <h2>Follow private work to its publication decision</h2>
        <p>
          Compare a partial published operation, one complete publication, and a
          conflicting proposal that is discarded.
        </p>
        <p className="atomicity-concept-scope">
          Authored illustrations · Manual steps · No Java run or elapsed time ·
          Use Playground or Guided for returned Java evidence
        </p>
      </header>
      <fieldset className="atomicity-path-choice">
        <legend>Choose an authored atomicity path</legend>
        {paths.map((item) => (
          <label key={item.id}>
            <input
              type="radio"
              name={`${scope}-path`}
              checked={pathId === item.id}
              onChange={() => {
                setPathId(item.id);
                setPosition(0);
              }}
            />
            <span>{item.title}</span>
          </label>
        ))}
      </fieldset>
      <section
        className="atomicity-concept-card"
        aria-label="Selected atomicity path step"
        aria-live="polite"
      >
        <div className="atomicity-scene-heading">
          <p className="eyebrow">
            Step {position + 1} of {path.steps.length} · {step.id}
          </p>
          <span className="atomicity-authored-label">Authored state</span>
        </div>
        <h3>{step.title}</h3>
        <p className="atomicity-path-edge">
          {step.from} → {step.to}
        </p>
        <p>{step.detail}</p>
        <AuthoredState step={step} />
        <div className="atomicity-path-controls">
          <button
            ref={previousButton}
            type="button"
            disabled={position === 0}
            onClick={() => setPosition(position - 1)}
          >
            Previous atomicity path step
          </button>
          <button
            ref={nextButton}
            type="button"
            disabled={position === path.steps.length - 1}
            onClick={() => setPosition(position + 1)}
          >
            Next atomicity path step
          </button>
          <button type="button" onClick={() => setPosition(0)}>
            Reset atomicity path
          </button>
        </div>
      </section>
      <section
        className="atomicity-concept-card"
        aria-label="Authored atomicity path explanation"
      >
        <h3>{path.title}</h3>
        <p>{path.summary}</p>
        <p className="atomicity-takeaway">{path.takeaway}</p>
        <p className="atomicity-concept-scope">
          Illustrates preset {path.presetId}. COMMITTED means local modeled
          publication. SQL isolation, durable commit, database recovery,
          retries, idempotency and external effects remain outside this
          illustration.
        </p>
      </section>
      <details className="atomicity-full-sequence">
        <summary>Full atomicity text sequence</summary>
        <section aria-label="Authored atomicity sequence">
          <h3>Every authored step in order</h3>
          <ol>
            {path.steps.map((item, index) => (
              <li
                key={item.id}
                aria-current={position === index ? "step" : undefined}
              >
                <p className="eyebrow">{item.id}</p>
                <h4>{item.title}</h4>
                <p>
                  {item.from} → {item.to}. {item.detail}
                </p>
                <AuthoredState step={item} />
              </li>
            ))}
          </ol>
        </section>
      </details>
    </div>
  );
}
