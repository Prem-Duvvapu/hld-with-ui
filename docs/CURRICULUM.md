# Curriculum and learning paths

Status: planned coverage. Every row is a bounded learning module, not a claim of implementation. IDs below become canonical catalog IDs. Dependencies are module IDs; the catalog validator must enforce an acyclic graph. A contributor may split a large module with a documented ID/prerequisite migration before authoring it.

**Release notation:** R1 = first release; R2 = core expansion; R3 = advanced distributed systems; R4 = specialization. In each row, the named experiment is the intended teaching method. A module may publish with study/practice only if its unfinished experiment is clearly unavailable. Release gates specify which experiments are mandatory.

## 1. Foundations and the request path

| ID | Prerequisites | Decision or mechanism to learn | UI experiment / evidence | Release |
| --- | --- | --- | --- | --- |
| `request-flow` | None | Trace client → balancer → finite service workers; distinguish routing, waiting, and execution | Route requests; compare round-robin/least-outstanding; slow/fail one node | R1 |
| `capacity-estimation` | `request-flow` | Estimate demand with units, peaks, headroom, and uncertainty | Change active users/read-write mix; inspect intermediate calculations | R1 |
| `requirements-slos` | `capacity-estimation` | Turn needs into latency/availability/durability objectives | Compare request-based and time-based objectives and budget consumption | R2 |
| `network-edge` | `request-flow` | Place DNS, TLS termination, reverse proxy, gateway, and CDN | Trace cold/warm resolution and connection setup with explicit assumptions | R2 |
| `api-communication` | `network-edge` | Choose REST/RPC, pagination, polling, WebSocket, SSE, or webhooks | Compare connection lifecycle and message direction for a declared workload | R2 |
| `scaling-state` | `capacity-estimation` | Scale stateless services while locating session state and bottlenecks | Add workers; compare sticky sessions and external session state on node loss | R2 |

## 2. Data and storage

| ID | Prerequisites | Decision or mechanism to learn | UI experiment / evidence | Release |
| --- | --- | --- | --- | --- |
| `data-access-models` | `capacity-estimation` | Choose relational/document/key-value/wide-column/graph storage from queries and invariants | Map access patterns to keys/indexes; expose costs of unsupported queries | R2 |
| `indexes-storage` | `data-access-models` | Explain index benefit, write amplification, and storage-engine tradeoffs | Compare a range scan, point lookup, and write path with labeled simplified models | R2 |
| `replication` | `data-access-models` | Understand acknowledgment policy, replica lag, and failover data loss | Write/read sequence with delayed replica and leader loss | R2 |
| `partitioning` | `data-access-models`, `capacity-estimation` | Choose partition keys; diagnose skew and cross-partition work | Hash/range partition a workload; reveal hot keys and resharding cost | R2 |
| `consistent-hashing` | `partitioning` | Explain key movement, virtual nodes, and load imbalance | Add/remove nodes and compare moved-key fraction for the same key set | R2 |
| `transactions-isolation` | `data-access-models` | Preserve business invariants under concurrent operations | Interleave purchase/update operations; identify anomalies and chosen guarantees | R2 |
| `object-storage` | `data-access-models`, `network-edge` | Separate metadata from bytes; plan multipart uploads and lifecycle | Failed chunk upload, retry, metadata finalization, orphan cleanup | R3 |

## 3. Caching and performance

| ID | Prerequisites | Decision or mechanism to learn | UI experiment / evidence | Release |
| --- | --- | --- | --- | --- |
| `cache-aside` | `request-flow`, `capacity-estimation` | Understand hit/miss/TTL behavior, staleness, and origin protection | Execute real modeled lookups, fills, expiry, origin update, and outage | R1 |
| `cache-policies` | `cache-aside`, `data-access-models` | Choose eviction, invalidation, write-through or write-behind | Replay a key trace against policies; inspect dirty writes and failure exposure | R2 |
| `cache-failures` | `cache-aside`, `scaling-state` | Diagnose stampedes, penetration, hot keys, and synchronized expiry | Compare request coalescing, bounded negative caching, TTL jitter | R2 |
| `cdn-delivery` | `cache-aside`, `network-edge` | Place content near users and reason about invalidation | Regional hits/misses, origin outage, TTL and cache-key errors | R2 |
| `queues-tail-latency` | `capacity-estimation`, `request-flow` | Explain saturation, queue delay, tail latency, and backpressure | Arrival/service variability and finite queue experiments | R2 |

## 4. Asynchronous work and reliability

