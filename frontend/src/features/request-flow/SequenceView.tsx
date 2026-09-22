const steps = [
  [
    "Request arrives",
    "The arrival timestamp comes from the workload, not the server. Bursts can create queues even when average traffic looks safe.",
  ],
  [
    "Balancer selects a node",
    "Round robin follows order. Least outstanding chooses the node with the fewest unfinished requests in this model.",
  ],
  [
    "Node accepts or rejects",
    "A request is accepted only when a worker or waiting slot is available. A full node rejects immediately.",
  ],
  [
    "Request waits",
    "When all workers are busy, accepted work waits in the node’s FIFO queue. This is queue time.",
  ],
  [
    "Worker serves the request",
    "The selected node’s service duration begins when a worker becomes available.",
  ],
  [
    "Response completes",
    "End-to-end latency is queue time plus service time under this model’s zero-network-overhead assumption.",
  ],
];

export function SequenceView() {
  return (
    <div className="concept-view">
      <div className="concept-intro">
        <p className="eyebrow">Request sequence</p>
        <h2>Tell the story in six steps</h2>
        <p>
          This sequence is a reusable interview structure. Name the decision,
          the capacity boundary, and the observable time at each step.
        </p>
      </div>
      <ol className="sequence-list">
        {steps.map(([title, detail], index) => (
          <li key={title}>
            <div className="sequence-marker">
              <span>{index + 1}</span>
              <i />
            </div>
            <div>
              <small>T{index === 0 ? "+0" : `+${index}`}</small>
              <h3>{title}</h3>
              <p>{detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="equation">
        <span>END-TO-END LATENCY</span>
        <strong>
          queue time <i>+</i> service time
        </strong>
        <small>
          Network and balancer overhead are intentionally excluded in model
          v1.0.0.
        </small>
      </div>
    </div>
  );
}
