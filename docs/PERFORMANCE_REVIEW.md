# Performance evidence for the first release

Measured 2026-10-10 on the existing application from main `b1147c2`, with the HLD-11C
measurement harness in the working tree. This establishes a reproducible local baseline;
it does not close every performance or publication gate.

## Reproduce

Finish builds before starting browser servers. Do not run another build or benchmark alongside
the timing suite; unrelated host load is not controlled by these commands.

```bash
(cd backend && ./mvnw -B verify)
(cd backend && ./mvnw -B -Dtest=SimulationPerformanceEvidenceTest -Dhld.performance=true test)
(cd frontend && npm run perf:browser)
```

The Java report is `backend/target/performance-evidence.json`; the browser report is
`frontend/target/browser-performance-evidence.json`. These generated files are ignored by Git
and frontend formatting. CI explicitly executes both suites and uploads complete reports for
30 days. Set `-Dhld.performance.revision=<commit>` for Java and `HLD_PERFORMANCE_REVISION`
for the browser when recording a particular revision. The browser also records the actual
checkout head/dirty state and named source/jar hashes; Java records application/measurement
source hashes. Hashes identify the inspected sources, not a deployed Render commit.

Archived [Java samples](evidence/performance-2026-10-10/java.json) and
[browser samples](evidence/performance-2026-10-10/browser.json) preserve every timing and
summary. To avoid repeating large generated inputs, these archives replace inputs with a
documented canonical-JSON digest; the fixture factories and CI reports contain the inputs.
Each archive also records the complete raw report's hash. Warmups remain distinguishable.

## Environment and method

- Linux/WSL kernel `6.18.40.1-microsoft-standard-WSL2`, Intel i5-1135G7, four visible logical
  CPUs, approximately 7.27 GB host memory. This is a development machine, not mobile hardware.
- Java evidence: OpenJDK 17.0.20.1; one untimed semantic reference run, three explicit warmups,
  then ten sequential samples per fixture. Final measurements ran after the frontend gate
  finished, without another owned build/browser timing suite in parallel. Host idleness is
  not established. JVM maximum heap in the report is configuration, not observed memory use.
- Browser evidence: Node 22.22.2 and Chromium 153.0.8010.12, production Vite build, real Java,
  one worker, light theme and reduced motion, 1440×900 and 320×900 CSS pixels. Twenty groups:
  one warmup plus three measured runs each; 80 total runs, 60 included in summaries.
- Java generation is the simulator/calculator call; serialization is the configured Jackson
  mapper call. Input parsing, annotation validation, controller buffer overhead, HTTP, startup,
  browser work and assertions are outside those intervals. This is not a JMH benchmark.
- Local proxy HTTP time is browser resource start → response/body completion. It includes
  network/proxy/server work; request/header fields are omitted from summaries when unavailable.
- Browser rendering time is resource response end → a native observer finding semantic DOM
  readiness, then two animation-frame callbacks. It includes scheduling/style/layout and does
  not confirm physical paint or isolate React CPU. CDP task/script/layout/style deltas are
  recorded separately in seconds, with layout/style counts.
- Event-selection elapsed time also includes Playwright IPC, actionability and assertion
  polling. It is an upper observation bound. Do not infer native click latency or an app
  regression from that elapsed value alone.

## Java observations

Medians in milliseconds; complete ranges and all ten samples are in the archive. Input and
response bytes are actual UTF-8 JSON sizes, not compressed network transfer sizes.

| Fixture | Generation | Serialization | Response bytes | Events / outcomes |
| --- | ---: | ---: | ---: | ---: |
| Flow: one request | 0.114 | 0.177 | 1,536 | 4 / 1 |
| Flow: 100 requests, eight nodes | 1.826 | 0.630 | 92,178 | 492 / 100 |
| Flow: virtual-time boundary | 1.447 | 0.436 | 47,521 | 300 / 0 |
| Cache: one cold GET | 0.034 | 0.068 | 2,058 | 3 / 1 |
| Cache: 100 cold GETs | 0.503 | 0.720 | 87,852 | 300 / 100 |
| Cache: 100 maximum-length ASCII UPDATEs | 0.238 | 0.226 | 78,481 | 100 / 0 |
| Cache: 50 escaped UPDATE/GET pairs | 0.525 | 2.575 | 835,283 | 200 / 50 |
| Limiter: one request | 0.023 | 0.029 | 1,145 | 2 / 1 |
| Limiter: 500 requests, 20 nodes | 1.261 | 0.999 | 253,447 | 1,000 / 500 |
| Capacity: baseline | 0.011 | 0.347 | 3,610 | No trace |
| Capacity: all maximum scalars | 0.006 | 0.094 | 3,651 | No trace |

