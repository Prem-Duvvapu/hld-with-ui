# Distributed Rate Limiter

A rate limiter protects a boundary by deciding whether one identity may perform one more operation now. This module lets you compare two algorithms, move counter state between local nodes and a shared backend, and choose an explicit policy for backend failure.

## Learning outcomes

- Calculate why independent per-node counters can exceed an intended global limit.
- Compare fixed-window and token-bucket behavior for a burst and a later request.
- Defend the enforcement point, identity, scope, atomicity, and backend-failure policy in an interview.

## Explain it simply

Imagine a venue that admits five people per minute. One doorman with one clicker can stop at five. If three doors each receive a separate clicker set to five, the venue can admit fifteen. The counting rule did not change; the state was placed at the wrong scope.

A distributed rate limiter has the same problem. The algorithm matters, but the decision is only as global as the counter used by every enforcement node.

## Prerequisites

Use Request Flow to understand where an enforcement decision sits and Capacity Estimation to state expected request rates and bursts. This module introduces the small subset of shared-state behavior needed for the experiment; it does not claim to teach database replication.

## Mental model

For every request, answer five questions in order:

1. **Identity:** Which subject consumes allowance: user, API key, tenant, IP, route, or a combination?
2. **Cost:** Does the request consume one unit, or is expensive work weighted differently?
3. **Scope:** Is the allowance global, regional, per node, or per endpoint?
4. **Algorithm:** How does allowance recover over time?
5. **Failure policy:** If enforcement state is unavailable, should the operation pass or fail?

The model uses one identity and one token per request so the counter behavior stays visible. Requests are assigned round-robin to application nodes.

## How it works

### Fixed window

A fixed window allows up to `limit` requests between aligned boundaries. A limit of five per 1,000 ms permits five requests during `[0, 1000)`, then resets at 1,000 ms. It is simple and cheap, but traffic can cluster around a boundary: five requests just before the reset and five just after it.

### Token bucket

A token bucket begins with `capacity` tokens. Each accepted request spends one. Tokens refill continuously at a declared rate up to capacity. It admits a bounded burst while controlling the longer-term rate. A rejected request can calculate when one full token should next be available under the model.

### Shared versus local state

A shared counter gives all application nodes one atomic decision point in this model. Three local counters each configured to five provide an aggregate allowance as high as fifteen. Local state is fast and survives a shared-backend outage, but cannot enforce a strict global limit without coordination or preallocated quotas.

## Worked example

Eight requests for one API key arrive at `t=0`. Three application nodes use one shared fixed-window counter with a limit of five per 1,000 ms.

| Request | Node | Shared count after decision | Result                         |
| ------- | ---- | --------------------------: | ------------------------------ |
| 1       | A    |                           1 | Allowed                        |
| 2       | B    |                           2 | Allowed                        |
| 3       | C    |                           3 | Allowed                        |
| 4       | A    |                           4 | Allowed                        |
| 5       | B    |                           5 | Allowed                        |
| 6       | C    |                           5 | Rejected; retry after 1,000 ms |
| 7       | A    |                           5 | Rejected                       |
| 8       | B    |                           5 | Rejected                       |

Now give A, B, and C independent counters with the same limit. Twelve simultaneous requests distribute four to each node, so all twelve pass. The intended global limit is five, but the system allowed twelve. With enough requests, the configured counters could allow fifteen. That difference is distributed overshoot.

## Explore in the playground

Start with **Shared fixed window** and confirm that five of eight requests pass. Open the decision table and identify the first rejected request.

Switch to **Local counter overshoot**. The limit field still says five, but each node owns a counter. Explain why the aggregate allowance is fifteen and why twelve requests pass.

Use **Counter backend outage** to compare fail-open and fail-closed. Fail-open protects availability but bypasses abuse protection. Fail-closed protects the guarded resource but rejects legitimate traffic. Neither is universally correct; choose by operation risk.

Then select token bucket, set capacity to two and refill to two tokens per second, and try arrivals `0, 0, 0, 500`. The first two pass, the third is rejected, and the request at 500 ms passes after one token refills.

## Failures and tradeoffs

**Counter backend unavailable:** Fail-open may overload a protected dependency or weaken a security boundary. Fail-closed creates an outage for legitimate callers. A product may choose different policies for login attempts, public reads, and payment creation.

**Hot identity:** One tenant or key can concentrate writes on one shared counter. Sharding by identity spreads different identities but cannot split one strict identity without changing the algorithm or accepting approximation.

**Clock and boundary effects:** Fixed windows depend on aligned boundaries. Token refill depends on elapsed time. Production implementations must define which clock and atomic operation own the decision; this model uses deterministic virtual time.

**Retries:** A rejected response should communicate a useful retry policy. Uncoordinated immediate retries create more load. HTTP 429 communicates rate limiting; `Retry-After` or standardized rate-limit fields need clear units and semantics.

**Cardinality:** Counters need bounded retention. An attacker can generate many identities, so key count and memory are also protected resources.

## In a real project

Record allowed, rejected, and bypassed decisions by policy and route without using unbounded identity labels in metrics. Monitor decision latency, backend errors, hot-key load, counter cardinality, and protected-resource saturation. Sample structured logs with a correlation ID when a decision needs diagnosis.

Roll out in observe-only mode first: calculate decisions but do not reject. Compare expected and observed impact, exclude trusted internal traffic deliberately, then enable enforcement for a small scope. Keep a rollback path that does not require the failing counter backend.

## Interview practice

A strong answer starts with the protected operation and abuse or capacity objective. Define identity, scope, limit semantics, burst tolerance, and failure policy before naming a data store. Place enforcement early enough to avoid expensive work, while preserving any gateway or service context needed for identity.

For a global limit, describe an atomic shared update and its latency/availability cost. If lower latency matters more than strictness, offer local quotas or regional allocation and quantify expected overshoot. State what metric would trigger a redesign.

## Teach it back

**One sentence:** A distributed rate limiter is an atomic allowance decision whose correctness depends on identity and counter scope as much as on its algorithm.

**To a teammate:** “We limit each API key to five requests per second. A shared counter enforces that globally, while per-node counters can multiply the allowance by the node count. Token bucket preserves a controlled burst. During counter failure we fail closed for password attempts and fail open for low-risk reads, and we monitor bypasses.”

**Two-minute interview structure:** requirements → identity and scope → algorithm → atomic state → request flow → failure policy → hot key and overshoot → metrics and rollout → credible alternative.

Transfer question: A tenant may send 100 cheap reads or 10 expensive exports per minute. Explain why one request-one token is insufficient and how weighted cost changes retry and fairness behavior.

## Further reading

- [RFC 6585, section 4: HTTP 429 Too Many Requests](https://www.rfc-editor.org/rfc/rfc6585#section-4)
- [RFC 9331: RateLimit Fields for HTTP](https://www.rfc-editor.org/rfc/rfc9331.html)
- [Google Cloud: Rate limiting strategies and techniques](https://cloud.google.com/architecture/rate-limiting-strategies-techniques)
