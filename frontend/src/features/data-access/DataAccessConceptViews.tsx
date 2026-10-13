import { useId, useState } from "react";
import "./DataAccessConceptViews.css";
const boundaries = [
  {
    id: "question",
    title: "Caller · the question",
    subtitle: "Lookup, range or insert",
    detail:
      "The caller specifies an exact ID, a tenant range, a global range or a proposed record. Range bounds are inclusive; a result limit does not change the model's preceding scan work.",
    takeaway:
      "Name the filters, ordering and write rule before choosing a storage product.",
  },
  {
    id: "primary",
    title: "Primary identity",
    subtitle: "One record ID · always unique",
    detail:
      "An ID lookup counts one abstract primary lookup. A hit fetches one record; a miss fetches none. Every insert checks this identity first, even when business-key enforcement is disabled.",
    takeaway:
      "A new primary ID can still represent an existing business order.",
  },
  {
    id: "secondary",
    title: "Ordered access view",
    subtitle: "Tenant first or creation first",
    detail:
      "Java derives a sorted view from the current records using the selected column order. It scans the modeled interval and applies index-covered filters before fetching records. There is no physical index tree, optimizer or skip scan.",
    takeaway:
      "The beta query examines two tenant-first entries or six creation-first entries, while both fetch two records.",
  },
  {
    id: "business",
    title: "Scoped business rule",
    subtitle: "Unique tenant + business key",
    detail:
      "When enabled, the pair of tenant and business key must be unique. beta/k2 already identifies b2, so a new record b5 with that pair is rejected. alpha/k2 and beta/k2 may coexist because their tenants differ.",
    takeaway:
      "A uniqueness rule protects allowed data; a secondary access path helps answer a question. These are separate choices.",
  },
  {
    id: "records",
    title: "Per-run records",
    subtitle: "Local state · accepted inserts append",
    detail:
      "Each Java call starts with its submitted records and executes operations sequentially. Accepted inserts append a record and report logical maintenance. Rejected inserts change nothing. Another call starts with separate state.",
    takeaway:
      "A successful sequential insert proves no durability, concurrent transaction or idempotency guarantee.",
  },
] as const;
export function DataAccessArchitectureView() {
  const scope = useId();
  const [selected, setSelected] = useState<string>("question");
  const boundary = boundaries.find((item) => item.id === selected)!;
  return (
    <div className="access-concepts">
      <header className="access-concept-intro">
        <p className="eyebrow">Architecture · Questions and rules</p>
        <h2>Where does the question meet the write rule?</h2>
        <p>
          Reads need an access path. Writes need an identity and an explicit
          rule for allowed data. Follow their different responsibilities inside
          one illustrative Java call.
        </p>
        <p className="access-concept-scope">
          Authored logical diagram · No new Java run · Local sequential state ·
          No deployed database or physical index engine
        </p>
      </header>
      <section
        className="access-boundaries"
        aria-label="Access pattern ownership diagram"
      >
        {boundaries.map((item, index) => (
          <button
            type="button"
            key={item.id}
            className={`access-boundary ${selected === item.id ? "selected" : ""}`}
            aria-label={`Inspect ${item.title}`}
            aria-pressed={selected === item.id}
            aria-controls={`${scope}-inspector`}
            onClick={() => setSelected(item.id)}
          >
            <span className="eyebrow">0{index + 1} · Responsibility</span>
            <strong>{item.title}</strong>
            <span>{item.subtitle}</span>
            <span className="access-inspect">
              Inspect this responsibility ↓
            </span>
          </button>
        ))}
        <div className="access-boundary-flows">
          <p>
            <strong>Read route</strong> Caller → primary identity or ordered
            view → matching records
          </p>
          <p>
            <strong>Write route</strong> Caller → primary check → optional
            scoped rule → accept and maintain, or reject unchanged
          </p>
        </div>
      </section>
      <section
        id={`${scope}-inspector`}
        className="access-concept-card"
        aria-label="Selected access responsibility"
        aria-live="polite"
      >
        <p className="eyebrow">{boundary.title}</p>
        <h3>{boundary.subtitle}</h3>
        <p>{boundary.detail}</p>
        <p className="access-concept-takeaway">{boundary.takeaway}</p>
      </section>
      <section
        className="access-concept-card"
        aria-label="Access ownership text equivalent"
      >
        <h3>Follow the responsibilities in words</h3>
        <ol>
          <li>The caller names the query or proposed insert.</li>
          <li>
            A direct ID query uses primary identity. A range query uses the
            configured secondary view or scans the base records.
          </li>
          <li>
            The range path identifies candidates, filters, fetches matches and
            applies the result limit.
          </li>
          <li>
            An insert checks primary identity, then the optional
            tenant/business-key rule.
          </li>
          <li>
            A rejection changes nothing. An acceptance appends one record and
            counts the configured logical maintenance entries.
          </li>
        </ol>
      </section>
      <div className="access-concept-notes">
        <section className="access-concept-card">
          <h3>State the boundary</h3>
          <p>
            The model counts logical access work. It excludes physical pages,
            concurrency, crashes, replication and external effects. Secondary
            ordering is derived from records; it is not a simulated persistent
            index implementation.
          </p>
        </section>
        <section className="access-concept-card">
          <h3>Explain it to a teammate</h3>
          <p>
            “Our query can return the same two rows through different access
            paths. I would inspect candidate work and write maintenance
            separately. The business-key rule decides whether the data is valid;
            an efficient query does not establish that rule.”
          </p>
        </section>
      </div>
    </div>
  );
}
type Step = { from: string; to: string; title: string; detail: string };
export const dataAccessAuthoredPaths: readonly {
  id: string;
  title: string;
  summary: string;
  takeaway: string;
  steps: readonly Step[];
}[] = [
  {
    id: "baseline",
    title: "Read · one tenant's range",
    summary:
      "Twelve initial records · tenant-first view · beta in creation orders 20–30 · limit 20.",
    takeaway:
      "Two entries examined, two records fetched and b2, b3 returned. A record considered and a record returned are different facts.",
    steps: [
      {
        from: "Caller",
        to: "Range path",
        title: "Ask the beta question",
        detail:
          "Request tenant beta in the inclusive creation range 20 through 30, with result limit 20. Creation order is an ordering key, not elapsed time.",
      },
      {
        from: "Range path",
        to: "Tenant-first view",
        title: "Find the candidate interval",
        detail:
          "The configured tenant-first view groups beta's range together. One abstract seek opens the path; its candidate IDs are b2 and b3.",
      },
      {
        from: "Tenant-first view",
        to: "Index-covered filters",
        title: "Check the candidates",
        detail:
          "Both entries satisfy tenant beta and the inclusive range. Two index entries are examined. No optimizer, skip scan or early stopping is modeled.",
      },
      {
        from: "Index-covered filters",
        to: "Base records",
        title: "Fetch two matching records",
        detail:
          "The two matching IDs identify b2 and b3. Base records fetched: two. The selected secondary view has not changed stored records.",
      },
      {
        from: "Base records",
        to: "Caller",
        title: "Apply the result limit",
        detail:
          "Order matches by creation order then ID and apply limit 20 after the modeled work. Return b2, b3; record count remains twelve.",
      },
    ],
  },
  {
    id: "accepted",
    title: "Write · accept a new business key",
    summary:
      "Propose b5 / beta / k5 / 25 · tenant-first view · business-key protection enabled.",
    takeaway:
      "One base record, one secondary entry and one business-key entry are maintained logically. The following query can see the accepted record within this call.",
    steps: [
      {
        from: "Caller",
        to: "Write path",
        title: "Propose b5 with beta/k5",
        detail:
          "The twelve-record fixture contains neither primary ID b5 nor scoped business key beta/k5. The proposed creation order is 25.",
      },
      {
        from: "Write path",
        to: "Primary identity",
        title: "Check the primary ID",
        detail:
          "One primary lookup finds no existing b5. The proposed primary identity is available, but the business rule still needs checking.",
      },
      {
        from: "Write path",
        to: "Scoped business rule",
        title: "Check beta/k5",
        detail:
          "One business-key check finds no existing beta/k5. Protection is enabled, and the proposed scoped identity is available.",
      },
      {
        from: "Write path",
        to: "Per-run records",
        title: "Accept and count maintenance",
        detail:
          "The sequential operation appends b5 and reports base writes 1, secondary entries written 1 and business-key entries written 1. Record count changes from twelve to thirteen. No intermediate crash states or physical IO are modeled.",
      },
      {
        from: "Next query",
        to: "Caller",
        title: "Read after the accepted insert",
        detail:
          "The following beta 20–30 query examines three tenant-first entries and fetches three records, returning b2, b5, b3. Another Java run starts from its own submitted rows.",
      },
    ],
  },
  {
    id: "rejected",
    title: "Write · reject a scoped conflict",
    summary:
      "Propose b5 / beta / k2 / 25 · tenant-first view · business-key protection enabled.",
    takeaway:
      "A new primary ID does not bypass the business rule. Rejection leaves twelve records and writes nothing.",
    steps: [
      {
        from: "Caller",
        to: "Write path",
        title: "Propose b5 with beta/k2",
        detail:
          "b5 is a new primary ID, but beta/k2 already identifies record b2 in the initial fixture.",
      },
      {
        from: "Write path",
        to: "Primary identity",
        title: "Pass the primary check",
        detail:
          "One primary lookup finds no b5. Passing that check alone does not make the proposed business order distinct.",
      },
      {
        from: "Write path",
        to: "Scoped business rule",
        title: "Find the conflict at b2",
        detail:
          "One business-key check finds beta/k2 at b2. The operation reports DUPLICATE_BUSINESS_KEY, not DUPLICATE_ID.",
      },
      {
        from: "Write path",
        to: "Caller",
        title: "Reject without mutation",
        detail:
          "Base writes, secondary entries written and business-key entries written are all zero. The record count remains twelve. A completed run can contain a rejected insert.",
      },
      {
        from: "Next query",
        to: "Caller",
        title: "Read the unchanged records",
        detail:
          "The following beta 20–30 query still examines two tenant-first entries and fetches two records, returning b2, b3. This sequential rejection does not establish concurrency or idempotency guarantees.",
      },
    ],
  },
];
export function DataAccessSequenceView() {
  const scope = useId();
  const [pathId, setPathId] = useState("baseline");
  const [position, setPosition] = useState(0);
  const path = dataAccessAuthoredPaths.find((item) => item.id === pathId)!;
  const step = path.steps[position]!;
  return (
    <div className="access-concepts">
      <header className="access-concept-intro">
        <p className="eyebrow">Operation sequence · Read and write paths</p>
        <h2>Follow one question or one write</h2>
        <p>
          Walk through a query, an accepted insert and a rejected conflict.
          Connect each decision to the same small order fixture.
        </p>
        <p className="access-concept-scope">
          Authored illustrations · Manual steps · No new Java run or modeled
          timing · Use Playground or Guided for returned Java evidence
        </p>
      </header>
      <fieldset className="access-path-choice">
        <legend>Choose an authored path</legend>
        {dataAccessAuthoredPaths.map((item) => (
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
            {item.title}
          </label>
        ))}
      </fieldset>
      <section
        className="access-concept-card"
        aria-label="Selected authored operation step"
        aria-live="polite"
      >
        <p className="eyebrow">
          Step {position + 1} of {path.steps.length}
        </p>
        <h3>{step.title}</h3>
        <p className="access-path-edge">
          {step.from} → {step.to}
        </p>
        <p>{step.detail}</p>
        <div className="access-path-controls">
          <button
            type="button"
            className="button secondary"
            disabled={position === 0}
            onClick={() => setPosition(position - 1)}
          >
            Previous path step
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={position === path.steps.length - 1}
            onClick={() => setPosition(position + 1)}
          >
            Next path step
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => setPosition(0)}
          >
            Reset authored path
          </button>
        </div>
      </section>
      <section
        className="access-concept-card"
        aria-label="Full authored operation path"
      >
        <h3>{path.title}</h3>
        <p>{path.summary}</p>
        <ol className="access-path-text">
          {path.steps.map((item, index) => (
            <li
              key={item.title}
              aria-current={position === index ? "step" : undefined}
            >
              <strong>{item.title}</strong>
              <p>
                {item.from} → {item.to}. {item.detail}
              </p>
            </li>
          ))}
        </ol>
        <p className="access-concept-takeaway">{path.takeaway}</p>
      </section>
    </div>
  );
}
