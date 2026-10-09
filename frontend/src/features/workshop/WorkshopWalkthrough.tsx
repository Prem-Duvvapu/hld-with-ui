import { useId, useLayoutEffect, useRef, useState } from "react";
import type { WorkshopWalkthrough as Walkthrough } from "../../api/types";
import "./WorkshopWalkthrough.css";

/** Inspect authored causal paths. This viewer never executes or computes outcomes. */
export function WorkshopWalkthrough({
  walkthroughs,
}: {
  walkthroughs: Walkthrough[];
}) {
  const prefix = useId();
  const diagram = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState(walkthroughs[0]!.id);
  const [positions, setPositions] = useState<Record<string, number>>({});
  const current =
    walkthroughs.find((item) => item.id === selectedId) ?? walkthroughs[0]!;
  const index = Math.min(positions[current.id] ?? 0, current.steps.length - 1);
  const active = current.steps[index]!;
  const nodes = new Map(current.nodes.map((node) => [node.id, node]));
  const from = nodes.get(active.from)!;
  const to = nodes.get(active.to)!;
  const x = (id: string) =>
    100 + current.nodes.findIndex((node) => node.id === id) * 210;
  const width = Math.max(300, current.nodes.length * 210);
  const self = active.from === active.to;
  const direction = x(active.to) > x(active.from) ? 1 : -1;
  const start = x(active.from) + (self ? 0 : 70 * direction);
  const end = x(active.to) - (self ? 0 : 70 * direction);
  const fromPosition = x(active.from);
  const toPosition = x(active.to);
  // Keep a selected participant visible in the narrow diagram without moving
  // keyboard focus or animating. This is layout only, never modeled behavior.
  useLayoutEffect(() => {
    const region = diagram.current;
    const svg = region?.querySelector("svg");
    if (!region || !svg || region.clientWidth === 0) return;
    function position() {
      const scale = svg!.clientWidth / width;
      const bothFit =
        (Math.abs(toPosition - fromPosition) + 170) * scale <=
        region!.clientWidth;
      const center =
        (bothFit ? (fromPosition + toPosition) / 2 : fromPosition) * scale;
      region!.scrollLeft = Math.max(0, center - region!.clientWidth / 2);
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(region);
    return () => observer.disconnect();
  }, [current.id, index, fromPosition, toPosition, width]);
  function select(position: number) {
    setPositions((previous) => ({ ...previous, [current.id]: position }));
  }
  return (
    <section
      className="workshop-walkthrough"
      aria-labelledby={`${prefix}-title`}
    >
      <div className="walkthrough-heading">
        <p className="eyebrow">
          Design walkthrough · Illustrative, no execution
        </p>
        <h4 id={`${prefix}-title`}>Follow the decisions, one step at a time</h4>
        <p>
          Choose a path. Predict the next decision, then inspect its
          explanation.
        </p>
      </div>
      {walkthroughs.length > 1 && (
        <label className="walkthrough-picker">
          <span>Choose a walkthrough</span>
          <select
            value={current.id}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {walkthroughs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <h5>{current.title}</h5>
      <p className="walkthrough-summary">{current.summary}</p>
      <div
        ref={diagram}
        className="walkthrough-diagram-scroll"
        tabIndex={0}
        role="region"
        aria-label="Participant diagram; scroll horizontally on narrow screens"
      >
        <svg
          viewBox={`0 0 ${width} 180`}
          style={{ minWidth: width }}
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <marker
              id={`${prefix}-arrow`}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0 0 L8 4 L0 8 Z" fill="currentColor" />
            </marker>
          </defs>
          {current.nodes.map((node) => (
            <g
              key={node.id}
              className={
                node.id === active.from || node.id === active.to
                  ? "walkthrough-node active"
                  : "walkthrough-node"
              }
            >
              <rect x={x(node.id) - 85} y={24} width={170} height={64} rx={4} />
              <text x={x(node.id)} y={60} textAnchor="middle">
                {node.title}
              </text>
              <line
                x1={x(node.id)}
                y1={88}
                x2={x(node.id)}
                y2={162}
                className="walkthrough-lifeline"
              />
            </g>
          ))}
          <path
            className="walkthrough-arrow"
            d={
              self
                ? `M ${start} 112 h 46 v 30 h -46`
                : `M ${start} 126 H ${end}`
            }
            markerEnd={`url(#${prefix}-arrow)`}
          />
          <text
            className="walkthrough-number"
            x={self ? start + 60 : (start + end) / 2}
            y={self ? 130 : 118}
            textAnchor="middle"
          >
            {index + 1}
          </text>
        </svg>
      </div>
      <p className="workshop-hint">
        Highlighted participants belong to the selected step. Scroll sideways to
        see other participants when needed. Full descriptions and every step are
        available below.
      </p>
      <div className="walkthrough-controls">
        <button
          type="button"
          className="button"
          disabled={index === 0}
          onClick={() => select(index - 1)}
        >
          Previous decision
        </button>
        <p role="status" aria-live="polite">
          Step {index + 1} of {current.steps.length} · {current.title}
        </p>
        <button
          type="button"
          className="button"
          disabled={index === current.steps.length - 1}
          onClick={() => select(index + 1)}
        >
          Next decision
        </button>
      </div>
      <div className="walkthrough-inspector" aria-label="Selected decision">
        <p className="eyebrow">
          {from.title} {self ? "· Internal decision" : `→ ${to.title}`}
        </p>
        <h5>{active.title}</h5>
        <p>{active.detail}</p>
      </div>
      <ol className="walkthrough-step-list" aria-label="Choose a decision">
        {current.steps.map((step, position) => (
          <li key={step.id}>
            <button
              type="button"
              aria-current={position === index ? "step" : undefined}
              onClick={() => select(position)}
            >
              <span>{String(position + 1).padStart(2, "0")}</span>
              {step.title}
            </button>
          </li>
        ))}
      </ol>
      <details className="walkthrough-transcript">
        <summary>Complete text equivalent: participants and steps</summary>
        <dl>
          {current.nodes.map((node) => (
            <div key={node.id}>
              <dt>{node.title}</dt>
              <dd>{node.detail}</dd>
            </div>
          ))}
        </dl>
        <ol>
          {current.steps.map((step) => (
            <li key={step.id}>
              <strong>{step.title}</strong>
              <p>
                {nodes.get(step.from)!.title} → {nodes.get(step.to)!.title}.{" "}
                {step.detail}
              </p>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
