export function RateLimiterArchitecture() {
  return (
    <div className="concept-view">
      <header className="concept-header">
        <p className="eyebrow">Architecture decision</p>
        <h2>Place the decision before expensive work</h2>
        <p>
          Identity and scope determine which requests compete for the same
          allowance. Counter placement determines how strict that allowance can
          be across nodes.
        </p>
      </header>
      <div
        className="rate-architecture"
        role="img"
        aria-label="Client requests pass through authentication and a rate-limit decision before the protected service. Application nodes use either one shared atomic counter or explicitly allocated local counters."
      >
        <article>
          <small>01 · CONTEXT</small>
          <strong>Authenticate identity</strong>
          <p>Resolve tenant, API key, user, route, and request cost.</p>
        </article>
        <span>→</span>
        <article>
          <small>02 · DECIDE</small>
          <strong>Consume allowance</strong>
          <p>
            One atomic rule returns allow, reject, remaining, and retry delay.
          </p>
        </article>
        <span>→</span>
        <article>
          <small>03 · PROTECT</small>
          <strong>Run service work</strong>
          <p>Rejected traffic stops before consuming the guarded resource.</p>
        </article>
      </div>
      <div className="comparison-grid">
        <article>
          <p className="eyebrow">Strict scope</p>
          <h3>Shared counter</h3>
          <ul>
            <li>One global allowance</li>
            <li>Atomic decisions</li>
            <li>Backend latency and availability enter the request path</li>
            <li>One hot identity can create a hot key</li>
          </ul>
        </article>
        <article>
          <p className="eyebrow">Approximate scope</p>
          <h3>Local or allocated counters</h3>
          <ul>
            <li>Low decision latency</li>
            <li>Nodes can continue independently</li>
            <li>Naive local limits multiply aggregate allowance</li>
            <li>Quota allocation may strand unused capacity</li>
          </ul>
        </article>
      </div>
      <div className="text-equivalent">
        <h3>Architecture in words</h3>
        <ol>
          <li>
            Authenticate enough context to identify the subject and operation.
          </li>
          <li>Build a bounded counter key from identity and policy scope.</li>
          <li>Apply one atomic algorithm decision.</li>
          <li>Return HTTP 429 and retry guidance when rejected.</li>
          <li>
            Forward allowed work and observe both limiter health and
            protected-resource saturation.
          </li>
        </ol>
      </div>
    </div>
  );
}

export function RateLimiterSequence() {
  return (
    <div className="concept-view">
      <header className="concept-header">
        <p className="eyebrow">Two causal paths</p>
        <h2>Allowed and rejected requests share one decision point</h2>
        <p>
          The rejection is useful only when it prevents downstream work and
          tells the caller how to behave.
        </p>
      </header>
      <div className="sequence-columns">
        <article>
          <span className="sequence-number">A</span>
          <h3>Allowance remains</h3>
          <ol>
            <li>Gateway authenticates the tenant.</li>
            <li>Limiter atomically consumes one unit.</li>
            <li>Decision returns allowed and remaining allowance.</li>
            <li>Gateway forwards the request.</li>
            <li>Service performs the expensive operation.</li>
          </ol>
        </article>
        <article>
          <span className="sequence-number">B</span>
          <h3>Allowance exhausted</h3>
          <ol>
            <li>Gateway authenticates the same tenant.</li>
            <li>Limiter observes no remaining allowance.</li>
            <li>Decision returns rejected and retry delay.</li>
            <li>Gateway returns HTTP 429.</li>
            <li>Protected service receives no work.</li>
          </ol>
        </article>
        <article>
          <span className="sequence-number">C</span>
          <h3>Counter unavailable</h3>
          <ol>
            <li>Limiter cannot read authoritative state.</li>
            <li>Configured policy selects fail-open or fail-closed.</li>
            <li>System records bypass or rejection explicitly.</li>
            <li>Operators correlate counter errors with downstream load.</li>
            <li>Recovery does not rewrite past decisions.</li>
          </ol>
        </article>
      </div>
    </div>
  );
}
