# Work item: HLD-11D — Initial reading load and bounded process memory

## Objective

Keep reading accessible before a learner runs an experiment, and establish aggregate process
memory evidence beyond per-response limits. This supports a reliable understand → experiment
learning loop without changing the product or claiming production capacity.

## Preconditions

- Fresh `chore/lesson-loading-memory-evidence` branch from main `bd50725` / PR #60.
- Inspect README, roadmap, project/architecture/quality/learning specifications and existing
  performance/runtime harnesses. Preserve the owner's unrelated `output/` assets.
- Use the existing real production build and packaged Java. Finish builds before timing and
  never replace the jar or `dist` while a browser suite is live.

## Scope

1. Measure actual Study reading for the four published modules and direct draft workshop
   Requirements at 1440 and 320 CSS pixels, light theme and reduced motion.
2. Distinguish fresh browser-context/cache observations from repeated document navigations
   in a primed context. The backend is already warm; browser-cold does not mean cold Java.
3. Record complete resource/chunk sizes, Java-derived semantic readiness and two animation
   frames. Confirm reading triggers no simulation/estimator POST. Keep the existing simulation
   performance suite separate and unchanged in scope.
4. Start one owned Java process from a copied jar and empty directory, with an explicit
   laboratory `-Xms32m -Xmx128m` heap policy and default HTTP resource limits.
5. Use the existing Java evidence fixture factory/report as the input source. Check its application
   and measurement-source hashes. Reconcile successful real-HTTP responses against complete
   canonical reference digests and meaningful metric/count/version/byte expectations.
6. Run twenty bounded rounds: two client simulation requests and one lesson GET per batch,
   across four maximum-count/payload fixtures. Record every admission response and any bounded
   explicit retry. Client concurrency does not establish overlapping server admission.
7. Sample owned-process Linux RSS/high-water/thread counters and bounded JVM heap diagnostics;
   preserve timing/provenance, distinguish snapshots from heap peaks, and verify cleanup.
8. Reject an oversized body and verify recovery. Add actual CLI failure checks for a healthy
   process with incorrect expected results and an unrelated occupied listening port.
9. Preserve partial reports on failure; CI uploads reports, with measured local evidence and
   explicit remaining hosted/network/human gates in the release documents.

## Acceptance and evidence

| Check | Result/evidence |
| --- | --- |
| Bounded memory exercise, twenty rounds | PASS: 160 batch simulations, 80 batch lesson reads; four references, 413 probe and recovery make 246 fixture/batch/negative/recovery checks; startup health polling excluded. `/tmp/hld-memory-evidence-local-final.log` |
| Semantic values, full canonical replay, response bounds | PASS for flow completions, cold/escaped cache origin reads and hits, shared limiter allowed/rejected results; source and executed-jar hashes recorded |
| Actual negative CLI checks | PASS: two tests; wrong expected event count produces an incomplete report with verified process/port cleanup; occupied listener remains owned. `/tmp/hld-memory-evidence-failure-tests-final.log` |
| Backend review | PASS: timing ends before parsing; full JSON digests; drained batch responses before visible bounded retries; partial samples and actual cleanup preserved |
| Production reading suite | PASS: twenty groups, sixty measured visits/ten priming visits in 55.9 seconds; zero POSTs, actual lesson headings and draft controls verified; `/tmp/hld-11d-lesson-loading.log` |
| Frontend full contract/type/lint/format/unit/build gate | PASS: 26 malformed-content fixtures, 273 unit tests, actual production build |
| Plan/diff checks and final-head CI | Local PASS: 80 docs/407 links/59 curriculum IDs/5 catalog identities; record final-head CI proof in focused PR before squash |

The first negative CLI check exposed a harness reporting gap: failure before the first reference
checkpoint omitted process identity. The final harness persists identity before diagnostics and
writes final samples/actual cleanup from its context, so failure evidence remains useful.
Backend review also corrected a body-timing boundary, full JSON canonicalization and admission
retry ordering before final measurements. No application behavior changed.

## Handoff and limits

P2-05 remains **in-progress**. A small explicit heap and successful bounded local requests do
not establish total-process limits, sustained throughput, leak freedom, slow-client protection,
real-mobile speed or hosted capacity. Human screen-reader/newcomer reviews and hosted backend
freshness remain open. Next work follows these remaining release gates and the prerequisite
order before publishing dependent curriculum.