The virtual-time fixture returns `limited`, `virtual_time_limit`, and no completed outcomes;
it is not presented as a complete run. The largest tested response is 835,283 bytes with a
119,882-byte request. These are maximum-count/payload examples, not exhaustive worst cases.
Escaped strings are a Java serialization fixture; they are not submitted through the UI's
line-based cache editor.

## Production-browser observations

Each cell is a median of three measured samples, in milliseconds. These are two distinct
intervals; adding them to Java medians would combine unmatched runs and double-count work.

| Workload | Desktop local HTTP | Desktop response → ready + frames | 320px local HTTP | 320px response → ready + frames |
| --- | ---: | ---: | ---: | ---: |
| Flow: one request | 14.1 | 36.9 | 9.2 | 39.2 |
| Flow: 100 requests, eight nodes | 17.0 | 62.1 | 14.2 | 125.4 |
| Cache: one GET | 8.7 | 32.6 | 6.2 | 34.8 |
| Cache: 100 cold GETs | 14.2 | 84.7 | 7.6 | 75.8 |
| Cache: 50 maximum-length UPDATE/GET pairs | 11.9 | 77.0 | 10.1 | 117.9 |
| Cache: 100 maximum-length UPDATEs | 9.7 | 46.1 | 8.5 | 64.1 |
| Limiter: one request | 7.8 | 39.0 | 5.3 | 34.3 |
| Limiter: 500 requests, 20 nodes | 11.3 | 65.6 | 18.0 | 121.1 |
| Capacity: baseline | 7.2 | 35.8 | 6.6 | 33.1 |
| Capacity: maximum scalars | 7.3 | 40.3 | 6.4 | 33.8 |

The checks verified complete row counts and metric/event values against each Java response:
492 flow events/100 outcomes, 300 cache events/100 outcomes, 101 keys in the largest cache
state, 500 limiter decisions, and nine calculator steps. Limiter diagnostic events are not
an event table in the current UI. Forward/backward selection checks reconcile the inspector,
cursor and cache key state with the authoritative trace. No outcomes are mocked or omitted
to make this suite faster.

The 320px maximum limiter group spans 79.4–244.5 ms for response-end → ready plus
frames, despite a 121.1 ms median. All individual samples remain in the archive; three
measurements do not establish a stable tail-latency bound.

## Budgets and next decision

Existing input/event/response/admission limits remain the enforceable runtime budgets. This
suite also enforces replay, semantic/count agreement and complete report sampling. It does
not introduce a machine-independent millisecond threshold from three or ten samples.

The large flow/limiter and dense cache cases show higher browser work than tiny cases. In the
large desktop flow case, recorded median script/layout deltas are 22.2/23.8 ms; at 320px they
are 27.1/38.9 ms. These counters include the documented run-action interval. Together with
the complete row counts, they justify inspecting eager table rendering and seek work before
raising input limits or adding larger learning traces. They do not establish an interview
simulator's throughput or a production service's latency objective.

Current bundle observations remain in [RELEASE_REVIEW.md](RELEASE_REVIEW.md). Initial lesson
load/render, heap/load/network sizing, representative hosted measurements, and controlled
before/after evidence for any rendering optimization remain open. Any pagination/virtualization
change must keep every event accessible, label visible ranges, preserve full Java metrics,
and update semantic verification deliberately. Human screen-reader/newcomer reviews and the
[hosted backend incident](INCIDENTS.md) also remain open. P2-05 is still in progress.
