import { useId, useLayoutEffect, useRef, useState } from "react";
import "./ReservationConceptViews.css";

const responsibilities = [
  {
    id: "observations",
    title: "Local observations",
    subtitle: "A previous read belongs to one reservation",
    detail:
      "A and B have distinct IDs and requested quantities. READ saves the current count for that actor and changes its status, without allocating anything. An absent observation means Not read yet; a saved zero is a real read. Their unique IDs distinguish contenders but do not supply stock or deduplicate retries.",
    takeaway:
      "Seeing a unit is a preview. Identify the later acceptance decision before promising that unit.",
  },
  {
    id: "inventory",
    title: "Shared inventory",
    subtitle: "One current remaining count per model run",
    detail:
      "Every reservation competes for the same finite stock. An acceptance can change current remaining units while another actor retains its earlier observation. Each Java run owns separate local state; this diagram contains no deployed database, replicas or real threads.",
    takeaway:
      "Compare the earlier observation with the value actually checked at the attempt.",
  },
  {
    id: "boundary",
    title: "Acceptance boundary",
    subtitle: "Current condition, stock change and allocation together",
    detail:
      "The protected action checks current shared stock, subtracts the requested quantity and appends its allocation indivisibly. The unsafe action is also complete, but checks and assigns from its saved observation. Its wrong decision source can violate the rule even without an interleaving inside the action.",
    takeaway:
      "Name both the decision source and the full protected scope. Local acceptance is not a durable database commit.",
  },
  {
    id: "allocations",
    title: "Allocation records",
    subtitle: "Accepted quantities in acceptance order",
    detail:
      "Each accepted record contains reservation ID, requested quantity and accepting step ID. Allocated units count quantities, not merely accepted IDs: one reservation can consume two units. The protected boundary coordinates these records with stock. The model establishes no persistent ledger, crash recovery or external effect.",
    takeaway:
      "Reconcile what remains with what was allocated; a counter alone cannot tell the whole story.",
  },
  {
    id: "rejection",
    title: "Business rejection",
    subtitle: "A valid decision can leave shared stock unchanged",
    detail:
      "An insufficient checked value changes the actor to REJECTED and retains its earlier observation. Shared inventory and the allocation list stay unchanged. This business outcome belongs to a completed legal schedule. Invalid ordering and an unavailable API provide different evidence.",
    takeaway:
      "A rejected actor changed state, even though no stock was consumed and no allocation was appended.",
  },
  {
    id: "invariants",
    title: "Declared invariants",
    subtitle: "Three separate checks at each returned snapshot",
    detail:
      "Java reports nonnegative remaining stock, allocated units within initial capacity, and remaining plus allocated equal to initial stock. With initial 2 and stale one-unit assignments, remaining 1 and allocated 2 pass capacity but fail conservation: accounted units are 3. A passing early prefix cannot approve a later unsafe step.",
    takeaway:
      "Keep the three checks separate and read them at the selected step, not as a prediction of later correctness.",
  },
] as const;

