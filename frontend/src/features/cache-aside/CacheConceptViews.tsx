// Concept views for cache-aside. Every number comes from the baseline preset
// (lookup 2 ms, origin read 20 ms, TTL 100 ms) and is pinned by
// GuidedCheckpointsTest and the cache browser journeys.

export function CacheArchitectureView() {
  return (
    <div className="concept-view">
      <header className="concept-header">
        <p className="eyebrow">Component map</p>
        <h2>The application owns the cache logic</h2>
        <p>
          In cache-aside the cache is a side store. The application decides when
          to read it, when to go to the origin, and when to fill it. The cache
          never talks to the origin.
        </p>
      </header>
      {/* Shares the rate limiter's three-step architecture styling. */}
      <div
        className="rate-architecture"
        role="img"
        aria-label="The application sits between two stores. It reads the cache first. On a miss it reads the origin itself and then writes the value into the cache with a TTL. Writes go to the origin only."
      >
        <article>
          <small>02 · FAST COPY</small>
          <strong>Cache</strong>
          <p>Holds a value, its origin version, and an expiry time.</p>
        </article>
        <span aria-hidden="true">⇄</span>
        <article>
          <small>01 · DECIDES</small>
          <strong>Application</strong>
          <p>
            Looks up the cache, reads the origin on a miss, fills the cache.
          </p>
        </article>
        <span aria-hidden="true">⇄</span>
        <article>
          <small>03 · SOURCE OF TRUTH</small>
          <strong>Origin</strong>
          <p>Commits every write and advances the key's version.</p>
        </article>
      </div>
      <div className="comparison-grid">
        <article>
          <p className="eyebrow">Read path</p>
          <h3>Cache first, origin on a miss</h3>
          <ul>
            <li>Lookup: a fresh entry is a hit (2 ms).</li>
            <li>
              No entry, or the lookup time has reached its expiry: a miss.
            </li>
            <li>
              On a miss the application reads the origin (20 ms more) and then
              fills the cache, fresh for the TTL.
            </li>
            <li>If the cache is down, reads bypass it and go to the origin.</li>
          </ul>
        </article>
        <article>
          <p className="eyebrow">Write path in this model</p>
          <h3>Origin only, cache untouched</h3>
          <ul>
            <li>An UPDATE commits to the origin and increments the version.</li>
            <li>
              The cache keeps its old copy until the TTL expires, so hits can
              return stale data.
            </li>
            <li>
              Invalidate-on-write and write-through are common alternatives;
              this model implements neither.
            </li>
            <li>If the origin is down, the write does not commit.</li>
          </ul>
        </article>
      </div>
      <div className="comparison-grid">
        <article>
          <p className="eyebrow">Modeled</p>
          <h3>What the Java simulation decides</h3>
          <ul>
            <li>Lookup, miss, origin read, and fill, each with a latency</li>
            <li>TTL checked at lookup time</li>
            <li>Origin versions, used to mark stale hits</li>
            <li>Cache or origin unavailable for a whole run</li>
          </ul>
        </article>
        <article>
          <p className="eyebrow">Not modeled</p>
          <h3>Say so in an interview</h3>
          <ul>
            <li>Invalidation, write-through, or refresh-ahead</li>
            <li>Coalescing concurrent misses</li>
            <li>Eviction or memory limits</li>
            <li>Network delay beyond the two latencies; outages mid-run</li>
          </ul>
        </article>
      </div>
      <div className="text-equivalent">
        <h3>Architecture in words</h3>
        <ol>
          <li>A request reaches the application.</li>
          <li>The application looks up the key in the cache.</li>
          <li>On a fresh hit it returns the cached value.</li>
          <li>
            On a miss it reads the origin, writes that value into the cache with
            a TTL, and returns it.
          </li>
          <li>
            Writes commit to the origin only; the cached copy stays until it
            expires.
          </li>
        </ol>
      </div>
      <div className="callout">
        <strong>Interview sentence</strong>
        <p>
          “The application reads the cache first and fills it from the origin on
          a miss. That cuts origin reads, but the cached copy can be stale until
          its TTL expires unless writes also invalidate it.”
        </p>
      </div>
    </div>
  );
}

export function CacheSequenceView() {
  return (
    <div className="concept-view">
      <header className="concept-header">
        <p className="eyebrow">Request sequence</p>
        <h2>One key, four moments</h2>
        <p>
          The baseline preset in order. Each step is an event you can select in
          the Playground or Guided trace.
        </p>
      </header>
      <div className="sequence-columns two-up">
        <article>
          <span className="sequence-number">A · 0 → 22 ms</span>
          <h3>Cold miss, then fill</h3>
          <ol>
            <li>GET k arrives at 0 ms.</li>
            <li>Lookup at 2 ms finds no entry: a miss.</li>
            <li>The application reads the origin: v1 at 22 ms.</li>
            <li>The application fills the cache: fresh until 122 ms.</li>
            <li>Response after 22 ms.</li>
          </ol>
        </article>
        <article>
          <span className="sequence-number">B · 30 → 32 ms</span>
          <h3>Warm hit</h3>
          <ol>
            <li>GET k arrives at 30 ms.</li>
            <li>Lookup at 32 ms: the entry is fresh until 122 ms.</li>
            <li>Cache returns v1. The origin does no work.</li>
            <li>Response after 2 ms.</li>
          </ol>
        </article>
        <article>
          <span className="sequence-number">C · 40 → 72 ms</span>
          <h3>Write, then a stale hit</h3>
          <ol>
            <li>UPDATE commits v2 (version 2) to the origin at 40 ms.</li>
            <li>The cache still holds v1 (version 1).</li>
            <li>GET at 70 ms looks up at 72 ms: still fresh, so it hits.</li>
            <li>
              It returns v1: a stale read. Old data is served from 40 ms until
              the entry expires at 122 ms.
            </li>
          </ol>
        </article>
        <article>
          <span className="sequence-number">D · 120 → 142 ms</span>
          <h3>Expiry, then a fresh fill</h3>
          <ol>
            <li>GET at 120 ms looks up at 122 ms, exactly the expiry time.</li>
            <li>The expired entry is unusable: a miss.</li>
            <li>The application reads the origin: v2 at 142 ms.</li>
            <li>The cache now holds v2, fresh until 242 ms.</li>
          </ol>
        </article>
      </div>
      <div className="equation">
        <span>LATENCY IN THIS MODEL</span>
        <strong>
          <b>hit = lookup</b> <i>·</i> <b>miss = lookup + origin read</b>{" "}
          <i>·</i> <b>bypass = origin read</b>
        </strong>
        <small>
          2 ms, 22 ms, and 20 ms with the baseline inputs. Fills add no time.
        </small>
      </div>
    </div>
  );
}
