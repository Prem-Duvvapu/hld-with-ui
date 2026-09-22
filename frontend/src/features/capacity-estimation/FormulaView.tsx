const formulas = [
  [
    "Average traffic",
    "daily requests ÷ 86,400",
    "requests/s",
    "Do not treat a daily average as a peak.",
  ],
  [
    "Peak traffic",
    "average RPS × peak factor",
    "requests/s",
    "State how the factor was chosen.",
  ],
  [
    "Retained data",
    "writes/day × kB/write × days × copies",
    "GB",
    "Add indexes, logs, and backups separately.",
  ],
  [
    "Response bandwidth",
    "peak RPS × kB/response × 8",
    "Mb/s",
    "Request bytes and protocol overhead are excluded.",
  ],
  [
    "Mean concurrency",
    "peak RPS × mean latency seconds",
    "requests",
    "A mean does not describe an instantaneous burst.",
  ],
];
export function FormulaView() {
  return (
    <div className="concept-view">
      <div className="concept-intro">
        <p className="eyebrow">Formula map</p>
        <h2>Carry the units through every step.</h2>
        <p>
          Use these relationships to explain the estimate on a whiteboard. The
          caveat under each formula is part of the answer.
        </p>
      </div>
      <div className="formula-grid">
        {formulas.map(([title, formula, unit, warning], index) => (
          <article key={title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h3>{title}</h3>
            <code>{formula}</code>
            <strong>{unit}</strong>
            <p>{warning}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
