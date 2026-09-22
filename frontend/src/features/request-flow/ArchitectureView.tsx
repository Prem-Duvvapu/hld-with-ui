const parts = [
  {
    number: "01",
    title: "Client",
    detail: "Creates work. Arrival times describe the workload shape.",
  },
  {
    number: "02",
    title: "Load balancer",
    detail: "Selects a healthy node with the configured routing policy.",
  },
  {
    number: "03",
    title: "Service node",
    detail: "Uses finite workers. Extra accepted work waits in a FIFO queue.",
  },
  {
    number: "04",
    title: "Response",
    detail: "Returns after queue time and service time have both elapsed.",
  },
];

export function ArchitectureView() {
  return (
    <div className="concept-view">
      <div className="concept-intro">
        <p className="eyebrow">Component map</p>
        <h2>Four responsibilities, one request path</h2>
        <p>
          Start with responsibility boundaries. Each box answers a different
          question, and the arrows show where work can wait.
        </p>
      </div>
      <div
        className="architecture-diagram"
        role="img"
        aria-label="Client sends a request to a load balancer, which selects one of two finite-capacity service nodes. The selected node returns a response to the client."
      >
        <div className="arch-client">
          <small>WORKLOAD</small>
          <strong>Client</strong>
        </div>
        <span>request →</span>
        <div className="arch-lb">
          <small>POLICY</small>
          <strong>Load balancer</strong>
          <i>
            round robin
            <br />
            least outstanding
          </i>
        </div>
        <span>selects →</span>
        <div className="arch-services">
          <div>
            <small>FINITE CAPACITY</small>
            <strong>Node A</strong>
            <i>worker · queue</i>
          </div>
          <div>
            <small>FINITE CAPACITY</small>
            <strong>Node B</strong>
            <i>worker · queue</i>
          </div>
        </div>
      </div>
      <ol className="concept-cards">
        {parts.map((part) => (
          <li key={part.number}>
            <span>{part.number}</span>
            <div>
              <h3>{part.title}</h3>
              <p>{part.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="callout">
        <strong>Interview sentence</strong>
        <p>
          “The load balancer distributes requests; each service node still has
          finite workers and queue capacity, so routing alone cannot create
          throughput.”
        </p>
      </div>
    </div>
  );
}
