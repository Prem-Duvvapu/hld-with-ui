import { useId, useState } from "react";
import "./IdempotencyDesign.css";

const responsibilities = [
  {
    id: "caller",
    title: "Caller identity",
    subtitle: "Name the intended work and the retry key",
    detail:
      "Each call names a tenant, key, payload units and an operation ID. The server looks up the typed pair (tenant, key) for this one endpoint and compares units. Operation ID groups intended work for auditing; it is not part of deduplication. A different key can execute the same audited intent again. Tenant scope is namespacing here, not an authorization implementation.",
    takeaway:
      "Preserve the key when retrying the same intended work; define tenant identity and authorization separately in a real design.",
    edge: "Submit one call to its handler",
  },
  {
    id: "lookup",
    title: "Key lookup",
    subtitle: "Observe the active retained result",
    detail:
      "Before every authored action, Java marks a key record expired when the action time reaches its expiry. A lookup can miss, cache the original matching receipt, or report a payload conflict. Two concurrent calls can both observe a miss. That observation reserves nothing and grants no authority to publish a later protected effect.",
    takeaway: "A lookup miss is an observation, not publication authority.",
    edge: "A miss may proceed to business work",
  },
  {
    id: "private",
    title: "Private work",
    subtitle: "Prepare without making an effect public",
    detail:
      "In atomic mode, WRITE_EFFECT prepares units in this call's private workspace. It does not add an effect to the public ledger. The publication step can consume that preparation, discard it to reuse an existing receipt, or discard it on a conflict. A handler crash clears private units and its cached receipt. Unprotected and split modes publish at the earlier write step instead.",
    takeaway: "Prepared work and published work must stay visibly separate.",
    edge: "SAVE_RESULT reaches the publication decision",
  },
  {
    id: "publication",
    title: "Publication boundary",
    subtitle: "Recheck the current key before publishing",
    detail:
      "Atomic mode checks the current active key inside the same indivisible transition that publishes the effect and retained receipt. A missing key allows joint publication; matching units reuse the original receipt without another effect; different units reject the new payload. Split mode already published its effect before attempting insert-if-absent for the result, so losing that later race cannot undo the earlier public write.",
    takeaway:
      "Protect the effect and retained result at one modeled boundary. A unique result key alone cannot undo two earlier effects.",
    edge: "Joint publication produces both public records",
  },
  {
    id: "receipt",
    title: "Retained receipts",
    subtitle: "Keep the original result beside its public effect",
    detail:
      "The append-only effect ledger and retained result history have different lifetimes. A receipt keeps the original effect ID and units. Retention begins when the result is stored; replay does not extend it. At expiry equality the old row becomes history, while its public effect remains. A call that cached an earlier receipt can still finish after that row expires. A new lookup after expiry may permit another effect.",
    takeaway:
      "State the retention window and key scope. They bound what a new lookup can safely reuse.",
    edge: "The handler returns a receipt or an error",
  },
  {
    id: "observation",
    title: "Caller observation",
    subtitle: "Receiving a response is a separate event",
    detail:
      "The server may have a public effect and retained receipt even when its response is lost. A caller may instead receive a payload or result-save error; a received error is not a received receipt. A handler crash leaves public state unchanged by an explicit model rule, not by a tested storage guarantee. No actual network, durable database, automatic retry or external provider is executed here.",
    takeaway:
      "Explain what became public, which result was retained, and what the caller actually observed as three separate facts.",
  },
] as const;

export function IdempotencyArchitectureView() {
  const scope = useId(),
    [selected, setSelected] = useState<string>("caller");
  const item = responsibilities.find((entry) => entry.id === selected)!;
  return (
    <div className="idem-design">
      <header className="idem-design-intro">
        <p className="eyebrow">Architecture · Effect and result ownership</p>
        <h2>Where does a retry become safe to reuse?</h2>
        <p>
          Follow one call from its key lookup to publication and response.
          Inspect each boundary to explain why the same key helps only when the
          effect and retained result agree.
        </p>
        <p className="idem-design-scope">
          Authored logical illustration · No Java run, actual network or named
          database guarantee
        </p>
      </header>
      <section
        className="idem-topology"
        aria-label="Idempotency publication topology"
      >
        <h3>One causal path, six responsibilities</h3>
        <p className="idem-design-scope">
          Read in numbered order. Select a step to inspect its responsibility. A
          replay or payload conflict can skip business work; this path shows the
          publication decision a missing key reaches.
        </p>
        <ol className="idem-topology-flow">
          {responsibilities.map((entry, index) => (
            <li key={entry.id}>
              <button
                type="button"
                aria-label={`Inspect ${entry.title}`}
                aria-pressed={selected === entry.id}
                aria-controls={`${scope}-responsibility`}
                onClick={() => setSelected(entry.id)}
              >
                <span className="eyebrow">0{index + 1}</span>
                <strong>{entry.title}</strong>
                <span>{entry.subtitle}</span>
                {entry.id === "receipt" && (
                  <span className="idem-public-pair">
                    <span>Public effect ledger</span>
                    <span>Retained key → original receipt</span>
                  </span>
                )}
              </button>
              {"edge" in entry && (
                <p className="idem-topology-edge">
                  <span aria-hidden="true">→</span>
                  <span>Then: {entry.edge}</span>
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>
      <section
        id={`${scope}-responsibility`}
        className="idem-design-card"
        aria-label="Selected idempotency responsibility"
        aria-live="polite"
      >
        <p className="eyebrow">{item.title}</p>
        <h3>{item.subtitle}</h3>
        <p>{item.detail}</p>
        <p className="idem-design-takeaway">{item.takeaway}</p>
      </section>
      <section
        className="idem-design-card"
        aria-label="Idempotency architecture text equivalent"
      >
        <h3>Follow the boundaries in words</h3>
        <ol>
          <li>
            A caller submits its tenant, key and units. Its operation ID
            describes intended work for audit counts and is not the server's
            deduplication identity.
          </li>
          <li>
            The handler looks for an active result under (tenant, key). A miss
            does not acquire a lock or reserve the key.
          </li>
          <li>
            Atomic mode prepares units privately. Split mode writes a public
            effect at this earlier step, which leaves a gap before result
            retention.
          </li>
          <li>
            At the atomic publication boundary, recheck the current key and
            either publish the effect and receipt together, replay an existing
            receipt, or reject a changed payload without the new effect.
          </li>
          <li>
            The public ledger retains effects; result history retains active or
            expired keys. Expiry removes lookup protection, not earlier effects,
            and replay keeps the original effect identity.
          </li>
          <li>
            Only the response step records the caller receiving a receipt or
            error. Losing that response does not undo publication. A modeled
            handler crash proves no physical storage guarantee.
          </li>
        </ol>
      </section>
      <section className="idem-design-card">
        <h3>Explain it to a teammate or interviewer</h3>
        <p>
          “If a write succeeds but its response disappears, retrying the call
          can repeat its effect. I would define a tenant-scoped key, compare the
          request's meaning, and protect the effect and retained result at one
          boundary. Then a retry can reuse the original receipt within its
          retention window. A lookup before the write is insufficient when two
          calls race.”
        </p>
        <p>
          Follow up: What if the key expires? What if the effect belongs to an
          external provider? The first changes the local lookup window; the
          second needs a separate end-to-end design and provider-specific
          evidence outside this model.
        </p>
      </section>
    </div>
  );
}
