package com.hld.cache;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HashMap;
import java.util.Map;
import com.hld.simulation.engine.SimulationBudget;
import java.util.List;
import org.junit.jupiter.api.Test;

class CacheAsideSimulatorTest {
    private final CacheAsideSimulator simulator = new CacheAsideSimulator();

    // ── Fixture from RELEASE_ONE_BLUEPRINT §4 ──

    @Test
    void baselineFixtureMatchesHandCalculatedOutcomes() {
        CacheAsideResult result = simulator.run(CacheAsideInput.create(2, 20, 100, "v1",
                List.of(
                        new CacheOperation("GET", "k", null, 0),
                        new CacheOperation("GET", "k", null, 30),
                        new CacheOperation("UPDATE", "k", "v2", 40),
                        new CacheOperation("GET", "k", null, 70),
                        new CacheOperation("GET", "k", null, 120)),
                7));

        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.outcomes()).hasSize(4); // 4 GETs

        // GET k at 0: miss, origin returns v1 at 22, fill expires at 122
        CacheGetOutcome o0 = result.outcomes().get(0);
        assertThat(o0.hitOrMiss()).isEqualTo("MISS");
        assertThat(o0.returnedValue()).isEqualTo("v1");
        assertThat(o0.latencyMs()).isEqualTo(22);
        assertThat(o0.stale()).isFalse();

        // GET k at 30: cache hit at 32
        CacheGetOutcome o1 = result.outcomes().get(1);
        assertThat(o1.hitOrMiss()).isEqualTo("HIT");
        assertThat(o1.returnedValue()).isEqualTo("v1");
        assertThat(o1.latencyMs()).isEqualTo(2);
        assertThat(o1.stale()).isFalse();

        // GET k at 70: cache hit at 72 (stale: origin has v2)
        CacheGetOutcome o2 = result.outcomes().get(2);
        assertThat(o2.hitOrMiss()).isEqualTo("HIT");
        assertThat(o2.returnedValue()).isEqualTo("v1");
        assertThat(o2.latencyMs()).isEqualTo(2);
        assertThat(o2.stale()).isTrue();

