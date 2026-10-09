# URL Shortener publication review

Review date: 2026-10-09. Candidate content: **1.5.0**. Catalog status: **draft**.

All ten stages are authored and technically reviewed. This report does **not** publish the workshop or certify a first release. Evidence from the remaining human/prerequisite checks below is required by the learning and quality standards. See [HLD-09C-D](work-items/HLD-09C-D.md) for commands/results and [decision 0016](decisions/0016-workshop-eligibility-clock-and-objective.md) for the corrections.

## Stage review

| Stage | Reviewed decision and evidence | Limit kept visible |
| --- | --- | --- |
| Requirements | Create/public resolve, immutable ownership, uniform 404, abuse policy, non-goals and the same combined correctness/latency objective as Operations | Assumed workload and targets; no measured SLO |
| Estimates | Java baseline and independent peak/read/record-size changes; units, storage growth, bandwidth and mean concurrency | Mean is not p95 or worker capacity; reservations/replay/index/backup overhead separate |
| API | 201/302/400/404/409/429/503, same caller/key/accepted fields, retained replay before new-create expiry validation, no-store | Product retry rules; no actual shortening endpoints; authoritative expiry decision can precede response completion |
| Data | Unique reservations, immutable mappings, composite caller/key, atomic completed result, bounded collision retries and permanent non-reuse | Illustrative PostgreSQL sketch; no database execution or complete DDL |
| Baseline | Client/service/primary/destination boundaries, synchronous SQL, separate destination fetch, failure authority and clock | One logical primary is not tested HA; service never fetches arbitrary destinations |
| Flows | Successful create/resolve, lost response replay, expiry equality; confirmed rollback versus uncertain commit | Each walkthrough is a distinct authored path, not an execution trace |
| Evolution | Optional immutable mapping cache, one primary read per resolve, metadata/full-row arithmetic, aggregate pool/admission | 95% mapping hits do not remove eligibility QPS or primary-outage dependence |
| Failures | Hot link, cache outage, cold origin outage, stale eligibility, uncertain create and bounded retry amplification | Java generic cache/queue/rate-limit experiments do not execute this architecture |
| Operations | Included outcomes and 200 ms/99.9% objective, 100-failure budget, signals, safe incident/rollout/restore, privacy and authorization | No telemetry, authentication, moderation or deployment system added |
| Defense | Brief opening, two-minute scaffold, flexible interview discussion, alternatives and changed requirements | Self-checks are learner judgments; no automated score, mastery or hiring claim |

### Corrections made during review

1. Requirements previously proposed p95 plus a separate valid-redirect success ratio, while Operations used a combined correctness/latency ratio. Both now describe the same included well-formed resolve population and target. Correct 404s are successful contract outcomes; included overload/dependency failures are failures. p95 is a diagnostic.
2. The expiry invariant did not identify its clock or completion boundary. The primary's authoritative decision time now governs expiry; an unchecked slow handler clock cannot extend it. Earlier approved responses may finish after expiry/takedown. Clock accuracy/failover assumptions remain explicit.
3. Resource metadata now includes the cited 410 section and AWS's current redirect destination. Source IDs stay stable.

## Primary-source review

The fifteen resources were opened on the review date. Resource metadata and stage source IDs resolve through the canonical catalog. Content is original; no external source code or diagrams were copied. Sources support mechanisms, not our workload, numeric objectives or chosen product policies.

