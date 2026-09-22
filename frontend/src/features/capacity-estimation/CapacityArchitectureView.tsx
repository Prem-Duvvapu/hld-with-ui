const stages = [
  ["01", "Usage", "People × actions", "Start from product behavior."],
  ["02", "Traffic", "Average × peak", "Expose the busy period."],
  ["03", "Data", "Writes × bytes × days", "Retain new records."],
  ["04", "Runtime", "Rate × latency", "Estimate work in flight."],
];
export function CapacityArchitectureView() {
  return (
    <div className="concept-view">
      <div className="concept-intro">
        <p className="eyebrow">Assumption funnel</p>
        <h2>Every output has a path back to product behavior.</h2>
        <p>
          Read left to right. Each arrow is a unit conversion or a stated
          multiplier, so you can challenge the estimate without guessing where a
          number came from.
        </p>
      </div>
      <div
        className="capacity-map"
        aria-label="Usage assumptions flow into traffic, data, and runtime estimates"
      >
        {stages.map(([number, title, formula, detail], index) => (
          <div className="capacity-map-stage" key={number}>
            <article>
              <span>{number}</span>
              <h3>{title}</h3>
              <code>{formula}</code>
              <p>{detail}</p>
            </article>
            {index < stages.length - 1 && <i aria-hidden="true">→</i>}
          </div>
        ))}
      </div>
      <div className="concept-grid">
        <article>
          <span>RATE</span>
          <h3>Traffic pressure</h3>
          <p>
            Peak requests and bandwidth help define test targets for services
            and network paths.
          </p>
        </article>
        <article>
          <span>BYTES</span>
          <h3>Data pressure</h3>
          <p>
            Writes, record size, retention, and copies expose the base storage
            footprint.
          </p>
        </article>
        <article>
          <span>WORK</span>
          <h3>Runtime pressure</h3>
          <p>
            Rate and latency estimate mean concurrency; workers and queues still
            need explicit testing.
          </p>
        </article>
      </div>
      <div className="text-equivalent">
        <strong>Text version</strong>
        <p>
          Daily users multiplied by actions gives daily requests. Dividing by
          seconds and multiplying by a peak factor gives peak rate. Write share,
          record bytes, retention, and copies give retained data. Response bytes
          give bandwidth. Rate multiplied by mean latency gives mean
          concurrency.
        </p>
      </div>
    </div>
  );
}
