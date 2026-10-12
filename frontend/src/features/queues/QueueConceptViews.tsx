import { useId, useState } from "react";
import "./QueueConceptViews.css";

const boundaries = [
  {
    id: "workers",
    label: "Inspect worker capacity",
    condition: "1 · A worker is idle",
    title: "Start immediately",
    detail:
      "Reserve the first idle worker and start the arriving job. Running work occupies a worker slot; it does not consume a waiting slot.",
    decision: "Worker capacity",
    explanation:
      "Each worker processes one job at a time. Adding workers lets more jobs run together. Service time belongs to each job, so an expensive job can keep its worker busy longer.",
    signal:
      "Inspect running jobs and service times before choosing more workers.",
  },
  {
    id: "waiting",
    label: "Inspect waiting capacity",
    condition: "2 · All workers busy; a waiting slot is free",
    title: "Join the shared FIFO",
    detail:
      "Append the arriving job to one shared waiting queue. When a worker finishes, the oldest waiting job gets a free worker before a new arrival can take it.",
    decision: "Waiting capacity",
    explanation:
      "Waiting slots hold unfinished work during a burst. More waiting slots can reduce rejection while increasing how long accepted jobs wait. Workers still determine how much work can run at once.",
    signal:
      "Compare waiting time, queue depth and rejections when changing the buffer.",
  },
  {
    id: "rejection",
    label: "Inspect rejection",
    condition: "3 · All workers busy; the waiting queue is full",
    title: "Reject this arrival",
    detail:
      "Record a rejected outcome immediately. Existing queued and running jobs keep their places. The model does not retry the rejected job.",
    decision: "Admission boundary",
    explanation:
      "A finite waiting limit bounds the unfinished work held by this process. Rejected jobs have an observed rejection time but no successful service or latency sample.",
    signal:
      "Inspect rejected demand separately from the latency of completed jobs.",
  },
] as const;

