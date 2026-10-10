# Reading-load and process-memory evidence

HLD-11D extends the [simulation performance baseline](PERFORMANCE_REVIEW.md) with real
initial reading and aggregate Java process observations. Measurements use main `bd50725`
plus the measurement harness in the working tree. This does not publish the draft workshop
or close all first-release gates.

## Reproduce

Finish builds first, then run measurement suites sequentially on Linux/WSL with a JDK:

```bash
(cd backend && ./mvnw -B verify)
(cd backend && ./mvnw -B -Dtest=SimulationPerformanceEvidenceTest -Dhld.performance=true test)
python3 scripts/runtime-memory-evidence.py
python3 -m unittest discover -s scripts -p 'test_runtime_memory_evidence.py' -v
(cd frontend && npm run perf:lessons)
```

The memory fixture inputs come from the existing opt-in Java report, whose application and
fixture-factory hashes must match the checkout. Output is ignored
`backend/target/runtime-memory-evidence.json`; use `--output`, `--revision`, `--port` (default
18680) and `--rounds` (1–50, default twenty) to record an explicit run. The harness requires
Linux `/proc` and JDK `jcmd`, refuses an occupied listener and stops only its owned process.

Reading output is ignored `frontend/target/lesson-loading-evidence.json`. CI runs both suites
explicitly and uploads complete or partial reports for 30 days. A failing command exits
nonzero; a partial report is never a passing gate. Archived [reading samples](evidence/performance-2026-10-10/lesson-loading.json) and
[memory samples](evidence/performance-2026-10-10/runtime-memory.json) retain every raw
observation plus full-report hashes and source/jar provenance.

## Process-memory method

- Copy only the executable jar into an empty temporary directory. Verify the copied hash
  against the recorded jar, scrub inherited app/JVM overrides and start Java with explicit
  `-Xms32m -Xmx128m`. This is a laboratory heap budget, not a production recommendation.
- Four fixtures: 100 flow requests/eight nodes; 100 cold cache GETs; 50 escaped UPDATE/GET
  pairs with maximum keys/values; 500 shared fixed-window limiter requests/twenty nodes.
- Check sequential references against Java fixture status, version, counts, meaningful metrics
  and actual response bytes. Compare each successful batch result's complete canonical JSON
  digest with its reference. No outcomes are manufactured or discarded.
- Twenty rounds launch two client simulation requests plus one lesson read per fixture batch.
  A barrier coordinates clients; it does not prove simultaneous server admission. Every status
  remains recorded. A 503 must be structured `simulation_busy` with `Retry-After: 1`; any
  explicit laboratory retry respects that delay and is separately recorded, at most three times.
