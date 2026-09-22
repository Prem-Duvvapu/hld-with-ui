# First release module blueprint

Status: proposed examples and acceptance notes for `P1`–`P2`. This document does not claim the modules exist. The four first-release modules are `request-flow`, `capacity-estimation`, `cache-aside`, and `url-shortener`. Their shipped schemas and precise behavior must agree with these teaching outcomes; material differences need a documented revision to the examples.

## 1. Cohesive learner journey

A first-time learner opens Request Flow. They predict what happens to six simultaneous requests with only two workers, run the workload, follow request 5 through its queue and completion, then explain the observed latency. They change a node's speed and compare routing policies. Next they estimate a URL shortener's peak demand, explore cache reads and stale results, and finish by drawing and defending a URL shortener that can handle the stated workload.

The same terms and colors follow the learner: request ID, arrival, waiting, processing, completion, failed/rejected; origin, cache entry, version, TTL; assumed workload and measured model output. Cross-module links explain why one experiment matters in the case study.

Completing the path means the learner has attempted the prediction and transfer prompts and made a design decision. Reading or playing an animation alone is tracked separately. A learner may skip an activity; progress UI reports the distinction accurately.

## 2. Request Flow and Load Balancing

### User task

“A service slows down when traffic bursts. Is the balancer distributing work badly, or are workers already saturated?”