| ID | Prerequisites | Decision or mechanism to learn | UI experiment / evidence | Release |
| --- | --- | --- | --- | --- |
| `queues-delivery` | `queues-tail-latency` | Distinguish broker acknowledgment, processing, and durable effect | Crash before/after effect and before/after acknowledgment; replay duplicates | R2 |
| `streams-pubsub` | `queues-delivery`, `partitioning` | Explain partition ordering, offsets, groups, replay, and retention | Add consumers, rebalance, replay, and observe per-partition lag | R2 |
| `idempotency` | `transactions-isolation`, `queues-delivery` | Make retried effects safe within a defined scope | Duplicate operation, key conflict, dedupe expiry, lost response | R2 |
| `timeouts-retries` | `request-flow`, `queues-tail-latency` | Choose deadlines and bounded retry policy | Slow dependency; compare immediate retry, backoff/jitter, and retry budget | R2 |
| `circuit-breakers` | `timeouts-retries` | Isolate failure with breaker, bulkhead, and load shedding | Dependency failure/recovery; inspect open/half-open probes and rejected work | R2 |
| `rate-limiting` | `capacity-estimation`, `scaling-state` | Choose a limit algorithm and enforcement scope | Burst inputs against token bucket/window strategies; show distributed overshoot assumptions | R2 |
| `outbox-cdc` | `transactions-isolation`, `idempotency`, `streams-pubsub` | Avoid a database-write/event-publish gap | Crash at each boundary; replay relay and deduplicate downstream | R3 |
| `sagas` | `outbox-cdc` | Coordinate long workflows with compensation | Partial checkout failure, compensation failure, and reconciliation | R3 |

## 5. Distributed guarantees

| ID | Prerequisites | Decision or mechanism to learn | UI experiment / evidence | Release |
| --- | --- | --- | --- | --- |
| `consistency-models` | `replication`, `transactions-isolation` | Compare linearizability, eventual behavior, and session guarantees | Read/write histories with observed order and legal/illegal outcomes | R3 |
| `cap-partitions` | `consistency-models` | Explain choices during a partition for a particular operation | Cut a link; inspect successful, rejected, delayed, and conflicting operations | R3 |
| `quorums-conflicts` | `cap-partitions`, `consistent-hashing` | Understand read/write overlap and reconciliation assumptions | Configure N/R/W, unavailable replicas, concurrent versions | R3 |
| `logical-clocks` | `consistency-models` | Separate causality from wall-clock order | Deliver messages out of order; compare Lamport and vector timestamps | R3 |
| `consensus-raft` | `replication`, `cap-partitions` | Explain elections, log replication, majority commit, and recovery | Partition a leader and rejoin it; inspect term/log/commit progression | R3 |
| `leases-fencing` | `logical-clocks`, `consensus-raft` | Explain expired ownership and stale writers | Pause owner past lease; reject stale fencing token at protected resource | R3 |
| `discovery-gossip` | `timeouts-retries`, `cap-partitions` | Understand failure suspicion and membership convergence | Delayed heartbeat versus dead node; gossip propagation | R3 |
| `distributed-ids` | `partitioning`, `logical-clocks` | Choose uniqueness, ordering, and coordination tradeoffs | Sequence allocation versus UUID/time-based IDs; clock rollback and collision handling | R3 |

## 6. Production architecture

| ID | Prerequisites | Decision or mechanism to learn | UI experiment / evidence | Release |
| --- | --- | --- | --- | --- |
| `architecture-boundaries` | `data-access-models`, `api-communication` | Choose modular monolith, services, events, or serverless based on constraints | Compare boundaries, dependency failures, deployment and data ownership | R2 |
| `observability` | `requirements-slos`, `timeouts-retries` | Use metrics/logs/traces to test a hypothesis | Diagnose a slow request using correlated evidence | R2 |
| `security-tenancy` | `api-communication`, `data-access-models` | Define trust boundaries, authorization, isolation, and abuse controls | Threat-model tenant access, signed URLs, quotas, and sensitive data flow | R2 |
| `deployment-migrations` | `architecture-boundaries`, `replication` | Evolve APIs/data without breaking mixed versions | Rolling/canary rollout and expand-contract schema migration; rollback limits | R3 |
| `multi-region-recovery` | `replication`, `requirements-slos`, `cap-partitions` | Choose RPO/RTO, traffic routing, backup and restore strategies | Regional loss and restore timeline with explicit data-loss window | R3 |
| `cost-efficiency` | `capacity-estimation`, `observability` | Balance utilization, headroom, storage, and network cost | User-supplied unit-price calculator with scenario sensitivity | R3 |
| `search-pipelines` | `outbox-cdc`, `partitioning` | Operate indexing pipelines and reason about freshness | Delayed indexing, reindex/backfill, and query fanout | R4 |
| `media-realtime` | `cdn-delivery`, `object-storage`, `api-communication` | Design media processing and real-time delivery | Upload/transcode/publish pipeline and slow-consumer behavior | R4 |
| `ai-serving` | `search-pipelines`, `queues-tail-latency`, `cost-efficiency` | Compose retrieval/model serving with latency and cost budgets | Retrieval freshness, batch queues, cache scope, and dependency failure | R4 |