export function ReservationArchitectureView() {
  const scope = useId();
  const [selected, setSelected] = useState<string>("observations");
  const responsibility = responsibilities.find((item) => item.id === selected)!;
  return (
    <div className="reservation-concepts">
      <header className="reservation-concept-intro">
        <p className="eyebrow">Architecture · Decision ownership</p>
        <h2>Who owns the decision?</h2>
        <p>
          An observation belongs to one reservation. Shared stock and recorded
          allocations belong to the acceptance boundary.
        </p>
        <p className="reservation-concept-scope">
          Authored logical illustration · No Java run · No deployed database or
          measured timing
        </p>
      </header>
      <section
        className="reservation-ownership"
        aria-label="Reservation ownership diagram"
      >
        {responsibilities.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`reservation-responsibility ${selected === item.id ? "selected" : ""}`}
            aria-label={`Inspect ${item.title}`}
            aria-pressed={selected === item.id}
            aria-controls={`${scope}-responsibility`}
            onClick={() => setSelected(item.id)}
          >
            <span className="eyebrow">0{index + 1} · Responsibility</span>
            <strong>{item.title}</strong>
            <span>{item.subtitle}</span>
            <span className="reservation-inspect">
              Inspect this responsibility ↓
            </span>
          </button>
        ))}
        <div className="reservation-ownership-flow">
          <p>
            <strong>Preview</strong> Shared stock → each actor's saved
            observation
          </p>
          <p>
            <strong>Protected acceptance</strong> Current check → stock
            subtraction + allocation record, in one complete action
          </p>
          <p>
            <strong>Rejection</strong> Checked stock is insufficient → actor
            becomes rejected; inventory and allocations stay unchanged
          </p>
        </div>
      </section>
      <section
        id={`${scope}-responsibility`}
        className="reservation-concept-card"
        aria-label="Selected reservation responsibility"
        aria-live="polite"
      >
        <p className="eyebrow">{responsibility.title}</p>
        <h3>{responsibility.subtitle}</h3>
        <p>{responsibility.detail}</p>
        <p className="reservation-concept-takeaway">
          {responsibility.takeaway}
        </p>
      </section>
      <section
        className="reservation-concept-card"
        aria-label="Reservation ownership text equivalent"
      >
        <h3>Follow the responsibilities in words</h3>
        <ol>
          <li>
            Each reservation has a distinct ID, requested quantity and its own
            earlier observation.
          </li>
          <li>
            READ saves shared remaining stock for that actor; it does not
            reserve units.
          </li>
          <li>
            The attempt chooses a decision source: saved stock for the unsafe
            strategy, current stock for the protected strategy.
          </li>
          <li>
            The protected acceptance checks, subtracts stock and appends its
            allocation inside one indivisible modeled action.
          </li>
          <li>
            Insufficient stock changes the actor's status to rejected, while
            shared inventory and allocations remain unchanged.
          </li>
          <li>
            Java reports capacity, nonnegative stock and conservation separately
            at every returned snapshot.
          </li>
        </ol>
      </section>
      <div className="reservation-concept-notes">
        <section className="reservation-concept-card">
          <h3>State the modeled boundary</h3>
          <p>
            Both algorithms finish accepted changes as complete logical actions.
            The difference is the checked value. Neither algorithm emulates a
            SQL isolation level or supplies durability, rollback, retries,
            idempotency, fairness or external effects.
          </p>
        </section>
        <section className="reservation-concept-card">
          <h3>Explain it to a teammate</h3>
          <p>
            What becomes stale, where is acceptance decided, and which shared
            facts must change together? Use the one-unit example before choosing
            a real storage or transaction mechanism.
          </p>
        </section>
      </div>
    </div>
  );
}

type AuthoredStep = {
  id: string;
  title: string;
  from: string;
  to: string;
  detail: string;
  remaining: number;
  allocated: number;
  accounted: number;
  actors: string;
  allocations: string;
  nonnegative: "Preserved" | "Violated";
  capacity: "Preserved" | "Violated";
  conservation: "Preserved" | "Violated";
};
const initial: AuthoredStep = {
  id: "initial",
  title: "Initial state",
  from: "Submitted workload",
  to: "Shared stock and two reservations",
  detail:
    "Initial stock is 1 unit. A and B each request 1. Neither has read or attempted, and no allocation exists.",
  remaining: 1,
  allocated: 0,
  accounted: 1,
  actors:
    "A: NOT_READ, quantity 1, observation absent. B: NOT_READ, quantity 1, observation absent.",
  allocations: "None.",
  nonnegative: "Preserved",
  capacity: "Preserved",
  conservation: "Preserved",
};
const readA: AuthoredStep = {
  ...initial,
  id: "read-a",
  title: "A reads the available unit",
  from: "Shared stock",
  to: "A's saved observation",
  detail:
    "READ A records observation 1 and changes A to READ_OBSERVED. It does not consume stock or append an allocation.",
  actors:
    "A: READ_OBSERVED, quantity 1, observation 1. B: NOT_READ, quantity 1, observation absent.",
};
const readB: AuthoredStep = {
  ...readA,
  id: "read-b",
  title: "B reads the same available unit",
  from: "Shared stock",
  to: "B's saved observation",
  detail:
    "READ B also records observation 1. Both reservations now remember the same unit, but no acceptance decision has been made.",
  actors:
    "A: READ_OBSERVED, quantity 1, observation 1. B: READ_OBSERVED, quantity 1, observation 1.",
};
const staleA: AuthoredStep = {
  ...readB,
  id: "attempt-a",
  title: "A accepts from its earlier read",
  from: "A's saved observation",
  to: "Stock and allocation A",
  detail:
    "A checks SNAPSHOT 1 against quantity 1, assigns 1 − 1 = 0 and appends allocation A in one complete action. B still remembers 1.",
  remaining: 0,
  allocated: 1,
  accounted: 1,
  actors:
    "A: ACCEPTED, quantity 1, observation 1. B: READ_OBSERVED, quantity 1, observation 1.",
  allocations: "A · quantity 1 · step attempt-a.",
};