The playground configures node count, worker count, queue capacity, service time per node, arrival schedule, routing policy, and a node failure schedule. Simple presets populate these fields. The default is the hand-checkable six-request scenario from [SIMULATION_SPEC.md](SIMULATION_SPEC.md#6-reference-first-slice-request-flow).

The module views show:

| View | Evidence visible |
| --- | --- |
| Playground | Editable workload, run status, topology, live worker/queue state, timeline, metrics |
| Guided Simulation | Prediction → run → trace request 5 → compare altered workload → explain |
| Architecture | Client, balancer, nodes, worker pools, queues and link/health assumptions |
| Request Sequence | Arrival, assignment, queue, service start, completion/failure, causal links |
| Design Details | Round-robin and least-outstanding assumptions, finite workers, queue limits, health detection, alternatives |
| Practice | What caused a delay? Which metric distinguishes queueing from service time? What changes under a node failure? |

### Fixture A: baseline

At `t=0`, six requests arrive in ID order. A and B each have one worker, unlimited waiting capacity for this small fixture, 100 ms service time, round-robin routing, zero modeled overhead, no failure. Assignment: A gets 1/3/5 and B gets 2/4/6. Each node starts its first request at 0, the second at 100, the third at 200. Latencies in request order: 100, 100, 200, 200, 300, 300 ms. Mean latency 200 ms; nearest-rank p95 300 ms; waiting times 0, 0, 100, 100, 200, 200 ms. All six complete in the 0–300 ms observation window, yielding 20 successful requests/s for this finite batch. Explain why this figure is not a sustained-capacity measurement.

### Fixture B: routing policies differ

A takes 100 ms per request; B takes 400 ms. Both have one worker. Four requests arrive at 0, 0, 150, and 200 ms. Stable ID tie order is A then B. With round-robin, assignments are A/B/A/B. Request 4 queues behind request 2 on B and finishes at 800 ms, for 600 ms latency. With least-outstanding, request 3 selects idle A at 150 ms; at 200 ms both nodes have one outstanding request, so stable ID tie order selects A for request 4. It starts at 250 ms and finishes at 350 ms, for 150 ms latency. Show the assignment and queue states at 200 ms so the outcome is explainable. This fixture is an illustration of one workload, not a claim that one routing policy always wins.

### Fixture C: overload

A and B have one worker and one **waiting slot** each, 100 ms service time, six requests arrive at 0, round-robin. Requests 1/2 start, 3/4 wait, 5/6 are rejected because both waiting slots are occupied. Requests 1/2 finish at 100 ms and 3/4 at 200 ms. Show four completions, two rejected requests, the peak waiting depth of one at each node, and the rejection reason. A zero-time rejection is a terminal outcome, not a request with zero successful latency.

### Fixture D: node failure

Start one long request on A and one on B; fail A at a configured virtual time, with a nonzero health detection delay. The model must show (a) in-flight work on A failing under the declared policy, (b) a request routed to A before detection failing explicitly, (c) no routing to A after it is marked unhealthy, and (d) recovery only after the scheduled recovery action. Do not prescribe exact numeric outcomes until the model's failure-transition ordering is finalized in `P1-01`; publish the completed fixture before the module is marked done.

### Guided questions

- Before the run: “With six arrivals and only two workers, how many complete at 100 ms? Where are the other requests?”
- At request 5: “Why is its latency 300 ms when its service time is 100 ms?”
- After the slow-node comparison: “Which field or event proves why request 4 went to a different node?”
- Transfer: “What would a finite queue change during a sustained burst, and how would you detect overload in production?”

## 3. Capacity Estimation

### User task

“Given product traffic assumptions, what range of request, storage, and bandwidth demand should the first design tolerate?”

This is an **estimator**. It displays formulas, input units, intermediate values, ranges, and warnings for assumptions that cannot determine hardware size by themselves. It does not simulate a production fleet.

### Worked example with decimal units

Assume 1,000,000 daily active users, 10 requests per user per day, a peak factor of 5, 90% reads and 10% writes, one new 1 kB record per write, 2 kB average response size, 365-day raw retention, 3 copies of the raw record, and 200 ms mean time in the system at peak under a stable-workload approximation.

| Calculation | Formula | Result, rounded |
| --- | --- | --- |
| Daily requests | 1,000,000 × 10 | 10,000,000 requests/day |
| Average request rate | 10,000,000 ÷ 86,400 | 115.74 requests/s |
| Peak request rate | average × 5 | 578.70 requests/s |
| Peak reads and writes | peak × 0.9 / × 0.1 | 520.83 reads/s, 57.87 writes/s |
| New raw data per day | 1,000,000 writes × 1 kB | 1 GB/day |
| Raw retained data | 1 GB/day × 365 | 365 GB |
| Three raw copies | 365 GB × 3 | 1,095 GB (1.095 TB) |
| Daily response bytes | 10,000,000 × 2 kB | 20 GB/day |
| Peak response rate | 578.70 × 2 kB | 1.157 MB/s, about 9.26 Mb/s |
| Mean in-flight requests at peak | 578.70/s × 0.2 s | about 116 requests |

Use decimal `kB=1,000 bytes`, `MB=1,000,000 bytes`, `GB=1,000,000,000 bytes`. The raw storage estimate excludes indexes, metadata, write-ahead logs, compaction, backups, and headroom. The response-byte calculation excludes request bytes, protocol overhead, media, and CDN effects. Average in-flight work uses the assumed steady relationship; it does not size a worker pool or promise a p95 latency. The UI keeps exact calculation values internally and rounds only display.

### Meaningful interactions

- Change peak factor from 5 to 10; peak rates and peak bandwidth double while daily raw storage stays the same under unchanged daily writes.
- Change read/write ratio from 90/10 to 99/1; reads rise and raw writes/storage fall if total requests stay fixed. Ask the learner to name what would invalidate “one write creates one record.”
- Change record size from 1 to 5 kB; raw storage scales fivefold, while response traffic remains unchanged under the separate 2 kB response assumption.
- Provide low/base/high assumption ranges; show which one drives uncertainty. Do not display fabricated cloud prices or instance counts.

### Guided question

“Your mean peak concurrency is about 116, yet a burst of 500 requests arrives at once. Why doesn't the 116 figure prove your service can absorb that burst?” Expected reasoning: the average relation hides variability and queue/service limits; test a workload in Request Flow.

## 4. Cache-aside

### User task

“Repeated reads are stressing an origin database. What load does a cache remove, and when can it return an old value?”

Model an origin key-value store and a cache with explicit entries, value versions, TTL, read latency, origin latency, cache availability, and a schedule of GET/UPDATE operations. A GET checks cache first; on miss it reads origin and fills cache. An origin update leaves an existing cache entry unchanged under the basic cache-aside policy. The cache does **not** coalesce concurrent misses in the first release. Show any such duplicate origin reads.

### Worked example

Assume cache lookup latency 2 ms, origin read latency 20 ms, zero-time cache fill after read, TTL 100 ms measured from fill, initial origin `k=v1`, and zero-time origin update for this fixture. All operations use virtual time.

| Operation | What happens | Outcome |
| --- | --- | --- |
| GET `k` arrives at 0 ms | Cache miss at 2; origin returns `v1` at 22; fill expires at 122 | `v1`, 22 ms latency |
| GET `k` arrives at 30 ms | Cache hit at 32 | `v1`, 2 ms latency |
| UPDATE origin to `v2` at 40 ms | Origin version changes; cache still has `v1` | No read response |
| GET `k` arrives at 70 ms | Cache hit at 72 | `v1`, 2 ms latency; stale relative to committed origin version |
| GET `k` arrives at 120 ms | Expiry check at lookup time 122; origin returns `v2` at 142; fill now expires at 242 | `v2`, 22 ms latency |

Four GETs produce two hits and two misses, for a 50% hit ratio, plus two origin reads. Expiry is `lookupTime >= expiresAt`. The model can identify a stale response because it sees the origin's version; label this an **observer view** because a real cache client may not know an origin update occurred.

### Failure presets

1. **Cold burst:** many same-key reads arrive before the first fill; each miss causes a separate origin read under the basic model. A later cache-stampede module can add coalescing and compare.
2. **Cache unavailable:** reads bypass or fail according to an explicitly selected policy. Count bypass separately from cache hits/misses. Show the origin load and latency effect.
3. **Origin unavailable:** a cached unexpired value may be served; a miss fails. Do not silently invent stale-while-revalidate behavior.
4. **Update and TTL:** change TTL; inspect stale duration and origin read count. A TTL of zero or negative value is handled by documented validation/policy rather than integer overflow.

### Guided questions

- “Why did the GET at 70 ms return `v1` after the origin update?”
- “Will a hundred concurrent cold misses result in one origin read under this model?”
- “What can fail when the cache is healthy but the origin is down?”
- “When would invalidation be preferable, and what new failure modes does it introduce?”

## 5. URL Shortener Design Workshop

### User task

“Design a service that creates short links and redirects readers reliably under a stated read-heavy workload.”

The workshop is a guided decision exercise with editable notes, not a simulated arbitrary architecture. It reuses the first three modules as evidence. One strong answer is presented with alternatives, not as the only correct design.

At each design stage, the learner writes an attempt, reveals a worked reference, compares the two, and revises. Keep the original attempt visible. The learner may reveal directly when studying; the UI distinguishes a viewed solution from an attempted stage.

### Prompt and constraints

Required behavior: create a link for an HTTP(S) URL, optionally specify expiry, resolve a code to a redirect, reject unknown/expired codes, and support a defined policy for abuse. A sample workload starts with the capacity example above; learners may change assumptions. State an illustrative redirect objective and availability target as assumptions, not claims about a real service.

Core invariant: an active short code resolves to exactly one target URL and never silently changes ownership. For an expired code, redirect behavior must be explicit and consistent even if a cache entry exists. A code created in a failed client request needs a retry story.

### Guided stages

| Stage | Learner output | Review prompt |
| --- | --- | --- |
| Requirements | Functional/nonfunctional list and assumptions | Which operations are correctness sensitive? |
| Estimates | Read/write, peak demand, bytes, growth, uncertainty | Which assumptions dominate storage and read load? |
| API | Conceptual create and redirect operations; response/error behavior | What happens if creation times out after committing? |
| Data | Code→target/expiry schema, unique index, creation metadata | How are collisions or custom aliases resolved? |
| Baseline | Client→edge→stateless service→indexed store | What is the write path and redirect path? |
| Evolution | Add cache and scale service instances only where demand warrants | Which lookups remain correct when cache is stale? |
| Failures | Database/cache outage, hot link, expired link, malicious URL | Which outcomes are unavailable and what can be mitigated? |
| Operations | Useful signals, alert, rollout and rollback plan | How will you tell a cache failure from a traffic spike? |
| Defense | Choice, alternative, threshold for revisiting | Why this level of complexity now? |

Treat create and redirect API sketches as **the system being designed**, separate from HLD-with-UI's teaching API. An implementation of the actual shortening service is optional future lab work.

### Candidate architecture and alternatives

The baseline uses stateless application instances and a store with a unique code index. On create, validate HTTP(S), generate a code, attempt an atomic unique insert, and retry a bounded number of collisions; exhausted attempts return an error. On redirect, look up by code, check expiry, and respond according to the stated redirect policy. Discuss random codes versus allocated sequences, and how unpredictability/guessability and coordination differ.

The evolved read path may check a cache first. Cache keys include the code; entries include target plus expiry metadata. Cache TTL may not extend past link expiry. A cached entry is still checked against link expiry before redirect. On miss, read the store and fill the cache. If revocation becomes a requirement, revisit invalidation/staleness guarantees rather than claiming the initial TTL policy solves it.

Discuss hot links, negative caching of unknown codes with a short bounded TTL, rate limits for create/resolve abuse, URL scheme validation, redirect loop policy, and analytics as asynchronous optional work. No server-side fetch of arbitrary target URLs is necessary for create or redirect. Security discussion explains how redirect services can be abused without implying that every possible control is built in the workshop.

### Failure review

- Cache outage raises direct store load; rate/admission control and capacity determine whether fallback is safe.
- Store outage may allow cached active redirects for a bounded time but blocks new links and misses. Explain the chosen behavior and its correctness conditions.
- An expired link must stop redirecting even if a cache entry remains due to a wrong TTL policy; the exercise asks the learner to detect this design flaw.
- A timed-out create can have committed. Discuss a client-supplied idempotency key or a lookup strategy, including retention/scope limits.
- A popular link can be a hot key; test the demand assumptions and edge caching policy before adding partitions to everything.

### Assessment rubric

Evaluate requirements, estimates, data/API correctness, read/write paths, cache expiry, failure behavior, security/abuse, operation, and clear tradeoff reasoning on the project-wide 0–3 descriptive scale. Accept a simpler design when its stated capacity and constraints justify it. Do not reward extra services or products merely for appearing more “distributed.”

## 6. Cross-module release checks

1. All module IDs, prerequisites, routes, links, and published capabilities resolve from one catalog.
2. The six-request load fixture, slow-node policy comparison, overload outcomes, capacity table, and cache version/expiry fixture are reconciled with the Java implementation and displayed UI values.
3. Learners can complete each module on a narrow viewport with keyboard navigation; the simulation remains understandable with motion disabled and graph replaced by its text state.
4. Switching tabs preserves relevant form/answer state; browser back/forward and direct links select the intended view.
5. Java API failures, invalid input, unsupported versions, and budget limits have accurate states and no false success result.
6. Progress distinguishes opened, attempted, completed, and bookmarked activities. Export/import works with version and conflict rules.
7. A first-time learner can describe why request 5 waited, why an origin read increased after TTL expiry, and why an expired short code must not redirect from cache.
8. The README and catalog show only what is shipped. External sources are linked from the associated lessons and case study.