        // GET k at 120: lookup at 122, expired (entry.expiresAt == 122),
        // origin returns v2 at 142
        CacheGetOutcome o3 = result.outcomes().get(3);
        assertThat(o3.hitOrMiss()).isEqualTo("MISS");
        assertThat(o3.returnedValue()).isEqualTo("v2");
        assertThat(o3.latencyMs()).isEqualTo(22);
        assertThat(o3.stale()).isFalse();
    }

    @Test
    void baselineFixtureMetricsMatch() {
        CacheAsideResult result = simulator.run(CacheAsideInput.create(2, 20, 100, "v1",
                List.of(
                        new CacheOperation("GET", "k", null, 0),
                        new CacheOperation("GET", "k", null, 30),
                        new CacheOperation("UPDATE", "k", "v2", 40),
                        new CacheOperation("GET", "k", null, 70),
                        new CacheOperation("GET", "k", null, 120)),
                7));

        CacheAsideMetrics m = result.metrics();
        assertThat(m.totalGets()).isEqualTo(4);
        assertThat(m.cacheHits()).isEqualTo(2);
        assertThat(m.cacheMisses()).isEqualTo(2);
        assertThat(m.staleReads()).isEqualTo(1);
        assertThat(m.originReads()).isEqualTo(2);
        assertThat(m.hitRatio()).isEqualTo(0.5);
    }

    // ── TTL expiry boundary ──

    @Test
    void expiryIsCheckedAtLookupTimeNotRequestTime() {
        // TTL 100, cache fill at t=22 (after GET at t=0 with 2+20 latency).
        // Cache expires at 122.
        // GET at 119: lookup at 121 < 122 -> HIT
        // GET at 120: lookup at 122 >= 122 -> MISS (expired)
        CacheAsideResult result = simulator.run(CacheAsideInput.create(2, 20, 100, "v1",
                List.of(
                        new CacheOperation("GET", "k", null, 0),
                        new CacheOperation("GET", "k", null, 119),
                        new CacheOperation("GET", "k", null, 120)),
                7));

        assertThat(result.outcomes()).hasSize(3);
        assertThat(result.outcomes().get(1).hitOrMiss()).isEqualTo("HIT");
        assertThat(result.outcomes().get(2).hitOrMiss()).isEqualTo("MISS");
    }

    // ── Cold burst: no coalescing ──

    @Test
    void coldBurstCausesMultipleOriginReads() {
        CacheAsideResult result = simulator.run(CacheAsideInput.create(2, 20, 100, "v1",
                List.of(
                        new CacheOperation("GET", "k", null, 0),
                        new CacheOperation("GET", "k", null, 1),
                        new CacheOperation("GET", "k", null, 2)),
                7));

        assertThat(result.outcomes()).extracting(CacheGetOutcome::hitOrMiss)
                .containsExactly("MISS", "MISS", "MISS");
        assertThat(result.outcomes()).extracting(CacheGetOutcome::responseTimeMs)
                .containsExactly(22L, 23L, 24L);
        assertThat(result.metrics().originReads()).isEqualTo(3);
        assertThat(result.events()).extracting(CacheAsideTraceEvent::timeMs).isSorted();
    }

    // ── Cache unavailable ──

    @Test
    void cacheUnavailableFallsBackToOrigin() {
        CacheAsideResult result = simulator.run(
                CacheAsideInput.withAvailability(2, 20, 100, "v1",
                        List.of(
                                new CacheOperation("GET", "k", null, 0),
                                new CacheOperation("GET", "k", null, 30)),
                        false, true, 7));

        // All GETs bypass cache and go to origin
        assertThat(result.outcomes()).hasSize(2);
        assertThat(result.outcomes().get(0).hitOrMiss()).isEqualTo("BYPASS");
        assertThat(result.outcomes().get(0).returnedValue()).isEqualTo("v1");
        assertThat(result.outcomes().get(0).latencyMs()).isEqualTo(20); // origin only, no cache lookup
        assertThat(result.outcomes().get(1).hitOrMiss()).isEqualTo("BYPASS");
        assertThat(result.metrics().cacheHits()).isZero();
        assertThat(result.metrics().originReads()).isEqualTo(2);

        // Verify bypass events were emitted
        List<CacheAsideTraceEvent> bypasses = result.events().stream()
                .filter(e -> "cache.bypass".equals(e.kind()))
                .toList();
        assertThat(bypasses).hasSize(2);
    }

    // ── Origin unavailable ──

    @Test
    void originUnavailableServesFromCacheButFailsOnMiss() {
        // First GET: cache miss + origin unavailable -> fail
        CacheAsideResult result = simulator.run(
                CacheAsideInput.withAvailability(2, 20, 100, "v1",
                        List.of(
                                new CacheOperation("GET", "k", null, 0),
                                new CacheOperation("GET", "k", null, 30)),
                        true, false, 7));

        // Both are cache misses because no data was ever cached
        assertThat(result.outcomes()).hasSize(2);
        assertThat(result.outcomes().get(0).hitOrMiss()).isEqualTo("ERROR");
        assertThat(result.outcomes().get(0).returnedValue()).isNull();
        assertThat(result.outcomes().get(1).hitOrMiss()).isEqualTo("ERROR");
        assertThat(result.outcomes().get(1).returnedValue()).isNull();
        assertThat(result.metrics().originReads()).isZero();

        List<CacheAsideTraceEvent> errors = result.events().stream()
                .filter(e -> "cache.error".equals(e.kind()))
                .toList();
        assertThat(errors).hasSize(2);
    }

    // ── Both unavailable ──

    @Test
    void bothUnavailableReturnsError() {
        CacheAsideResult result = simulator.run(
                CacheAsideInput.withAvailability(2, 20, 100, "v1",
                        List.of(new CacheOperation("GET", "k", null, 0)),
                        false, false, 7));

        assertThat(result.outcomes()).hasSize(1);
        assertThat(result.outcomes().get(0).returnedValue()).isNull();
        assertThat(result.metrics().originReads()).isZero();
    }

    // ── Deterministic replay ──

    @Test
    void sameSeedProducesIdenticalTrace() {
        CacheAsideInput input = CacheAsideInput.create(2, 20, 100, "v1",
                List.of(
                        new CacheOperation("GET", "k", null, 0),
                        new CacheOperation("UPDATE", "k", "v2", 50),
                        new CacheOperation("GET", "k", null, 60)),
                42);

        CacheAsideResult r1 = simulator.run(input);
        CacheAsideResult r2 = simulator.run(input);

        assertThat(r1.events()).hasSameSizeAs(r2.events());
        for (int i = 0; i < r1.events().size(); i++) {
            assertThat(r1.events().get(i).kind()).isEqualTo(r2.events().get(i).kind());
            assertThat(r1.events().get(i).timeMs()).isEqualTo(r2.events().get(i).timeMs());
            assertThat(r1.events().get(i).message()).isEqualTo(r2.events().get(i).message());
        }
        assertThat(r1.outcomes()).isEqualTo(r2.outcomes());
        assertThat(r1.metrics()).isEqualTo(r2.metrics());
    }

    // ── Validation ──

    @Test
    void rejectsUnknownOperationKind() {
        assertThatThrownBy(() -> simulator.run(
                CacheAsideInput.create(2, 20, 100, "v1",
                        List.of(new CacheOperation("DELETE", "k", null, 0)), 7)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown operation kind");
    }

    @Test
    void rejectsUpdateWithoutValue() {
        assertThatThrownBy(() -> simulator.run(
                CacheAsideInput.create(2, 20, 100, "v1",
                        List.of(new CacheOperation("UPDATE", "k", "", 0)), 7)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("non-empty value");
    }

    // ── UPDATE produces events but no GET outcomes ──

    @Test
    void updateOnlyProducesNoGetOutcomes() {
        CacheAsideResult result = simulator.run(CacheAsideInput.create(2, 20, 100, "v1",
                List.of(new CacheOperation("UPDATE", "k", "v2", 10)), 7));

        assertThat(result.outcomes()).isEmpty();
        assertThat(result.metrics().totalGets()).isZero();
        assertThat(result.metrics().hitRatio()).isEqualTo(0.0);
        assertThat(result.events()).hasSize(1);
        assertThat(result.events().get(0).kind()).isEqualTo("origin.update");
    }

    // ── TTL boundary: exact expiry ──

    @Test
    void zeroTtlMeansEveryCacheAccessExpires() {
        // TTL = 0, cache fill at t=22, expires at 22.
        // Second GET at 30: lookup at 32, 32 >= 22 -> expired -> miss
        CacheAsideResult result = simulator.run(CacheAsideInput.create(2, 20, 0, "v1",
                List.of(
                        new CacheOperation("GET", "k", null, 0),
                        new CacheOperation("GET", "k", null, 30)),
                7));

        assertThat(result.outcomes()).hasSize(2);
        assertThat(result.outcomes().get(0).hitOrMiss()).isEqualTo("MISS");
        assertThat(result.outcomes().get(1).hitOrMiss()).isEqualTo("MISS");
        assertThat(result.metrics().originReads()).isEqualTo(2);
    }

    // ── Stale detection after update ──

    @Test
    void staleReadIsDetectedAfterOriginUpdate() {
        CacheAsideResult result = simulator.run(CacheAsideInput.create(2, 20, 1000, "v1",
                List.of(
                        new CacheOperation("GET", "k", null, 0),
                        new CacheOperation("UPDATE", "k", "v2", 50),
                        new CacheOperation("GET", "k", null, 100)),
                7));

        assertThat(result.outcomes()).hasSize(2);

        // First GET fills cache with v1
        assertThat(result.outcomes().get(0).stale()).isFalse();

        // Second GET: cache hit with v1, but origin has v2 -> stale
        CacheGetOutcome staleOutcome = result.outcomes().get(1);
        assertThat(staleOutcome.hitOrMiss()).isEqualTo("HIT");
        assertThat(staleOutcome.returnedValue()).isEqualTo("v1");
        assertThat(staleOutcome.stale()).isTrue();

        assertThat(result.metrics().staleReads()).isEqualTo(1);
    }

    @Test
    void updatesDuringReadAreSampledAtReadCompletionEvenWithUnsortedInput() {
        CacheAsideResult result = simulator.run(CacheAsideInput.create(2, 20, 100, "v1",
                List.of(new CacheOperation("GET", "k", null, 0),
                        new CacheOperation("GET", "k", null, 30),
                        new CacheOperation("UPDATE", "k", "v2", 10)), 7));
        assertThat(result.outcomes()).extracting(CacheGetOutcome::returnedValue).containsExactly("v2", "v2");
        assertThat(result.events()).extracting(CacheAsideTraceEvent::timeMs).isSorted();
    }

    @Test
    void missingKeyIsNotCachedAndCanLaterBeCreated() {
        CacheAsideResult result = simulator.run(CacheAsideInput.create(2, 20, 100, "v1",
                List.of(new CacheOperation("GET", "other", null, 0),
                        new CacheOperation("UPDATE", "other", "created", 30),
                        new CacheOperation("GET", "other", null, 40)), 7));
        assertThat(result.outcomes().get(0).returnedValue()).isNull();
        assertThat(result.outcomes().get(1).returnedValue()).isEqualTo("created");
        assertThat(result.metrics().cacheHits()).isZero();
    }

    @Test
    void sameValueUpdateStillChangesTheOriginVersion() {
        CacheAsideResult result = simulator.run(CacheAsideInput.create(2, 20, 100, "v1",
                List.of(new CacheOperation("GET", "k", null, 0),
                        new CacheOperation("UPDATE", "k", "v1", 30),
                        new CacheOperation("GET", "k", null, 40)), 7));
        assertThat(result.outcomes().get(1).stale()).isTrue();
    }

    @Test
    void originOutageRejectsWritesAndSeparatesBypassesFromMisses() {
        CacheAsideResult result = simulator.run(CacheAsideInput.withAvailability(2, 20, 100, "v1",
                List.of(new CacheOperation("UPDATE", "k", "v2", 0),
                        new CacheOperation("GET", "k", null, 1)), false, false, 7));
        assertThat(result.events()).extracting(CacheAsideTraceEvent::kind)
                .containsExactly("origin.error", "cache.bypass", "cache.error");
        assertThat(result.metrics().cacheMisses()).isZero();
        assertThat(result.metrics().cacheBypasses()).isEqualTo(1);
        assertThat(result.metrics().failedGets()).isEqualTo(1);
        assertThat(result.incompleteGets()).isZero();
    }

    @Test
    void everyRuntimeLimitReturnsAPartialTraceWithoutInventingOutcomes() {
        List<SimulationBudget> budgets = List.of(
                new SimulationBudget(1, 60_000, 100_000, 0),
                new SimulationBudget(100, 10, 100_000, 0),
                new SimulationBudget(100, 60_000, 1, 0));
        List<String> reasons = List.of("event_limit", "virtual_time_limit", "trace_size_limit");
        for (int i = 0; i < budgets.size(); i++) {
            CacheAsideResult result = new CacheAsideSimulator(budgets.get(i)).run(
                    CacheAsideInput.create(2, 20, 100, "v1",
                            List.of(new CacheOperation("GET", "k", null, 0)), 7));
            assertThat(result.status()).isEqualTo("limited");
            assertThat(result.truncationReason()).isEqualTo(reasons.get(i));
            assertThat(result.incompleteGets()).isEqualTo(1);
            assertThat(result.outcomes()).isEmpty();
            assertThat(result.lastVirtualTimeMs()).isLessThanOrEqualTo(budgets.get(i).maxVirtualTimeMs());
        }
    }

    @Test
    void rejectsUnboundedOrAmbiguousOperations() {
        for (CacheOperation op : List.of(new CacheOperation("GET", "k", null, Long.MAX_VALUE),
                new CacheOperation("GET", null, null, 0), new CacheOperation("GET", "k", "ignored", 0),
                new CacheOperation("UPDATE", "k", "x".repeat(257), 0))) {
            assertThatThrownBy(() -> simulator.run(CacheAsideInput.create(2, 20, 100, "v1", List.of(op), 7)))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void simultaneousZeroLatencyReadsUseStableInsertionOrder() {
        CacheAsideInput input = CacheAsideInput.create(0, 0, 100, "v1",
                List.of(new CacheOperation("GET", "k", null, 0),
                        new CacheOperation("GET", "k", null, 0)), 7);
        CacheAsideResult result = simulator.run(input);
        assertThat(result.outcomes()).extracting(CacheGetOutcome::hitOrMiss).containsExactly("MISS", "MISS");
        assertThat(result).isEqualTo(simulator.run(input));
        assertThat(result.events()).extracting(CacheAsideTraceEvent::sequence).containsExactly(1, 2, 3, 4, 5, 6);
    }
    // ── Structured event state (HLD-04) ──

    /** Full state at one event, rebuilt only from typed Java output. */
    private record State(Map<String, CacheAsideTraceEvent.CacheEntryState> cache,
                         Map<String, CacheAsideTraceEvent.OriginValueState> origin) {
    }

    private static State stateAt(CacheAsideResult result, int eventIndex) {
        Map<String, CacheAsideTraceEvent.CacheEntryState> cache = new HashMap<>();
        Map<String, CacheAsideTraceEvent.OriginValueState> origin = new HashMap<>();
        for (CacheAsideInitialState.OriginKey key : result.initialState().origin()) {
            origin.put(key.key(), new CacheAsideTraceEvent.OriginValueState(key.value(), key.version()));
        }
        for (int i = 0; i <= eventIndex; i++) {
            CacheAsideTraceEvent event = result.events().get(i);
            if (event.cacheEntry() == null) cache.remove(event.key());
            else cache.put(event.key(), event.cacheEntry());
            if (event.originValue() == null) origin.remove(event.key());
            else origin.put(event.key(), event.originValue());
        }
        return new State(cache, origin);
    }

    @Test
    void baselineEventsCarryTheStateTheLessonExplains() {
        CacheAsideResult result = simulator.run(CacheAsideInput.create(2, 20, 100, "v1",
                List.of(
                        new CacheOperation("GET", "k", null, 0),
                        new CacheOperation("GET", "k", null, 30),
                        new CacheOperation("UPDATE", "k", "v2", 40),
                        new CacheOperation("GET", "k", null, 70),
                        new CacheOperation("GET", "k", null, 120)),
                7));

        assertThat(result.initialState().cacheAvailable()).isTrue();
        assertThat(result.initialState().origin())
                .containsExactly(new CacheAsideInitialState.OriginKey("k", "v1", 1));
        assertThat(result.events()).extracting(CacheAsideTraceEvent::key).containsOnly("k");
        assertThat(result.events()).extracting(CacheAsideTraceEvent::operation)
                .containsExactly(1, 1, 1, 2, 3, 4, 5, 5, 5);

        // The first fill at 22 ms stores v1 (version 1) until 122 ms.
        int firstFill = indexOf(result, "cache.fill", 22);
        assertThat(stateAt(result, firstFill).cache().get("k"))
                .isEqualTo(new CacheAsideTraceEvent.CacheEntryState("v1", 1, 22, 122));
        // After the update at 40 ms the origin holds v2 while the cache still holds v1.
        State afterUpdate = stateAt(result, indexOf(result, "origin.update", 40));
        assertThat(afterUpdate.origin().get("k")).isEqualTo(new CacheAsideTraceEvent.OriginValueState("v2", 2));
        assertThat(afterUpdate.cache().get("k").version()).isEqualTo(1);
        // The hit at 72 ms serves the cached version 1 while origin is at version 2: stale.
        State atStaleHit = stateAt(result, indexOf(result, "cache.hit", 72));
        assertThat(atStaleHit.cache().get("k").version()).isLessThan(atStaleHit.origin().get("k").version());
        // The expiry miss at 122 ms is followed by a refill with v2 until 242 ms.
        assertThat(stateAt(result, indexOf(result, "cache.fill", 142)).cache().get("k"))
                .isEqualTo(new CacheAsideTraceEvent.CacheEntryState("v2", 2, 142, 242));
    }

    @Test
    void coldBurstShowsNoCacheEntryBeforeTheFirstFill() {
        CacheAsideResult result = simulator.run(CacheAsideInput.create(2, 20, 100, "v1",
                List.of(0L, 1L, 2L, 3L, 4L).stream()
                        .map(time -> new CacheOperation("GET", "k", null, time)).toList(),
                7));

        int firstFill = indexOf(result, "cache.fill", 22);
        for (int i = 0; i < firstFill; i++) {
            assertThat(stateAt(result, i).cache()).as("state at event %d", i).isEmpty();
        }
        assertThat(result.events().stream().filter(e -> e.kind().equals("cache.miss")))
                .allMatch(e -> e.cacheEntry() == null);
    }

    @Test
    void structuredTraceIsDeterministicAndHitStateMatchesOutcomes() {
        CacheAsideInput input = CacheAsideInput.create(2, 20, 100, "v1",
                List.of(new CacheOperation("GET", "k", null, 0), new CacheOperation("GET", "k", null, 30),
                        new CacheOperation("UPDATE", "k", "v2", 40), new CacheOperation("GET", "k", null, 70)),
                7);
        CacheAsideResult first = simulator.run(input);
        assertThat(simulator.run(input).events()).isEqualTo(first.events());
        assertThat(simulator.run(input).initialState()).isEqualTo(first.initialState());

        List<CacheAsideTraceEvent> hits = first.events().stream()
                .filter(e -> e.kind().equals("cache.hit")).toList();
        assertThat(hits).hasSize(2);
        for (CacheAsideTraceEvent hit : hits) {
            CacheGetOutcome outcome = first.outcomes().get(hit.operation() == 2 ? 1 : 2);
            assertThat(hit.cacheEntry().value()).isEqualTo(outcome.returnedValue());
            assertThat(hit.cacheEntry().version() != hit.originValue().version()).isEqualTo(outcome.stale());
        }
    }

    @Test
    void largestValidTraceStaysWithinTheDefaultByteBudget() {
        // Worst case for trace size: every GET misses, reads origin, and fills
        // with a maximum-length value, so each carries the largest key state.
        String value = "v".repeat(CacheAsideLimits.MAX_VALUE_LENGTH);
        List<CacheOperation> gets = new java.util.ArrayList<>();
        for (int i = 0; i < CacheAsideLimits.MAX_OPERATIONS; i++) {
            gets.add(new CacheOperation("GET", "k", null, i * 100L));
        }
        CacheAsideResult result = simulator.run(CacheAsideInput.create(1, 20, 0, value, gets, 7));

        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.events()).hasSize(3 * CacheAsideLimits.MAX_OPERATIONS);
        assertThat(result.events()).filteredOn(e -> e.kind().equals("cache.fill"))
                .allMatch(e -> e.cacheEntry().value().equals(value));
    }

    private static int indexOf(CacheAsideResult result, String kind, long timeMs) {
        for (int i = 0; i < result.events().size(); i++) {
            CacheAsideTraceEvent event = result.events().get(i);
            if (event.kind().equals(kind) && event.timeMs() == timeMs) return i;
        }
        throw new AssertionError("No " + kind + " event at " + timeMs + " ms");
    }
}