- A sampler reads owned-process `/proc/<pid>/status` approximately every 20 ms, with PID start
  identity checks. RSS includes resident native/process memory; high-water includes startup.
  These counters are approximate because Linux maintains RSS accounting asynchronously.
  See [Linux kernel proc documentation](https://www.kernel.org/doc/html/latest/filesystems/proc.html).
- `jcmd GC.heap_info` snapshots are taken at readiness, after references, after each five rounds
  and after the exercise; `VM.flags` records the actual VM configuration. Diagnostics perturb
  the exercise and are not peak used-heap measurements. No forced GC or heap dump is taken.
  See [Java 17 jcmd documentation](https://docs.oracle.com/en/java/javase/17/docs/specs/man/jcmd.html).
- Request elapsed time ends after reading the complete body, before JSON parsing/digest/assertion
  work. This includes local direct HTTP, server processing and transfer; it does not isolate model
  CPU or establish steady throughput. Reports preserve every observed duration.
- The 413 probe is a 262,145-byte whitespace body. It must return the closed structured error,
  then the same flow fixture must succeed and match its full reference. Cleanup is verified before
  a report becomes complete. Negative CLI checks deliberately supply wrong expected events and
  an occupied listener; both must preserve incomplete evidence and protect process ownership.

## Local memory observations

The final reviewed local run used OpenJDK 17.0.20.1 on Linux/WSL, four visible CPUs. All 240
batch responses returned 200: 160 simulations and 80 canonical lesson reads. There were no 503s
or retries in this run. Four reference requests plus the oversized-body/recovery checks make
246 fixture/batch/negative/recovery checks; readiness health polls are separate.

| Observation | Value |
| --- | ---: |
| Heap maximum passed to Java | 128 MiB |
| Maximum sampled RSS | 235.2 MiB |
| Lifetime reported RSS high-water | 235.2 MiB |
| Maximum sampled threads | 40 |
| Process samples | 121 |
| Ready reported used heap | 23.3 MiB |
| Largest diagnostic reported used heap | 67.5 MiB |
| After exercise reported used heap | 67.5 MiB |

RSS exceeding the heap cap demonstrates why heap and total-process budgets need separate
measurements. The largest heap diagnostic is merely the largest of these snapshots; it is not
the run's heap peak. Successful bounded replay and collection do not prove absence of leaks.
Native memory, unobserved peaks, slow connections, arbitrary request combinations and hosted
limits remain outside this exercise. Default two-run admission does not bound all GET/estimator
requests or server threads. The existing container smoke's 512 MiB/one-CPU limits are test
constraints and remain separate evidence.

## Initial reading observations

The final suite passed twenty groups in 55.9 seconds: sixty measured document visits plus
ten excluded warm-context priming visits. The production Vite frontend and real Java used
Node 22.22.2/Chromium 153.0.8010.12 on the same Linux/WSL development machine. Each group
contains three observations; complete ranges and resources are archived in
[lesson-loading.json](evidence/performance-2026-10-10/lesson-loading.json).

Fresh contexts have no previous cache/storage, while the browser process, OS and Java are warm.
Warm groups reuse one primed context and navigate through `about:blank` before each document
visit; these are not SPA/tab-switch measurements. Neither mode disables caching or guesses
cache hits. Light theme and reduced motion are explicit; 320px is a viewport, not mobile hardware.

A native document observer waits for actual topic/workshop and descriptor GET completion,
module title/version/outcome count and the complete authored lesson heading list or draft stage
controls/prompt. Two animation frames follow that timestamp. Navigation intervals include
JavaScript loading/execution, HTTP, scheduling, styles and layout; they do not establish physical
paint, font readiness or pure React CPU. Actual browser content responses equal a real Java
preflight; rendered lessons reconcile 14/13/23/20 headings, and the draft exposes its ten
stage controls plus Requirements prompt, original-answer field and enabled reference reveal.
No simulation/estimator POST occurred through those assertions; no notes/progress were changed.

Medians below are milliseconds from document navigation start to semantic readiness plus
two frames. JavaScript bytes are ResourceTiming entries completed by that observation; scripts
finishing later are outside this boundary. Transfer includes HTTP overhead, while decoded bytes
are the resource body footprint. These values are not interchangeable gzip estimates.

| Reading route | Width | Fresh-context ready + frames | Warm-context ready + frames | Fresh JS transfer bytes | Fresh JS decoded bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Request flow | 1440 | 483.8 | 387.2 | 143,439 | 451,710 |
| Request flow | 320 | 456.1 | 362.4 | 143,439 | 451,710 |
| Capacity | 1440 | 494.3 | 381.6 | 142,010 | 445,548 |
| Capacity | 320 | 440.9 | 359.8 | 142,010 | 445,548 |
| Cache-aside | 1440 | 506.9 | 406.0 | 147,367 | 465,767 |
| Cache-aside | 320 | 465.2 | 359.2 | 147,367 | 465,767 |
| Rate limiter | 1440 | 507.1 | 375.0 | 142,520 | 449,202 |
| Rate limiter | 320 | 461.9 | 361.7 | 142,520 | 449,202 |
| Draft Requirements | 1440 | 511.7 | 381.0 | 139,754 | 440,358 |
| Draft Requirements | 320 | 466.9 | 358.2 | 139,754 | 440,358 |

Fresh-context group medians span 440.9–511.7 ms; measured samples span 438.5–612.0 ms.
Warm medians span 358.2–406.0 ms, with measured samples 347.4–561.9 ms. Three observations
are descriptive and do not establish a stable percentile or universal time budget.

Warm JavaScript resources reported transfer totals of 900 or 1,200 bytes and zero
encoded/decoded body sizes. These are actual browser cache/revalidation accounting values,
not a zero JavaScript footprint; raw resource/chunk names and totals remain available. The
separate existing bundle evidence and fresh-context decoded resources describe body sizes.

The baseline supports future changes with measured before/after comparisons. No loading
optimization, universal millisecond threshold or visual redesign is claimed in this contribution.


## Remaining release work

Use these observations when evaluating deployment resource budgets; do not turn one short
local exercise into a production sizing claim. Hosted backend recovery/freshness, slow-client
and networking/thread policies, representative hosted load, human accessibility and newcomer
teach-back remain open. P2-05 stays in progress; later module publication follows the roadmap's
prerequisite/release gates.