export function QueueArchitectureView() {
  const prefix = useId();
  const [selected, setSelected] =
    useState<(typeof boundaries)[number]["id"]>("workers");
  const active = boundaries.find((boundary) => boundary.id === selected)!;
  return (
    <div className="queue-concepts">
      <header className="queue-concept-intro">
        <p className="eyebrow">Architecture · One shared queue</p>
        <h2>How does a job get a worker?</h2>
        <p>
          Check for an idle worker first. Use the waiting queue when every
          worker is busy, then reject a new arrival if the waiting queue is
          full.
        </p>
        <p className="queue-concept-scope">
          Illustrative in-memory model · One process owns the queue and workers
          · No network hop is shown.
        </p>
      </header>
      <section
        className="queue-admission-diagram"
        aria-label="Shared FIFO admission diagram"
      >
        <div className="queue-admission-entry">
          <span className="queue-concept-token">Job arrives</span>
          <span aria-hidden="true">→</span>
          <div>
            <strong>Check admission</strong>
            <p>Worker first, waiting slot second</p>
          </div>
        </div>
        <p className="queue-branch-label">Follow the first applicable rule</p>
        <div className="queue-boundary-grid">
          {boundaries.map((boundary) => (
            <button
              key={boundary.id}
              type="button"
              className={`queue-boundary queue-boundary-${boundary.id}`}
              aria-label={boundary.label}
              aria-pressed={selected === boundary.id}
              aria-controls={`${prefix}-boundary`}
              onClick={() => setSelected(boundary.id)}
            >
              <span className="queue-boundary-condition">
                {boundary.condition}
              </span>
              <strong>{boundary.title}</strong>
              <span>{boundary.detail}</span>
              <span className="queue-boundary-inspect">
                Inspect this boundary <span aria-hidden="true">↓</span>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section
        id={`${prefix}-boundary`}
        className="queue-concept-inspector"
        aria-label="Selected queue boundary"
        aria-live="polite"
      >
        <p className="eyebrow">{active.decision}</p>
        <h3>{active.title}</h3>
        <p>{active.explanation}</p>
        <p className="queue-concept-takeaway">{active.signal}</p>
      </section>
      <section
        className="queue-concept-text"
        aria-label="Admission flow text equivalent"
      >
        <h3>Follow the same rule in words</h3>
        <ol>
          <li>An arrival takes the first idle worker immediately.</li>
          <li>
            If all workers are busy, an arrival joins the tail of the shared
            queue when a waiting slot is free.
          </li>
          <li>
            If all workers and waiting slots are occupied, reject the new
            arrival.
          </li>
          <li>
            At a timestamp, complete existing work first. Dispatch older waiters
            before handling new arrivals at that timestamp.
          </li>
        </ol>
      </section>
      <div className="queue-concept-notes">
        <section>
          <h3>Who owns the state?</h3>
          <p>
            This process owns one FIFO queue and the workers. Queue capacity
            counts waiting jobs only. The model has no persistence, broker
            acknowledgment or crash recovery; those are separate delivery
            concepts.
          </p>
        </section>
        <section>
          <h3>Explain the design choice</h3>
          <p>
            “I would measure waiting time, service time and rejection
            separately. A larger buffer holds more work; more workers change
            concurrent processing. I would choose a limit that meets the waiting
            requirement.”
          </p>
        </section>
      </div>
    </div>
  );
}

type AuthoredStep = {
  time: string;
  from: string;
  to: string;
  title: string;
  explanation: string;
};
type AuthoredPath = {
  id: string;
  label: string;
  title: string;
  summary: string;
  takeaway: string;
  steps: readonly AuthoredStep[];
};
const paths: readonly AuthoredPath[] = [
  {
    id: "job-1",
    label: "Job 1 · starts immediately",
    title: "An idle worker can start now",
    summary:
      "Job 1 is the first of four equal-time arrivals. The single worker is idle.",
    takeaway:
      "Job 1 waits 0 ms, runs for 10 ms and completes at 10 ms. Its successful latency is 10 ms.",
    steps: [
      {
        time: "0 ms",
        from: "Arrival",
        to: "Admission",
        title: "An idle worker is available",
        explanation:
          "Job 1 arrives. Admission sees worker-1 idle; the waiting slot remains available.",
      },
      {
        time: "0 ms",
        from: "Admission",
        to: "worker-1",
        title: "Reserve the worker and start",
        explanation:
          "Job 1 starts immediately on worker-1. It occupies the worker through its 10 ms of service.",
      },
      {
        time: "10 ms",
        from: "worker-1",
        to: "Completion",
        title: "Observe the completion",
        explanation:
          "Job 1 completes. The worker becomes free, and job-2 is the oldest waiter eligible to take it.",
      },
    ],
  },
  {
    id: "job-2",
    label: "Job 2 · waits",
    title: "Waiting adds to end-to-end latency",
    summary:
      "Job 2 arrives at 0 ms after job-1 has reserved the worker. One waiting slot is free.",
    takeaway:
      "Job 2 waits 10 ms and then runs for 10 ms. It completes at 20 ms with successful latency 20 ms.",
    steps: [
      {
        time: "0 ms",
        from: "Arrival",
        to: "Admission",
        title: "The worker is already busy",
        explanation:
          "Job 1 has started on worker-1. Job 2 cannot start immediately, so admission checks the waiting capacity.",
      },
      {
        time: "0 ms",
        from: "Admission",
        to: "Shared FIFO",
        title: "Take the one waiting slot",
        explanation:
          "Job 2 joins the shared FIFO. The waiting queue is now full, so later simultaneous arrivals will be rejected.",
      },
      {
        time: "10 ms",
        from: "Shared FIFO",
        to: "worker-1",
        title: "The older waiter starts next",
        explanation:
          "Job 1 completes first at 10 ms. Job 2 takes the free worker before new arrivals at the same timestamp; the waiting slot becomes free.",
      },
      {
        time: "20 ms",
        from: "worker-1",
        to: "Completion",
        title: "Waiting and service both count",
        explanation:
          "Job 2 completes at 20 ms. Its 20 ms latency includes 10 ms waiting and 10 ms service.",
      },
    ],
  },
  {
    id: "job-3",
    label: "Job 3 · rejected",
    title: "Full waiting capacity rejects new work",
    summary:
      "Job 3 arrives at 0 ms after job-1 starts and job-2 occupies the waiting slot.",
    takeaway:
      "Job 3 is rejected at 0 ms. It never starts service and supplies no successful wait or latency sample. Keep it in the rejected population.",
    steps: [
      {
        time: "0 ms",
        from: "Arrival",
        to: "Admission",
        title: "Both kinds of slot are occupied",
        explanation:
          "Worker-1 runs job-1. Job 2 occupies the only waiting slot. Admission cannot accept job-3.",
      },
      {
        time: "0 ms",
        from: "Admission",
        to: "Rejection",
        title: "Record rejection without successful latency",
        explanation:
          "Reject job-3 immediately. Jobs 1 and 2 continue; job-3 has no service start or completion in this workload.",
      },
    ],
  },
];

export function QueueSequenceView() {
  const prefix = useId();
  const [selected, setSelected] = useState(paths[0]!.id);
  const [positions, setPositions] = useState<Record<string, number>>({});
  const current = paths.find((path) => path.id === selected)!;
  const index = positions[current.id] ?? 0;
  const step = current.steps[index]!;
  function inspect(next: number) {
    setPositions((previous) => ({ ...previous, [current.id]: next }));
  }
  return (
    <div className="queue-concepts">
      <header className="queue-concept-intro">
        <p className="eyebrow">Job sequence · Authored walkthrough</p>
        <h2>Three jobs, three admission paths</h2>
        <p>
          Trace immediate service, waiting and rejection through the same small
          workload.
        </p>
        <p className="queue-concept-scope">
          Illustrative baseline: four arrivals at 0 ms, 10 ms service each, one
          worker and one waiting slot. These are authored paths checked against
          Java; selecting a step does not execute a new run.
        </p>
      </header>
      <fieldset className="queue-path-picker">
        <legend>Choose a baseline job</legend>
        {paths.map((path) => (
          <label key={path.id}>
            <input
              type="radio"
              name={`${prefix}-path`}
              value={path.id}
              checked={selected === path.id}
              onChange={() => setSelected(path.id)}
            />
            <span>{path.label}</span>
          </label>
        ))}
      </fieldset>
      <section
        className="queue-authored-path"
        aria-labelledby={`${prefix}-path-title`}
      >
        <div className="queue-concept-section-heading">
          <div>
            <p className="eyebrow">{current.id} · Baseline preset</p>
            <h3 id={`${prefix}-path-title`}>{current.title}</h3>
          </div>
          <span className="queue-concept-token">
            Authored · Manual inspection
          </span>
        </div>
        <p>{current.summary}</p>
        <section
          className="queue-authored-inspector"
          aria-label="Selected authored job step"
          aria-live="polite"
        >
          <p className="queue-authored-position">
            Step {index + 1} of {current.steps.length} · {step.time}
          </p>
          <div className="queue-authored-hop">
            <span>{step.from}</span>
            <span aria-hidden="true">→</span>
            <span>{step.to}</span>
          </div>
          <h4>{step.title}</h4>
          <p>{step.explanation}</p>
          <p className="queue-concept-local">
            Local model transition · The arrow is not a network request.
          </p>
        </section>
        <div className="queue-path-controls">
          <button
            type="button"
            className="button secondary"
            aria-label="Previous path step"
            disabled={index === 0}
            onClick={() => inspect(index - 1)}
          >
            ← Previous
          </button>
          <button
            type="button"
            className="button primary"
            aria-label="Next path step"
            disabled={index === current.steps.length - 1}
            onClick={() => inspect(index + 1)}
          >
            Next →
          </button>
          <button
            type="button"
            className="button secondary"
            aria-label="Reset authored path"
            disabled={index === 0}
            onClick={() => inspect(0)}
          >
            Reset path
          </button>
        </div>
        <section
          className="queue-authored-text"
          aria-label="Full authored job path"
        >
          <h4>Full path in words</h4>
          <ol>
            {current.steps.map((item, position) => (
              <li key={item.title}>
                <button
                  type="button"
                  aria-label={`Inspect path step ${position + 1}: ${item.title}`}
                  aria-pressed={index === position}
                  onClick={() => inspect(position)}
                >
                  <span className="queue-authored-time">{item.time}</span>
                  <strong>{item.title}</strong>
                  <span>{item.explanation}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
        <p className="queue-concept-takeaway">{current.takeaway}</p>
      </section>
      <section className="queue-concept-text">
        <h3>Explain what changed</h3>
        <p>
          “Waiting increases a completed job's latency even when its service
          time is unchanged. A rejected job has a rejection time, and successful
          latency statistics use completed jobs only.”
        </p>
        <p>
          Use the Playground or Guided simulation to run Java with changed
          worker, buffer or service-time inputs. This authored baseline does not
          follow edits made in those views.
        </p>
      </section>
    </div>
  );
}