| Resource | Claim checked / boundary |
| --- | --- |
| [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html) | Method, Location, redirect and error semantics; caller-key replay and uniform 404 are product choices |
| [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986.html) | URI components/security; HTTP(S) acceptance is not proof a destination is safe |
| [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2.5) | HTTP no-store; distinct from application-cache invalidation and hostile-client privacy |
| [Little's paper](https://pubsonline.informs.org/doi/10.1287/opre.9.3.383) | Public abstract's average relationship/conditions; no worker or burst sizing guarantee |
| [AWS load testing](https://docs.aws.amazon.com/wellarchitected/latest/framework/perf_process_culture_load_test.html) | Realistic complete-workload verification; estimator assumptions are not measured capacity |
| [RFC 6585](https://datatracker.ietf.org/doc/html/rfc6585#section-4) | 429 and optional Retry-After; identity and quota scope require separate design |
| [PostgreSQL constraints](https://www.postgresql.org/docs/16/ddl-constraints.html) | Unique/compound/foreign keys; permanent retention and immutability require product enforcement |
| [PostgreSQL INSERT](https://www.postgresql.org/docs/16/sql-insert.html) | Targeted DO NOTHING and RETURNING; whole-create atomicity is a transaction obligation |
| [PostgreSQL transactions](https://www.postgresql.org/docs/16/tutorial-transactions.html) | Commit/rollback boundary; the three-record design is illustrative |
| [PostgreSQL isolation](https://www.postgresql.org/docs/16/transaction-iso.html) | Read Committed statement visibility and conflicts; do not assume DO NOTHING exposes the conflicting row in that statement |
| [Microsoft cache-aside](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside) | Miss/fill and consistency/lifetime limitations; strict mapping/eligibility split is our design |
| [AWS retries/backoff/jitter](https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter) | Uncertain side effects, deadlines and retry amplification; attempt/window values are illustrative |
| [Google monitoring](https://sre.google/sre-book/monitoring-distributed-systems/) | User symptoms, causes and four signals; incident/rollout is an original exercise |
| [Google SLOs](https://sre.google/sre-book/service-level-objectives/) | Indicators, targets, windows and correctness; 99.9%/200 ms is not a Google recommendation |
| [OWASP REST security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html) | Authorization, validation and audit handling; no implemented control/service is claimed |

## Publication gates

| Gate | State | Evidence / next step |
| --- | --- | --- |
| Ten authored stages and technical/source review | Reviewed | Stage matrix above; Java fixtures and validation in HLD-09C-D |
| Answers, self-checks, deep links and backup/import | Automated review | All-stage browser journey preserves 64 records; existing failures/version/conflict tests remain |
| Widths/themes/keyboard/reduced motion/diagram equivalents | Automated and agent review | Existing workshop journeys plus all-stage native zoom; human screen-reader review is separate |
| Real screen-reader walkthrough | **Open** | Quality standard requires a released simulation walkthrough; inspect workshop stages/controls/text equivalent too. No real screen reader was used by this agent |
| Real newcomer teach-back | **Open** | Learning standard requires someone new to explain without reading. No human observation has been supplied |
| Prerequisite release review | **Open** | Request Flow, Capacity and Cache release rows remain in progress in ROADMAP; resolve their named manual gates before publishing this case |
| Hosted content freshness | **Open operational issue** | See INCIDENTS; passing frontend CI/deployment is not proof the content-bearing backend is current |
| Catalog publication / real discovery and search | **Not applied** | After gates pass, change the canonical status and test actual Java-backed home/search; current mock discovery tests do not prove publication |

## Human review: short, concrete procedure

Record reviewer/date, app commit/content version, browser/OS and assistive technology (where applicable), observed result, defects and their resolution. Do not substitute an agent-generated answer or an accessibility-tree snapshot for a human/screen-reader test.

1. Start the current app with `./start.sh`; open `/case-studies/url-shortener`. Confirm content 1.5.0. If hosted content differs, use local review and record the difference.
2. Ask someone new to design a stable short link, then reveal Requirements. Have them explain the problem in 30–60 seconds after hiding the reference. Record their explanation and confusing terms.
3. Use Estimates and the real Calculator. Change only peak factor from 5 to 10; ask which rates and daily totals change and why. Ask why mean concurrency is not worker capacity.
4. Have them trace create, lost-response replay and an expiry read. Ask whether a handler clock five seconds slow permits a redirect, and whether an approval before expiry can finish afterward.
5. Ask why a 95% mapping-hit ratio still leaves primary eligibility reads, and what happens during a primary outage. Ask for one alternative and its changed guarantee.
6. Have them revise one answer, self-check it, reload, download/import a backup, and explain one decision to a teammate in their own words. Revise content if they can only repeat labels.
7. With a real screen reader, navigate a released Request Flow experiment and the workshop using keyboard only: headings, stage buttons/current stage, answer labels, reveal focus, rubric radios, walkthrough selection/decision status, full text equivalent and storage errors. Record actual announced output/problems. Existing mobile/theme/native-zoom coverage does not replace this.
8. Record the prerequisite release-review results. Only then prepare the canonical publication change and actual home/search journeys; keep unrelated first-release progress work separate.
