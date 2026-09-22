# Research notes and source register

Reviewed on 2026-09-22. This document records what informed the plan and where future authors should verify detailed claims. Links to external resources are references, not project dependencies.

## Primary product reference: LLD with UI

The project owner explicitly selected **LLD with UI as the best of the three related projects**. It is the primary product benchmark for this plan.

Reviewed revision: [`c62e0313925bc9355b4727c4d0aca17198b6077d`](https://github.com/Prem-Duvvapu/lld-with-ui/tree/c62e0313925bc9355b4727c4d0aca17198b6077d). Inspected the README, agent/contribution documentation, historical roadmap, frontend manifest, home page, shared page shell, design details, attempt/reveal components, and a representative notification page. This was a source/document review, not a running-application visual audit.

| Observed source pattern | HLD adaptation |
| --- | --- |
| [`LldPage.jsx`](https://github.com/Prem-Duvvapu/lld-with-ui/blob/c62e0313925bc9355b4727c4d0aca17198b6077d/frontend/src/components/LldPage.jsx) supplies shared navigation, tabs, diagrams, design details, and source links | One `HldModulePage` shell with capability-driven tabs and direct links to each view |
| [`NotificationPage.jsx`](https://github.com/Prem-Duvvapu/lld-with-ui/blob/c62e0313925bc9355b4727c4d0aca17198b6077d/frontend/src/lld/notification/NotificationPage.jsx) integrates operations, a guided scenario, failures, retries, deduplication, and event review | Every HLD module links user operations to state transitions, visible evidence, and design reasoning |
| [Repository conventions](https://github.com/Prem-Duvvapu/lld-with-ui/blob/c62e0313925bc9355b4727c4d0aca17198b6077d/AGENTS.md) place business behavior in Java and isolate simulation state | Plain Java models with request-local runs; React projects returned state |
| [Historical roadmap](https://github.com/Prem-Duvvapu/lld-with-ui/blob/c62e0313925bc9355b4727c4d0aca17198b6077d/ROADMAP.md) emphasizes complete modules and regression checks for shared integration points | Each module includes declared capabilities, content, routes, fixtures, UI, and review evidence |
| [`DesignDetails.jsx`](https://github.com/Prem-Duvvapu/lld-with-ui/blob/c62e0313925bc9355b4727c4d0aca17198b6077d/frontend/src/components/DesignDetails.jsx) and [`AttemptComparison.jsx`](https://github.com/Prem-Duvvapu/lld-with-ui/blob/c62e0313925bc9355b4727c4d0aca17198b6077d/frontend/src/components/AttemptComparison.jsx) let learners form an answer and compare it with a revealed design | Guided HLD design stages invite an attempt before showing a reference, then display learner notes beside the explanation |

These are design adaptations, not a plan to copy the repository wholesale. HLD needs explicit virtual time and distributed failure models; LLD's real thread races demonstrate a different boundary. Reuse the learning pattern while choosing mechanics appropriate to each concept. Repository-specific workflow rules apply only if deliberately adopted here.

## Supporting references from the project family

| Project and reviewed revision | Evidence and useful practice |
| --- | --- |
| [DSA with UI](https://github.com/Prem-Duvvapu/dsa-with-ui/tree/2b6b7092cf02a8a2edfb78c08eb36527e514a86e) | README and frontend manifest: executed traces, declared inputs, coverage distinguished from implementation, bounded responses, semantic tests |
| [CS fundamentals with UI](https://github.com/Prem-Duvvapu/cs-fundamentals-with-ui/tree/b001f1a528623a62c8817288a68783a013617362) | README and content specification: structured explanations, topic navigation, practice, local progress, content validation |

Recommendations here come from source inspection. Published counts in those READMEs were not independently revalidated and are not used as HLD targets.

## User-provided discovery index

[Awesome System Design Resources](https://github.com/ashishps1/awesome-system-design-resources) groups concepts, practice problems, articles, and papers. It informed the breadth check. HLD's order, interactive learning model, and delivery phases are original planning decisions for this project.

Use the collection to discover material, then verify the underlying resource. Availability and quality vary by link. Its repository license does not grant permission to reproduce every linked article, book, diagram, or video. Keep core lessons self-contained and cite the specific source used.

## Technical reference register

These sources were opened during planning. “Reviewed” means relevant material was inspected for planning; it does not substitute for a claim-by-claim review when writing a lesson or implementing a protocol.

| ID | Primary reference | Curriculum use / review focus |
| --- | --- | --- |
| `sre-book` | [Google, Site Reliability Engineering](https://sre.google/sre-book/table-of-contents/) | Objectives, monitoring, overload, production readiness and recovery; select the specific chapter during authoring |
| `aws-retries` | [AWS, Timeouts, retries, and backoff with jitter](https://d1.awsstatic.com/builderslibrary/pdfs/timeouts-retries-and-backoff-with-jitter.pdf) | Timeout choice, retry amplification and jitter; illustrative workloads require their own stated assumptions |
| `aws-jitter` | [AWS, Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) | Comparing retry schedules under contention |
| `pg-isolation` | [PostgreSQL, Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html) | Product-specific guarantees and retries; pin the documentation version in a published lesson |
| `pg-indexes` | [PostgreSQL, Indexes](https://www.postgresql.org/docs/current/indexes.html) | Access-path and write-cost tradeoffs; use concrete query plans in later real labs |
| `redis-expire` | [Redis, EXPIRE](https://redis.io/docs/latest/commands/expire/) | TTL behavior; distinguish application model assumptions from exact Redis mechanics |
| `redis-eviction` | [Redis, Key eviction](https://redis.io/docs/latest/develop/reference/eviction/) | Eviction versus expiration and policy details |
| `kafka-design` | [Apache Kafka 4.1, Design](https://kafka.apache.org/41/design/design/) | Partitioned logs, consumers and delivery/processing semantics; a versioned reference, not a claim that 4.1 is the latest release |
| `stripe-idempotency` | [Stripe, Idempotent requests](https://docs.stripe.com/api/idempotent_requests) | A concrete API contract; do not generalize its exact key retention/error behavior to all systems |
| `cap-paper` | [Gilbert and Lynch, Brewer's conjecture and the feasibility of consistent, available, partition-tolerant web services](https://groups.csail.mit.edu/tds/papers/Gilbert/Brewer2.pdf) | Precise model and definitions for CAP lessons |
| `dynamo-paper` | [DeCandia et al., Dynamo](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf) | Partitioning, replication, conflicts and availability tradeoffs of the described system |
| `raft-paper` | [Ongaro and Ousterhout, In Search of an Understandable Consensus Algorithm](https://raft.github.io/raft.pdf) | Elections, replicated log and safety conditions; required protocol review before publishing a Raft model |
| `spanner-paper` | [Google Research, Spanner](https://research.google/pubs/spanner-googles-globally-distributed-database/) | Advanced reading on distributed transactions and time assumptions |

For specialized modules, add primary references before implementation. The presence of a topic in the curriculum does not mean all of its technical details have already been researched.

## Implementation references

| ID | Reference | Decision it informs |
| --- | --- | --- |
| `react-setup` | [React: Build a React app from scratch](https://react.dev/learn/build-a-react-app-from-scratch) | Vite SPA option and responsibilities for routing, data fetching and code splitting |
| `spring-requirements` | [Spring Boot system requirements](https://docs.spring.io/spring-boot/system-requirements.html) | Check Java/build-tool compatibility during bootstrap; exact versions belong in build files |
| `react-flow` | [React Flow documentation](https://reactflow.dev/learn) | Candidate for later architecture editing; not required for the first fixed-topology experiment |
| `wcag` | [W3C WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/) | Accessibility acceptance across controls, reading and diagrams |
| `aria-tabs` | [W3C ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) | Keyboard and semantic behavior of the shared module navigation |

## Maintenance

Lesson resource entries should link directly to the relevant page/section, identify the claim supported, and record the review date. Recheck changing product behavior when its lesson is modified. Keep historical papers clearly labeled as describing their original systems. A broken external link should lead to a replacement source or honest unavailable label, not deletion of attribution.
