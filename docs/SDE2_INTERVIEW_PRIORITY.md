# SDE-2 backend interview priority

Reviewed: 2026-09-22

Use this guide to choose and sequence interview-focused modules. It complements the prerequisite order in the [curriculum](CURRICULUM.md); it does not replace prerequisites or justify publishing an incomplete module.

## Evidence boundary

No authoritative dataset publishes system-design question frequency by role, company, date, and location. Public interview reports are self-selected, sometimes incomplete, and may be copied or published long after an interview. Therefore:

- do not publish invented frequency percentages or “guaranteed” questions;
- treat repeated prompts as preparation priorities, not predictions;
- teach transferable decisions because interviewers change the product wrapper;
- review this list periodically against dated public reports.

The priorities below combine recurring prompts in recent public SDE-2 reports with the mechanisms needed in day-to-day backend work.

## Priority case path

| Priority | Design prompt | Decisions the learner must defend | Required concept modules |
| --- | --- | --- | --- |
| 1 | URL shortener | API and redirect semantics, key generation, collisions, read-heavy storage, caching, hot links, expiry and abuse | request flow, capacity estimation, cache aside, data access models |
| 2 | Distributed rate limiter | algorithm, enforcement point, identity/scope, atomic updates, distributed overshoot, availability and failure policy | capacity estimation, scaling state, replication |
| 3 | Chat or messaging | connection lifecycle, ordering scope, delivery acknowledgements, offline delivery, multi-device sync and presence | API communication, queues/streams, idempotency, replication |
| 4 | News feed or Twitter | fan-out on write/read, celebrity skew, ranking boundary, pagination, freshness and privacy changes | partitioning, caching, queues/streams |
| 5 | Notification service | preferences, fan-out, provider isolation, retries, deduplication, rate limits and dead-letter handling | queues/delivery, idempotency, retries, rate limiting |
| 6 | Booking or ticketing | search versus inventory truth, temporary holds, contention, expiry, payment effects and oversell prevention | transactions, idempotency, leases/fencing |

Deliver these cases after their prerequisite concepts. URL shortener remains the first integrated case because it connects the initial request-flow, estimation, and cache modules without requiring advanced distributed guarantees.

## Important adjacent prompts

| Prompt | Main backend depth |
| --- | --- |
| File storage or video platform | multipart upload, metadata/bytes separation, processing pipeline, object storage, CDN and cleanup |
| Distributed cache | partitioning, consistent hashing, eviction, replication, hot keys and node failure |
| Job scheduler | due-time indexing, ownership, retries, deduplication, lost workers and overdue jobs |
| Ride hailing or location matching | geospatial lookup, moving state, matching, regional spikes and stale positions |
| Service discovery | registration, heartbeats, failure suspicion, propagation, load balancing and stale membership |
| Search autocomplete | prefix access, ranking, sharded indexes, freshness and abusive/high-cardinality input |

These are valuable variation exercises after the main case path. A learner should recognize that the same mechanisms recur under a different product name.

## Questions asked inside almost every prompt

Every case-study module and mock interview should require the learner to answer:

1. What are the functional requirements and explicit non-goals?
2. What traffic shape, data volume, latency, availability, durability, and consistency are required?
3. What are the API contracts, data model, keys, indexes, and dominant access patterns?
4. Where can work queue, and what applies backpressure or rejects overload?
5. Where do caching, partitioning, replication, and asynchronous processing help?
6. What happens on duplicate requests, retries, concurrent writes, and partial failure?
7. Which invariant must remain true, and within what boundary is it guaranteed?
8. Which component reaches its limit first, and which metric would prove that diagnosis?
9. What simpler design works initially, and what evidence triggers the next evolution?
10. Why is the selected tradeoff preferable to one credible alternative for this workload?

For SDE-2, also ask the learner to connect one decision to a real project: an incident, migration, performance measurement, API change, or operational tradeoff. Recent reports frequently mix a design prompt with detailed discussion of the candidate's own architecture.

## Recent public evidence sampled

These reports support the priority direction but do not establish statistical frequency:

- [Microsoft SDE-2 2025 consolidated reports](https://leetcode.com/discuss/post/6403987/microsoft-sde-2-recent-questions-2025-consolidated/) include URL shortener, chat, scheduler, load balancer, and Twitter-feed follow-ups.
- [Amazon SDE-2 Twitter design report](https://leetcode.com/discuss/post/6841317/amazon-sde-2-interview-experience-by-cla-9dxb/) covers feed fan-out, storage, IDs, consistency, partitioning, replication, and celebrity skew.
- [Amazon SDE-2 hotel-booking report](https://leetcode.com/discuss/post/4819993/Amazon-SDE-2-or-Interview-Loop-or-2024-/) records a booking-system design round.
- [Amazon SDE-2 training-video report](https://leetcode.com/discuss/post/5867198/Amazon-or-SDE2-or-Seattle-or-2024-Accepted/) records a YouTube-like video platform prompt.
- [Postman backend SWE-2 report](https://interviewexperiences.in/experience/postman/postman-swe2-interview) includes URL shortener implementation and a comment-system design prompt.
- [Microsoft SDE-II distributed-cache report](https://www.geeksforgeeks.org/interview-experiences/microsoft-interview-experience-sde-ii-2/) includes distributed cache, consistent hashing, autocomplete, and project-architecture discussion.
- [Flipkart SDE-2 report](https://www.geeksforgeeks.org/interview-experiences/flipkart-interview-experience-for-sde-2-off-campus/) covers BookMyShow, estimates, NFRs, concurrency, idempotency, sharding, load balancing, and caching.
- [Amazon SDE-2 auction report](https://leetcode.com/discuss/post/7477684/amazon-india-sde-2-interview-experience-ca6y0/) emphasizes database schemas, low-latency APIs, caching, and prior project decisions.
- [Zeta SDE-2 report](https://leetcode.com/discuss/post/7187148/) records a service-discovery prompt with health detection and routing follow-ups.

## Contribution rule

Do not create a shallow catalog of named interview answers. Complete one case at a time with requirements, estimates, APIs, data model, two request/data flows, an invariant, overload and dependency failure, operational evidence, alternatives, and an interview rubric. The learner must make and explain decisions rather than memorize a diagram.