// Fixed authored examples of the Java preset rules, not a frontend simulator.
const paths: readonly {
  id: string;
  title: string;
  preset: string;
  summary: string;
  takeaway: string;
  steps: readonly AuthoredStep[];
}[] = [
  {
    id: "unsafe",
    title: "Both accept from an earlier read",
    preset: "unsafe-baseline",
    summary:
      "Stale read then assignment · Initial stock 1 · A and B request 1 each · Both READs before either attempt.",
    takeaway:
      "Both saved the same unit. Remaining stock stays zero while allocations grow to two; nonnegative stock alone misses the breach.",
    steps: [
      initial,
      readA,
      readB,
      staleA,
      {
        ...staleA,
        id: "attempt-b",
        title: "B allocates the same observed unit",
        from: "B's saved observation",
        to: "Stock and allocation B",
        detail:
          "B checks SNAPSHOT 1 against quantity 1 and assigns 1 − 1 = 0 again, replacing current 0. Appending B's allocation makes allocated units 2 from initial stock 1. This is the first violating step.",
        allocated: 2,
        accounted: 2,
        actors:
          "A: ACCEPTED, quantity 1, observation 1. B: ACCEPTED, quantity 1, observation 1.",
        allocations:
          "A · quantity 1 · step attempt-a; B · quantity 1 · step attempt-b.",
        capacity: "Violated",
        conservation: "Violated",
      },
    ],
  },
  {
    id: "protected",
    title: "Current stock rejects the later attempt",
    preset: "protected-baseline",
    summary:
      "Current-state conditional reservation · Same initial stock, quantities and shared-read order.",
    takeaway:
      "B remembers one unit, but the acceptance boundary checks current zero. B rejects while stock and A's allocation stay consistent.",
    steps: [
      initial,
      readA,
      readB,
      {
        ...staleA,
        title: "A accepts against current stock",
        from: "Current shared stock",
        to: "Protected stock and allocation boundary",
        detail:
          "A checks CURRENT 1 against quantity 1. The condition, decrement 1 − 1 = 0 and allocation append form one indivisible modeled action. B's observation remains 1.",
      },
      {
        ...staleA,
        id: "attempt-b",
        title: "B checks zero and rejects",
        from: "Current shared stock",
        to: "B's rejected business decision",
        detail:
          "B checks CURRENT 0 against quantity 1 and reports INSUFFICIENT_STOCK. Its status changes to REJECTED, retaining observation 1. Stock and allocation A do not change.",
        actors:
          "A: ACCEPTED, quantity 1, observation 1. B: REJECTED, quantity 1, observation 1.",
      },
    ],
  },
  {
    id: "serial",
    title: "A serial order hides the flaw",
    preset: "serial-control",
    summary:
      "Same stale algorithm · READ A, ATTEMPT A, READ B, ATTEMPT B · B reads only after A consumes the unit.",
    takeaway:
      "This favorable order passes because B reads zero. Move B's read before A's attempt to expose the stale algorithm's flaw.",
    steps: [
      initial,
      readA,
      {
        ...staleA,
        detail:
          "A checks SNAPSHOT 1 against quantity 1, assigns remaining 0 and appends allocation A. B has not read yet, so its observation is absent.",
        actors:
          "A: ACCEPTED, quantity 1, observation 1. B: NOT_READ, quantity 1, observation absent.",
      },
      {
        ...staleA,
        id: "read-b",
        title: "B reads stock after A accepts",
        from: "Current shared stock",
        to: "B's saved observation",
        detail:
          "B now records observation 0 and becomes READ_OBSERVED. Stock remains 0, and allocation A is unchanged.",
        actors:
          "A: ACCEPTED, quantity 1, observation 1. B: READ_OBSERVED, quantity 1, observation 0.",
      },
      {
        ...staleA,
        id: "attempt-b",
        title: "B rejects from its saved zero",
        from: "B's saved observation",
        to: "B's rejected business decision",
        detail:
          "B checks SNAPSHOT 0 against quantity 1 and reports INSUFFICIENT_STOCK. Stock and allocations stay unchanged. This passing serial order does not prove that other legal interleavings are safe.",
        actors:
          "A: ACCEPTED, quantity 1, observation 1. B: REJECTED, quantity 1, observation 0.",
      },
    ],
  },
];

