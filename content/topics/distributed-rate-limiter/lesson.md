# Distributed Rate Limiter

A rate limiter decides whether a caller may do one more operation now. Use this module to protect an API from bursts, explain why adding nodes can accidentally multiply a quota, and choose what to do when the counter is unavailable.

## Learning outcomes

- Predict fixed-window and token-bucket decisions from a small arrival schedule.
- Calculate configured aggregate allowance and observed overshoot separately.
- Explain enforced, rejected, and bypassed requests during a counter outage.
- Defend identity, scope, atomicity, retry guidance, and failure policy with evidence.

## Explain it simply

Imagine a venue that admits five people per minute. One doorman with one clicker can stop at five. If three doors each receive a separate clicker set to five, the venue can admit fifteen. The counting rule stayed the same; each door got its own allowance.

The same happens with application nodes. Choosing an algorithm is only part of the design: every node enforcing one global quota must participate in the same allowance decision.

**One sentence:** A distributed rate limiter controls how quickly a caller spends allowance; its counter placement determines which requests share that allowance.

## Prerequisites

Use Request Flow to understand where enforcement sits and Capacity Estimation to state traffic and burst assumptions. This concept module introduces the shared-state behavior needed for the experiment. The full rate-limiter design workshop is still planned.

## Mental model

For every request, answer five questions:

1. **Identity:** Who spends allowance: user, API key, tenant, IP, route, or a combination?
2. **Cost:** Does every request cost one unit, or does expensive work cost more?
3. **Scope:** Is the allowance global, regional, per node, or per endpoint?
4. **Algorithm:** How does allowance recover over time?
5. **Failure policy:** If authoritative state is unavailable, do requests pass or stop?

This Java model has one identity, one unit per request, healthy application nodes, round-robin assignment, and atomic shared decisions with zero network latency. Availability is fixed for the entire run. It does not implement authentication, Redis, HTTP rejection headers, multi-region coordination, quota allocation, or counter recovery. Virtual time makes the examples reproducible; it does not measure production throughput.

## How it works

### Fixed window: count between aligned boundaries

With a limit of five per 1,000 ms, `[0, 1000)` and `[1000, 2000)` each get five accepted requests. The decision resets the count on entering a new window. Rejected requests do not spend allowance in this model.

A request at exactly 1,000 ms belongs to the new window. Five arrivals at 999 ms followed by five at 1,000 ms all pass: two aligned windows permit ten arrivals only 1 ms apart. A fixed window does not enforce five in every moving one-second interval.

