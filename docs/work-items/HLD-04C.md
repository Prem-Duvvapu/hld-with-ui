# HLD-04C: serialized trace bounds and concurrent HTTP isolation

## Objective

Trust that structured cache state remains inside its declared events budget and that simultaneous learners cannot change one another's modeled results.

## Preconditions

- Fresh `test/release-trace-bounds-isolation` from `cb5c5c2` (PR #46). Its CI passed 130 Java, 174 frontend and 93 browser journeys plus launcher smoke.
- HLD-04/first-release acceptance requires actual serialization and simultaneous HTTP isolation; earlier arithmetic/repeated-run tests did not establish these checks.
- Architecture, simulation, quality and release docs inspected. Preserve owner `output/` artifacts. No UI, model semantics, contracts or dependencies change.

## Scope and acceptance

1. Serialize with the real Spring application mapper, including structured cache snapshots, UTF-8 and JSON escaping, at maximum valid operation/key/value lengths.
2. Actual events-array bytes stay within four declared byte budgets; limited runs retain honest incomplete counts and no fabricated outcomes.
3. A two-byte budget emits only `[]`; the response still contains initial state/assumptions/metrics, proving which bytes the budget excludes.
4. Two concurrent copies of 13 differing/invalid HTTP calls match their sequential results, then subsequent calls remain unchanged. Use shared Spring simulator beans and a real random-port server, with bounded HTTP/future deadlines and no sleeps.
5. State limits honestly: error timestamps are observation metadata excluded from comparison; model outputs are compared completely. Isolation is not aggregate admission or throughput evidence.

## Measured serialization fixture

Environment: 2026-10-09, Linux x86-64 WSL2 kernel 6.18.40.1, OpenJDK 17.0.20.1, application JSON mapper configured to omit null properties. Input: 100 operations (50 UPDATE/50 GET), 64 UTF-16-code-unit keys and 256-unit values containing CJK, emoji, newline, a control character, quotes and backslashes; zero lookup/origin latency and TTL 60,000 ms. This is one maximum-count/key/value fixture, not a proof of the largest possible response among all accepted inputs.

| Declared events budget (bytes) | Emitted events | Actual events JSON bytes | Actual response JSON bytes | Status |
| ---: | ---: | ---: | ---: | --- |
| 512 | 0 | 2 | 2,005 | limited |
| 4,096 | 1 | 1,768 | 3,771 | limited |
| 32,768 | 6 | 12,231 | 16,229 | limited |
| 2,097,152 | 102 | 256,577 | 308,545 | completed |

The full response includes fields outside the event-array budget. Conservative estimates can stop earlier than exact JSON size. Initial state/outcomes remain bounded by model inputs, but there is no independent total-response or request-body byte ceiling or aggregate concurrent-run admission limiter. Documented versions and replay semantics are unchanged.

## Verification evidence

| Check actually run | Result | Reproduction |
| --- | --- | --- |
| Focused Java | Passed: 3 tests | `./mvnw -B -Dtest=CacheTraceSerializationTest,ConcurrentSimulationHttpTest test`; configured serialization, explicit empty trace and 26 simultaneous real HTTP calls followed by repeat checks |
| Full Java / plan / whitespace | Passed: 133 Java tests | `./mvnw -B verify`; plan validates 56 docs, 239 local links, 59 curriculum IDs and five catalog identities; whitespace check passed |
| UI / manual learning/accessibility | No new UI; existing gates remain open | Prior PR #46 browser evidence is historical; this slice does not claim a new screen-reader, zoom or teach-back check |

## Handoff

HLD-09C technical publication review remains next. Ten stages are authored, but prerequisite/manual learning/accessibility gates and hosted-backend freshness remain open. Independent request/response ceilings and aggregate admission need a separately justified implementation if those broader safeguards are required; isolation tests must not be described as load testing.
