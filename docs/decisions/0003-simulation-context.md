# 0003: Simulation context and deterministic runner engine

Status: accepted — 2026-09-26

## Context

The initial simulation models directly implemented virtual clock advancement and ad-hoc event limits without a shared execution envelope. To support multi-node failure scheduling (P1-01/P1-02) and upcoming simulations (cache-aside, rate-limiting, replication), the engine requires:
- Cooperative byte-budget tracking to prevent unbounded JSON trace memory usage.
- Cooperative wall-time deadlines to safeguard against infinite loops or runaway execution.
- Seeded pseudo-randomness with isolated workload and failure seeds.
- A standardized, validated failure schedule contract with configurable in-flight behavior (`FAIL` vs `COMPLETE`).

## Decision

Introduce a shared simulation engine package (`com.hld.simulation.engine`):
1. **`SimulationContext`**: Plain Java runner context providing virtual time tracking, event emission, budget enforcement, and seeded PRNGs. It is request-isolated and has no Spring dependencies.
2. **`SimulationBudget`**: Explicit immutable bounds for max events, max virtual time, max estimated trace bytes, and wall-time execution deadlines.
3. **`EventEmitter`**: Fast, bounded event collector that conservatively estimates trace payload sizes and enforces event/byte ceilings.
4. **`SeededRandom`**: Deterministic PRNG wrapper supporting separate workload and failure seeds so learners can vary failure points across identical workload arrival sequences.
5. **`FailureSchedule` & `FailureScheduleEntry`**: Validated entity failure timings with non-overlapping constraints and in-flight request handling.

The OpenAPI contract is updated to version `1.1.0` for request flow, introducing optional failure schedules, `FAILED` outcome status, failure event kinds (`request.failed`, `node.failed`, `node.recovered`), and truncation reasons (`trace_size_limit`, `wall_time_limit`).

## Alternatives considered

- *Spring-managed runner service*: Rejected because simulations must run with request-isolated state without cross-request side effects or Spring test overhead.
- *Full JSON serialization per event for byte budgeting*: Rejected due to high runtime overhead; conservative structural field-size estimation enforces memory limits with minimal performance impact.
- *Single shared PRNG seed*: Rejected because decoupling workload arrivals from failure injection is critical for counterfactual comparisons.

## Consequences

Simulators have a standardized execution harness and budget interface. Trace truncation semantics (`event_limit`, `virtual_time_limit`, `trace_size_limit`, `wall_time_limit`) are uniform across models. Model version `1.1.0` enables scheduled entity failures, while version `1.0.0` continues to work identically for backward compatibility.

## Migration

Refactor `RequestFlowSimulator` to delegate to `SimulationContext` and handle failure schedules. Update OpenAPI schema definitions and regenerate frontend TypeScript client types.

## Verification

- 24 unit tests in `SimulationEngineTest` verifying budget exhaustion, byte estimation, PRNG determinism, and schedule validation.
- 18 unit tests in `RequestFlowSimulatorTest` verifying node failure and recovery semantics alongside the existing 6-request fixture.
- Full `./mvnw -B verify` passing all 55 tests.
- OpenAPI schema validation and generated frontend type checks via `npm run contracts:check`.