[Redis's counter patterns](https://redis.io/docs/latest/commands/incr/#pattern-rate-limiter) illustrate time-keyed counters and why increment plus expiry needs coordinated execution. Their example counts attempts; this model counts accepted requests. A real design must specify what its counter counts.

### Token bucket: spend tokens and refill them

The bucket starts full with `limit` tokens, which is its **capacity**. Each accepted request spends one token. Before the next decision, elapsed virtual time adds tokens at `refillTokensPerSecond`, capped at capacity:

`tokens before decision = min(capacity, previous tokens + elapsed ms × refill tokens/s ÷ 1000)`

With capacity two and refill two tokens/s, an empty bucket gains one token in 500 ms. Capacity controls the immediate burst; refill controls replenishment. Capacity two does not mean at most two accepted requests over an entire run.

The table's **Remaining** value counts whole spendable units. A displayed zero can still hide a fractional token; the retry delay accounts for that fraction. It predicts when a token could become available assuming no intervening request spends it, so it is not a reservation.

[Amazon API Gateway documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html) uses token-bucket terminology for rate and burst, but describes that product's throttles as best-effort targets. This illustrative atomic model does not promise a provider's production behavior.

### Shared versus independent local state

A shared counter gives all nodes one atomic allowance decision in this model. Independent local counters each get the full configured limit. Three nodes × five = fifteen possible accepted requests in one aligned window, if the workload reaches every node enough times.

An alternative design allocates quotas whose sum is five, such as 2 + 2 + 1. It can preserve that aggregate bound but leave unused allowance at one node while another rejects. Allocation, rebalancing, and leases are design alternatives, not simulator features.

**Request path in words:** identify the caller → select its policy and scope → atomically check and consume allowance → forward allowed work or reject exhausted allowance. During shared-counter failure, record an explicit bypass or policy rejection. The Architecture and Request sequence views illustrate these paths; the playground executes only the allowance decisions.

## Worked example

Eight requests for one API key arrive at `t=0`. Three nodes use one shared fixed-window counter: five accepted requests per 1,000 ms. The backend is available.

- Request 1 on A changes the shared count from 0 to 1; four remain.
- Requests 2–5 on B/C/A/B raise the count to five; zero remain.
- Requests 6–8 on C/A/B are rejected; the count stays five.
- Request 6 reports `retryAfterMs = 1000 - 0 = 1000 ms`.
- Final metrics: eight total = five enforced allowances + three rejections + zero bypasses.

**Change only placement:** use **Local counter overshoot**, with twelve simultaneous arrivals and the same three nodes and limit. Round-robin assigns four requests to each node. Every local counter stays below five, so all twelve pass. Configured aggregate allowance is `3 × 5 = 15`; observed excess above the intended global five is `12 - 5 = 7`. Fifteen is a configured potential, not the measured twelve or the overshoot seven.

**Change time:** use one shared fixed window with arrivals `999, 999, 999, 999, 999, 1000, 1000, 1000, 1000, 1000`. All ten pass in separate windows. The allowance card still says five per aligned window; it is not a total-run bound.

**Change algorithm:** choose shared token bucket, capacity two, refill two tokens/s, and arrivals `0, 0, 0, 250, 500`:

- At 0 ms, requests 1 and 2 consume the two initial tokens. Request 3 is rejected with a 500 ms retry delay.
- At 250 ms, `0 + 250 × 2 ÷ 1000 = 0.5` token is available. Request 4 is rejected with `ceil((1 - 0.5) × 1000 ÷ 2) = 250 ms` delay.
- At 500 ms, another half-token brings the balance to one. Request 5 passes, leaving zero.
- Final metrics: three allowed, two rejected, zero bypassed. The configured immediate burst is two; refill lets a third request pass later.

## Explore in the playground

1. **Predict:** Start with Shared fixed window. Which is the first rejected request, and when could it retry?
2. **Run and observe:** Read Request 6: rejected at 0 ms, zero remaining, retry after 1,000 ms. Explain why changing its application node does not add shared allowance.
3. **Change one condition:** Select Local counter overshoot. Explain fifteen possible, twelve observed, and seven excess using each node's four requests.
4. **Try the boundary:** Enter the ten 999/1,000 ms arrivals above. Check every outcome rather than comparing run totals with a one-window bound.
5. **Try refill:** Use capacity two, refill two, and `0, 0, 0, 250, 500`. Explain both rejected delays from the missing token fraction.
6. **Try failure:** Select Counter backend outage. Six requests bypass enforcement under fail-open. Change only the policy to fail-closed and rerun: all six are rejected, with no known quota or recovery delay.
7. **Transfer:** Keep the outage, switch to independent local counters, capacity five, and the same six arrivals. Each node gets two requests and all six are enforced locally. Shared-backend availability does not affect this mode; the global-limit limitation remains.

## Failures and tradeoffs

### Counter unavailable

Fail-open preserves the request path but may weaken abuse protection or overload a dependency. Fail-closed protects the guarded boundary but rejects legitimate callers. Choose according to the operation's risk and independent overload protection.

For the six-request outage preset: fail-open produces **0 allowed by enforcement, 0 rejected, 6 bypassed**. Fail-closed produces **0 allowed, 6 rejected, 0 bypassed**. Bypassed requests can reach the service, but they were never checked against quota. Configured allowance is not a bound on bypassed work.

Remaining quota is unknown during this outage; the API's zero placeholder is not proof that the bucket is empty. No retry delay is known because recovery is not modeled.

### Retry and HTTP meaning

For an actual exhausted quota, [RFC 6585 section 4](https://www.rfc-editor.org/rfc/rfc6585.html#section-4) defines HTTP 429 and permits `Retry-After`; it does not require a particular algorithm or identity. A counter outage does not establish that the caller exceeded its quota. A real fail-closed gateway can choose an explicit service-unavailable response, such as 503, rather than inventing quota exhaustion.

[HTTP Semantics section 10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after) defines `Retry-After` as an HTTP date or an integer number of **seconds**. The simulator's `retryAfterMs` is milliseconds: a 500 ms model delay could map conservatively to `Retry-After: 1`, not `500`. Other callers may spend new allowance before the retry; waiting does not guarantee success. Define bounded retries for the real operation.

The teaching API returns decisions in a successful simulation response; it does not actually return a 429 for each modeled rejected request or send these headers.

### Hot identities and cardinality

One tenant can concentrate updates on one counter. Partitioning by identity spreads different tenants but does not remove contention on one strict tenant allowance. Counter retention and identity creation need bounds too. Observe hot-key load, key count, backend errors, and protected-resource saturation before choosing a more complex design; the one-identity simulator cannot measure these production effects.

### A tempting wrong explanation

“We added nodes, so the global quota remains five and we can serve fifteen safely.” Independent full local quotas really admit up to fifteen in one window, so the intended global five was lost. Sharing state or allocating smaller quotas changes that guarantee. Scaling the limiter is also separate from increasing the protected service's capacity.

## In a real project

Start with one protected operation, such as a tenant's report-export endpoint. State its request cost, permitted burst, refill rate, and failure risk. An ordinary read and an expensive export may need separate policies or weighted costs; weighting is outside this model.

Record enforced, rejected, and bypassed decisions by bounded policy and route labels. Check decision latency, backend failures, hot counters, identity cardinality, and downstream saturation. Do not put arbitrary API keys into metric labels.

Define atomicity for the complete check-and-consume operation and its time/expiry updates. A shared store alone does not make multiple separate read/check/write calls atomic. The [Redis counter examples](https://redis.io/docs/latest/commands/incr/#pattern-rate-limiter) show why counter expiry and failure between operations matter. That source is an implementation reference, not a claim this application runs Redis.

For rollout, compare expected decisions without enforcement, enable a small scope, inspect rejected callers and downstream health, and retain an independent rollback path. This is a design recommendation to test in your application, not an implemented observe-only mode here.

## Interview practice

Build a two-minute answer in this order:

1. **Problem and assumptions:** protect tenant exports; specify identity, one-unit or weighted cost, global versus regional scope, burst tolerance, and sustained rate.
2. **Simple design:** enforce before expensive work; trace one atomic allowed decision and one exhausted decision.
3. **Evidence:** with five per window, shared state allows five of eight; three independent full quotas allow twelve of twelve and could permit fifteen.
4. **Failure:** choose fail-open or fail-closed by operation risk; distinguish bypass from enforced allowance and dependency failure from quota exhaustion.
5. **Tradeoff and follow-up:** shared decisions add latency and a dependency; allocated local quotas can strand allowance. Name a hot-key or saturation signal that would change the design.

**Follow-up 1 — more nodes:** Ten nodes each get a local quota of five. Potential one-window allowance becomes fifty, even if the intended global quota stays five. What allocation or shared decision would preserve your requirement?

**Follow-up 2 — slower refill:** Keep capacity two but change refill from two to one token/s for arrivals `0, 0, 0, 500`. Only the first two pass; the third waits 1,000 ms and the last waits another 500 ms. Capacity did not change, but the bucket replenishes more slowly.

## Teach it back

**To a teammate:** “Our API key has one allowance of five per aligned second. Shared state admits five of eight arrivals. Giving each of three nodes five independently admits twelve in our test and could allow fifteen. We must choose the intended scope before adding nodes. During counter failure, bypasses preserve access but do not prove that quota was enforced.”

Say your own explanation aloud, then compare it with that example. Use the Practice view to write, reveal a reference, and revise. Answers survive tab changes but are not yet saved across reloads.

**Self-check:** Can you state the protected operation and scope, show the five/twelve/fifteen arithmetic, explain the 250 ms fractional refill, distinguish outage rejection from exhaustion, and name one tradeoff plus a signal to revisit it? Use the decision table as evidence rather than repeating algorithm names.

**Everyday transfer:** A tenant may perform 100 cheap reads or 10 expensive exports per minute. State a cost model and whether unused read allowance should fund exports. Explain which behavior the one-token experiment cannot answer and what you would measure before deploying it.

## Further reading

- [RFC 6585 section 4: HTTP 429 Too Many Requests](https://www.rfc-editor.org/rfc/rfc6585.html#section-4)
- [RFC 9110 section 10.2.3: Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after)
- [Redis INCR: rate-limiter patterns and counter expiry](https://redis.io/docs/latest/commands/incr/#pattern-rate-limiter)
- [Amazon API Gateway: token buckets and best-effort throttling](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html)