### Technical review traps

Lesson reviewers must challenge slogans: CAP needs a partition and precise consistency/availability definitions; quorum overlap alone does not prove linearizability; delivery semantics do not automatically guarantee a single external side effect; percentile latencies cannot generally be added; replication is not a backup; average throughput does not capture bursts. Resolve each with explicit model assumptions and primary references during authoring.

## 7. Case-study progression

Every case includes baseline → observed limitation → justified evolution. All names describe educational designs; do not claim to reproduce a company's private architecture.

| ID | Main prerequisites | Required design challenge | Release |
| --- | --- | --- | --- |
| `url-shortener` | First three R1 concepts | Key generation and collision handling, redirects, read-heavy cache, hot links, expiry/abuse | R1 |
| `notification-service` | `queues-delivery`, `idempotency`, `rate-limiting` | User preferences, provider failure, retry/DLQ, per-recipient fairness | R2 |
| `distributed-rate-limiter` | `rate-limiting`, `replication` | Enforcement location, overshoot tolerance, hot identities, backend failure | R2 |
| `chat-service` | `streams-pubsub`, `api-communication`, `replication` | Ordering scope, reconnect, offline delivery, receipts and presence | R2 |
| `news-feed` | `partitioning`, `cache-failures`, `streams-pubsub` | Push/pull fanout, celebrity skew, freshness, privacy changes | R2 |
| `file-storage` | `object-storage`, `idempotency`, `security-tenancy` | Upload completion, metadata consistency, sharing, cleanup | R3 |
| `video-platform` | `media-realtime`, `cdn-delivery` | Transcoding, adaptive delivery, storage/egress, failure recovery | R4 |
| `commerce-checkout` | `sagas`, `transactions-isolation`, `idempotency` | Inventory reservation, payment effects, compensation and reconciliation | R3 |
| `ticket-booking` | `leases-fencing`, `transactions-isolation` | Contention, hold expiry, oversell prevention, surge admission | R3 |
| `payment-ledger` | `idempotency`, `outbox-cdc`, `security-tenancy` | Ledger invariants, retries, audit and reconciliation | R3 |
| `job-scheduler` | `leases-fencing`, `queues-delivery` | Ownership, retry, cancellation, lost worker and overdue execution | R3 |
| `metrics-platform` | `streams-pubsub`, `partitioning`, `observability` | Cardinality, ingestion/backpressure, retention and query tradeoffs | R3 |
| `web-crawler-search` | `search-pipelines`, `rate-limiting` | Frontier scheduling, politeness, dedupe, freshness and indexing | R4 |
| `location-matching` | `partitioning`, `api-communication` | Geospatial search, moving entities, stale locations and dispatch | R4 |
| `collaborative-editor` | `logical-clocks`, `consistency-models`, `api-communication` | Concurrent edits, reconnect, conflict semantics; compare OT/CRDT assumptions | R4 |
| `distributed-kv-store` | `quorums-conflicts`, `consensus-raft`, `consistent-hashing` | Partitioning, replication, repair and explicit consistency contract | R3 |

Advanced cases may need short supplemental readings before their specialist topic is independently implemented. Declare those dependencies in the catalog; do not silently assume them.

## 8. Suggested paths

- **First steps:** the three R1 concepts → URL shortener → requirements/SLOs → data-access models → replication → partitioning → queues/delivery.
- **Day-to-day backend work:** core concepts → cache failures → timeouts/retries → circuit breakers → idempotency → outbox/CDC → observability → deployment/migrations. Include prerequisite closure automatically.
- **Interview preparation:** foundations → data/storage → caching → async/reliability → consistency → URL shortener → notification → chat → feed → checkout → timed unseen prompt.
- **Advanced distributed systems:** replication → consistency/CAP → quorums → clocks → consensus → leases/fencing → regional recovery → KV-store case.

Each path contains prerequisite-aware checkpoints and optional depth. Avoid presenting all advanced topics as required before the learner can complete an approachable case study.