function AuthoredState({ step }: { step: AuthoredStep }) {
  return (
    <div className="reservation-authored-state">
      <dl className="reservation-authored-counts">
        <div>
          <dt>Remaining units</dt>
          <dd>{step.remaining}</dd>
        </div>
        <div>
          <dt>Allocated units</dt>
          <dd>{step.allocated}</dd>
        </div>
        <div>
          <dt>Accounted units</dt>
          <dd>{step.accounted}</dd>
        </div>
      </dl>
      <p>
        <strong>Actor state:</strong> {step.actors}
      </p>
      <p>
        <strong>Accepted allocations:</strong> {step.allocations}
      </p>
      <dl className="reservation-authored-checks">
        <div>
          <dt>Nonnegative remaining stock</dt>
          <dd>{step.nonnegative}</dd>
        </div>
        <div>
          <dt>Within initial capacity</dt>
          <dd>{step.capacity}</dd>
        </div>
        <div>
          <dt>Units conserved</dt>
          <dd>{step.conservation}</dd>
        </div>
      </dl>
    </div>
  );
}

export function ReservationSequenceView() {
  const scope = useId();
  const [pathId, setPathId] = useState("unsafe");
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
    <div className="reservation-concepts">
      <header className="reservation-concept-intro">
        <p className="eyebrow">
          Operation sequence · Observe, decide, allocate
        </p>
        <h2>Follow the same unit through three orders</h2>
        <p>
          Inspect an unsafe shared read, a protected current-state check and a
          serial control that hides the flaw.
        </p>
        <p className="reservation-concept-scope">
          Authored illustrations · Manual steps · No Java run or elapsed time ·
          Use Playground or Guided for returned Java evidence
        </p>
      </header>
      <fieldset className="reservation-path-choice">
        <legend>Choose an authored path</legend>
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
        className="reservation-concept-card"
        aria-label="Selected reservation path step"
        aria-live="polite"
      >
        <div className="reservation-scene-heading">
          <p className="eyebrow">
            Step {position + 1} of {path.steps.length} · {step.id}
          </p>
          <span className="reservation-authored-label">Authored state</span>
        </div>
        <h3>{step.title}</h3>
        <p className="reservation-path-edge">
          {step.from} → {step.to}
        </p>
        <p>{step.detail}</p>
        <AuthoredState step={step} />
        <div className="reservation-path-controls">
          <button
            ref={previousButton}
            type="button"
            disabled={position === 0}
            onClick={() => setPosition(position - 1)}
          >
            Previous path step
          </button>
          <button
            ref={nextButton}
            type="button"
            disabled={position === path.steps.length - 1}
            onClick={() => setPosition(position + 1)}
          >
            Next path step
          </button>
          <button type="button" onClick={() => setPosition(0)}>
            Reset path
          </button>
        </div>
      </section>
      <section
        className="reservation-concept-card"
        aria-label="Authored path explanation"
      >
        <h3>{path.title}</h3>
        <p>{path.summary}</p>
        <p className="reservation-concept-takeaway">{path.takeaway}</p>
        <p className="reservation-concept-limit">
          Illustrates preset {path.preset}. Acceptance means local allocation,
          not durable commit. No isolation-level emulation, rollback, retries,
          idempotency or timing.
        </p>
      </section>
      <details className="reservation-full-sequence">
        <summary>Full text sequence</summary>
        <section aria-label="Authored reservation sequence">
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
