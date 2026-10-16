import { useId, useState } from "react";
import "./AtomicityConceptViews.css";

const responsibilities = [
  {
    id: "published",
    title: "Published stock and records",
    subtitle: "The shared facts another operation can inspect",
    detail:
      "Remaining units, visible allocation records and their revision belong to shared state. Separate writes can expose a stock change before its allocation record. A private proposal changes none of these published facts.",
    takeaway:
      "Ask which related facts must agree whenever another operation can see them.",
  },
  {
    id: "private",
    title: "Each transaction's workspace",
    subtitle: "Prepare related changes before making them visible",
    detail:
      "BEGIN captures stock and revision. In the protected mode, decrement and record prepare a private remaining value and allocation. A prepared zero is a real value; an absent workspace means there is no proposal. Captured base values remain history after the workspace is cleared.",
    takeaway:
      "Private preparation is a proposal. It has not consumed published stock.",
  },
  {
    id: "publication",
    title: "One publication boundary",
    subtitle: "Check the base revision, then publish both pieces",
    detail:
      "Protected COMMIT compares the captured revision with the current published revision. A match publishes stock and allocation together and advances revision once. A mismatch aborts and discards that transaction's private work. The revision covers all published stock and allocation changes, so a conflict can occur even with enough stock left.",
    takeaway:
      "Name the facts protected together and the condition that authorizes publication.",
  },
  {
    id: "abort",
    title: "Abort and effect ownership",
    subtitle: "Discard only the operation's unpublished work",
    detail:
      "A protected ABORT clears its own private proposal. It does not undo another transaction's committed allocation. Split-write ABORT changes actor status but leaves previously published effects in place. A status label alone does not establish that an operation had no effect.",
    takeaway: "Inspect published effects separately from the terminal status.",
  },
  {
    id: "checks",
    title: "Four independent checks",
    subtitle:
      "Capacity, conservation and aborted effects answer different questions",
    detail:
      "Java checks nonnegative remaining stock, allocation within initial capacity, remaining plus allocated equal to initial stock, and absence of published effects from aborted transactions. A split stock-only write breaks conservation. A split abort after both writes can conserve units while retaining an aborted operation's effects.",
    takeaway:
      "A passing conservation total does not prove that an aborted operation left no effects.",
  },
  {
    id: "scope",
    title: "The real storage boundary",
    subtitle: "Translate the example into a requirement for your project",
    detail:
      "This is a local logical model. Choosing a real database transaction requires deciding which rows and conditions are protected, how conflicts are surfaced, and what the durability requirement is. This model does not establish SQL isolation levels, recovery, retries, idempotency, delivery acknowledgements or external side effects.",
    takeaway:
      "Explain the invariant and failure first; then choose a mechanism that actually provides the required guarantee.",
  },
] as const;

export function AtomicityArchitectureView() {
  const scope = useId();
  const [selected, setSelected] = useState<string>("published");
  const responsibility = responsibilities.find((item) => item.id === selected)!;
  return (
    <div className="atomicity-concepts">
      <header className="atomicity-concept-intro">
        <p className="eyebrow">Architecture · Atomicity & abort</p>
        <h2>Which changes become visible together?</h2>
        <p>
          Taking one unit and recording its allocation belong to the same
          operation. Inspect who owns the private proposal, the published facts
          and the decision to publish or discard.
        </p>
        <p className="atomicity-concept-scope">
          Authored logical illustration · No Java run or deployed database
        </p>
      </header>
      <section
        className="atomicity-ownership"
        aria-label="Atomicity ownership diagram"
      >
        {responsibilities.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className="atomicity-responsibility"
            aria-label={`Inspect ${item.title}`}
            aria-pressed={selected === item.id}
            aria-controls={`${scope}-responsibility`}
            onClick={() => setSelected(item.id)}
          >
            <span className="eyebrow">0{index + 1} · Responsibility</span>
            <strong>{item.title}</strong>
            <span>{item.subtitle}</span>
            <span className="atomicity-inspect">
              Inspect this responsibility ↓
            </span>
          </button>
        ))}
      </section>
      <section
        id={`${scope}-responsibility`}
        className="atomicity-concept-card"
        aria-label="Selected atomicity responsibility"
        aria-live="polite"
      >
        <p className="eyebrow">{responsibility.title}</p>
        <h3>{responsibility.subtitle}</h3>
        <p>{responsibility.detail}</p>
        <p className="atomicity-takeaway">{responsibility.takeaway}</p>
      </section>
      <section
        className="atomicity-concept-card"
        aria-label="Atomicity ownership text equivalent"
      >
        <h3>Follow the boundary in words</h3>
        <ol>
          <li>
            BEGIN copies published stock and revision into one transaction's
            base history.
          </li>
          <li>
            Protected stock and allocation actions prepare that transaction's
            private proposal; published state stays unchanged.
          </li>
          <li>
            COMMIT checks the captured revision against the current published
            revision.
          </li>
          <li>
            A match publishes stock and allocation together. A mismatch discards
            only the losing transaction's private work.
          </li>
          <li>
            An explicit protected abort also discards private work. Separate
            published writes remain visible after their abort.
          </li>
          <li>
            Inspect all four state checks and the earlier prefixes before
            explaining whether the whole operation preserved its promises.
          </li>
        </ol>
      </section>
      <section className="atomicity-concept-card">
        <h3>Explain it to a teammate or interviewer</h3>
        <p>
          “We must change stock and its allocation together. Separate writes can
          leave a partial operation when it stops. Private preparation keeps
          that partial work invisible; one validated boundary publishes both
          facts, or discards the proposal. In a real system we still have to
          choose the storage, conflict handling and durability guarantees.”
        </p>
        <p>
          Follow up: What changes if an email must also be sent? What should a
          caller do after a conflict? Those require additional delivery and
          retry decisions beyond this model.
        </p>
      </section>
    </div>
  );
}
