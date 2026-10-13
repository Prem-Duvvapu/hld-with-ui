# Work item: HLD-15A — choose keys from queries and protect write rules

## Objective

Let a learner predict the work needed for a query, inspect exact Java evidence, change
index order or the query, and distinguish efficient access from a business invariant.
Provide an original storage-family choice explanation that prepares later transaction work.

## Preconditions

- Fresh `feat/data-access-workbench` from `dc75e17` (PR #68), clean implementation worktree.
  Owner `output/` preserved; owner main updated by fast-forward.
- PR #68 final head `e90e254` passed CI `38442615491`, tested merge `90011ae`: 331 Java
  cases executed plus one opt-in skip, 407 frontend units, 186 browser journeys, 20 UI
  performance and 20 reading-load groups, packaged jar/container, memory and launcher gates.
- Canonical prerequisite `capacity-estimation` is implemented/published. Development follows
  decision 0022; first-release human/hosted gates and publication remain separate.
- Project, architecture, simulation, content and learning/quality standards reviewed. LLD’s
  shared module/operations pattern remains the primary product reference.

## Scope

Pure Java analysis, strict HTTP descriptor/run delivery, canonical input/result schemas and
generated validation/types, actual baseline examples, direct draft Playground/Study/Practice,
seven scenarios, editable dataset/operations, independent work counters, original lesson/eight
questions and exact saved Practice resume. No new service/dependency or published entry.
Guided, authored Architecture/sequence views and full technical core completion remain pending.

## Design

[Decision 0029](../decisions/0029-finite-data-access-analysis.md) records the finite untimed
model. Twelve records cover alpha/beta/gamma at ordering values 10/20/30/40. Tenant beta,
inclusive range 20–30, returns `b2,b3` in every access design: table scan examines twelve
base records; tenant-first examines two entries and fetches two records; creation-first
examines six entries and fetches two after index-level filtering. Query limits apply after
full modeled candidate work. Creation order is an ordering key, not milliseconds.

An all-tenant query changes which prefix is useful. Inserts show primary IDs and optional
tenant/business-key uniqueness as different rules. Rejected inserts make zero committed
changes; accepted inserts append one base record and maintain configured logical entries.
No physical write amplification, production latency or concurrent guarantee is inferred.

Java captures immutable inputs and returns outcomes/final records/totals. React selects
those outcomes without running a second analyzer. Canonical lazy runtime validation checks
closed shapes, request correlation, known IDs, declared paths, limits and invariant consistency.
Edited inputs label previous results; pending operations lock controls; errors retain inputs,
prediction and previous evidence. Shared Study/Practice and local answer storage remain in use.

## Acceptance

- Exact baseline/contrasts, all four variants, empty/no-match/tie/boundary/limit cases, insertion
  visibility, conflict precedence, state isolation and defensive copies pass Java tests.
- Strict real HTTP rejects unknown/missing/null/mixed/coerced fields, duplicate/trailing roots
  and invalid versions; body/response/admission limits apply and release permits after failures.
- Canonical generation has no drift; actual Java artifacts satisfy closed schemas; no draft
  leaks into published discovery/search/learning-path destinations.
- UI sends meaningful edits, keeps submitted evidence, distinguishes failures and empty results,
  respects pending/unmount behavior and supports exact saved-question resume without a run.
- Real Java browser flows reconcile all seven presets, changed query/limit/empty data, invalid
  fields, API failure/mismatched-response retry, keyboard, reduced motion, three widths/both themes.
- Packaged baseline mapping runs the actual new model and rejects missing evidence.

## Verification evidence

| Check actually run                      | Result                                                                                                                   | Evidence                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Focused Java authoring run              | 34/35 passed; one stale API wrapper assertion failed and was corrected                                                   | `/tmp/hld-data-access-authoring.log`; actual baseline artifacts generated |
| Full Java verify without authoring flag | PASS: 367 discovered, 366 executed, one existing opt-in skip; 35 new methods                                             | `/tmp/hld-data-access-java-verify.log`                                    |
| Contracts/content validation            | PASS: 142 cases; eight catalog entries, 43 questions, 24 checkpoints, ten stages                                         | Actual Node gate                                                          |
| Packaged-smoke Python regressions       | PASS: eight cases, including missing mapping/stale baseline evidence                                                     | `/tmp/hld-data-access-smoke-unit.log`                                     |
| Frontend gate                           | PASS: typecheck, lint, format, 478 units in 55 files, production build                                                   | `/tmp/hld-data-access-{typecheck,lint,format,frontend-tests,build}.log`   |
| Real Java browser/UI evidence           | PASS: seven journeys; all seven scenarios, edits/empty/error/mismatch/retry/resume/keyboard and three widths/both themes | `/tmp/hld-data-access-browser.log`; retained captures below               |
| Copied jar and final-head CI            | Copied jar PASS; required final-head CI pending before squash                                                            | `/tmp/hld-data-access-packaged.log`; PR records exact checkout/results    |

The full drift check also passed all 142 contract cases after staging the final generated
formatting. The first frontend run found a compatibility test fixture sharing the inserted
row object with its captured input; separate evidence copies fixed that fixture and the
final 478-unit gate passed. Runtime guards now bind declared index paths, lookup identities,
limits and uniqueness/conflict rules to captured input without evaluating Java queries.

The production data-access page chunk is 22.59 kB raw / 7.43 kB gzip; its lazy compatibility
chunk is 14.78 / 3.47 kB, with a shared Ajv compiler chunk 135.15 / 41.65 kB. These are
build artifacts, not measured page-load or production capacity evidence.

The maximal-identifier/full-scan serialization fixture is 4,466 input bytes and 36,308 response
bytes, below the configured defaults. This is an executed fixture, not a proof of a global
maximum across every allowed workload or a production resource measurement.

## UI evidence

The seven real Java browser journeys cover all three tabs at 320/768/1440 in both themes,
with keyboard focus and reduced motion. Representative actual captures are retained:

- Playground: [desktop light](assets/hld-15a/data-access-playground-1440-light.png), [mobile dark](assets/hld-15a/data-access-playground-320-dark.png).
- Study: [desktop light](assets/hld-15a/data-access-study-1440-light.png), [mobile dark](assets/hld-15a/data-access-study-320-dark.png).
- Practice: [desktop light](assets/hld-15a/data-access-practice-1440-light.png), [mobile dark](assets/hld-15a/data-access-practice-320-dark.png).

The layout checks were repeated after resetting capture scroll position; both passed and
the retained images were visually reviewed. Editable operation IDs use independent stable
UI keys so edits retain focus; removing an operation returns focus to Add operation.

Local `/tmp` logs are transient. The focused PR retains final-head CI and artifact evidence.
Automated checks and screenshot inspection do not replace human screen-reader/newcomer
review, physical mobile device testing, native zoom or hosted backend verification.

## Handoff

Keep this topic draft and outside published discovery. Complete Guided and authored
Architecture/sequence teaching plus its technical review before declaring the prerequisite
core complete or starting dependent transactions/idempotency. Human newcomer/screen-reader,
native zoom and hosted freshness remain unperformed for this new module. Broader requirements,
edge/API/scaling/storage-engine topics and the requested case-study dependency graph remain open.
