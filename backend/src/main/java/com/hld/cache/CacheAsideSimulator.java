package com.hld.cache;

import com.hld.simulation.SimulationEvent;
import com.hld.simulation.engine.BudgetExceededException;
import com.hld.simulation.engine.SimulationBudget;
import com.hld.simulation.engine.SimulationContext;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Deterministic cache-aside simulator.
 *
 * <p>Models an origin key-value store and a cache with explicit entries,
 * value versions, TTL, read latency, origin latency, cache availability,
 * and a schedule of GET/UPDATE operations. A GET checks cache first; on
 * miss it reads origin and fills cache. An origin update leaves an
 * existing cache entry unchanged under the basic cache-aside policy.
 * The cache does <b>not</b> coalesce concurrent misses in the first release.
 *
 * <p>All operations use virtual time. The model is fully deterministic:
 * same inputs produce the same trace and metrics.
 */
@Service
public class CacheAsideSimulator {
    public static final String MODEL_VERSION = CacheAsideInput.CURRENT_MODEL_VERSION;

    private static final List<String> ASSUMPTIONS = List.of(
            "Cache lookup latency is a fixed constant applied on every cache access.",
            "Origin read latency is a fixed constant applied on every origin read.",
            "Cache fill after an origin read is instantaneous (zero-time).",
            "TTL is measured from the fill time; expiry is checked at lookup time.",
            "An origin UPDATE changes the value instantly; cache is not notified.",
            "Concurrent cache misses each independently read the origin (no coalescing).",
            "Stale detection uses an observer view: the simulator knows the origin version.");

    private final SimulationBudget budget;

    public CacheAsideSimulator() {
        this(SimulationBudget.defaults());
    }

    CacheAsideSimulator(SimulationBudget budget) {
        this.budget = budget;
    }

    /**
     * Runs a cache-aside simulation and returns the full trace.
     */
    public CacheAsideResult run(CacheAsideInput input) {
        validate(input);
        SimulationContext context = new SimulationContext(budget, input.seed(), input.seed() + 1);

        // Origin state: key -> current value
        Map<String, String> origin = new HashMap<>();
        origin.put("k", input.initialOriginValue());

        // Cache state: key -> CacheEntry
        Map<String, CacheEntry> cache = new HashMap<>();

        List<SimulationEvent> events = new ArrayList<>();
        List<CacheGetOutcome> outcomes = new ArrayList<>();
        int sequence = 0;
        long lastTime = 0;

        int cacheHits = 0;
        int cacheMisses = 0;
        int staleReads = 0;
        int originReads = 0;
        int totalGets = 0;

        String wallTimeTruncation = null;
        try {
            for (CacheOperation op : input.operations()) {
                context.checkDeadline();
                lastTime = Math.max(lastTime, op.timeMs());

                if (CacheOperation.GET.equals(op.kind())) {
                    totalGets++;

                    // Step 1: Check cache
                    long lookupTime = op.timeMs() + input.cacheLookupLatencyMs();

                    if (!input.cacheAvailable()) {
                        // Cache unavailable: bypass to origin
                        events.add(new SimulationEvent(sequence++, op.timeMs(),
                                "cache.bypass", op.key(), "cache",
                                "Cache unavailable; bypassing to origin."));

                        if (!input.originAvailable()) {
                            events.add(new SimulationEvent(sequence++, op.timeMs(),
                                    "cache.error", op.key(), "origin",
                                    "Origin also unavailable; GET fails."));
                            cacheMisses++;
                            outcomes.add(new CacheGetOutcome(op.key(), null, CacheGetOutcome.MISS,
                                    false, op.timeMs(), op.timeMs(), 0));
                            lastTime = Math.max(lastTime, op.timeMs());
                            continue;
                        }

                        long originResponseTime = op.timeMs() + input.originReadLatencyMs();
                        originReads++;
                        String originValue = origin.getOrDefault(op.key(), null);
                        events.add(new SimulationEvent(sequence++, originResponseTime,
                                "origin.read", op.key(), "origin",
                                "Origin returns '" + originValue + "'."));
                        cacheMisses++;
                        outcomes.add(new CacheGetOutcome(op.key(), originValue, CacheGetOutcome.MISS,
                                false, op.timeMs(), originResponseTime,
                                originResponseTime - op.timeMs()));
                        lastTime = Math.max(lastTime, originResponseTime);
                        continue;
                    }

                    CacheEntry entry = cache.get(op.key());

                    if (entry != null && lookupTime < entry.expiresAtMs()) {
                        // Cache HIT
                        cacheHits++;
                        String currentOriginValue = origin.getOrDefault(op.key(), null);
                        boolean isStale = currentOriginValue != null
                                && !entry.value().equals(currentOriginValue);
                        if (isStale) staleReads++;

                        events.add(new SimulationEvent(sequence++, lookupTime,
                                "cache.hit", op.key(), "cache",
                                "Cache hit: '" + entry.value() + "'"
                                        + (isStale ? " (stale; origin has '" + currentOriginValue + "')" : "")
                                        + "."));

                        outcomes.add(new CacheGetOutcome(op.key(), entry.value(), CacheGetOutcome.HIT,
                                isStale, op.timeMs(), lookupTime,
                                lookupTime - op.timeMs()));
                        lastTime = Math.max(lastTime, lookupTime);
                    } else {
                        // Cache MISS (absent or expired)
                        cacheMisses++;
                        String missReason = entry == null ? "no entry" : "expired";
                        events.add(new SimulationEvent(sequence++, lookupTime,
                                "cache.miss", op.key(), "cache",
                                "Cache miss (" + missReason + ")."));

                        if (!input.originAvailable()) {
                            events.add(new SimulationEvent(sequence++, lookupTime,
                                    "cache.error", op.key(), "origin",
                                    "Origin unavailable; GET fails on miss."));
                            outcomes.add(new CacheGetOutcome(op.key(), null, CacheGetOutcome.MISS,
                                    false, op.timeMs(), lookupTime,
                                    lookupTime - op.timeMs()));
                            lastTime = Math.max(lastTime, lookupTime);
                            continue;
                        }

                        // Read from origin
                        long originResponseTime = lookupTime + input.originReadLatencyMs();
                        originReads++;
                        String originValue = origin.getOrDefault(op.key(), null);
                        events.add(new SimulationEvent(sequence++, originResponseTime,
                                "origin.read", op.key(), "origin",
                                "Origin returns '" + originValue + "'."));

                        // Fill cache (zero-time after origin read)
                        long fillExpiresAt = originResponseTime + input.ttlMs();
                        cache.put(op.key(), new CacheEntry(originValue, originResponseTime, fillExpiresAt));
                        events.add(new SimulationEvent(sequence++, originResponseTime,
                                "cache.fill", op.key(), "cache",
                                "Cache filled with '" + originValue + "'; expires at " + fillExpiresAt + " ms."));

                        outcomes.add(new CacheGetOutcome(op.key(), originValue, CacheGetOutcome.MISS,
                                false, op.timeMs(), originResponseTime,
                                originResponseTime - op.timeMs()));
                        lastTime = Math.max(lastTime, originResponseTime);
                    }
                } else if (CacheOperation.UPDATE.equals(op.kind())) {
                    // Origin update: change origin value; cache is not notified
                    origin.put(op.key(), op.value());
                    events.add(new SimulationEvent(sequence++, op.timeMs(),
                            "origin.update", op.key(), "origin",
                            "Origin updated to '" + op.value() + "'."));
                    lastTime = Math.max(lastTime, op.timeMs());
                }
            }
        } catch (BudgetExceededException e) {
            wallTimeTruncation = e.truncationReason();
        }

        double hitRatio = totalGets > 0 ? (double) cacheHits / totalGets : 0.0;

        CacheAsideMetrics metrics = new CacheAsideMetrics(
                totalGets, cacheHits, cacheMisses, staleReads,
                originReads, hitRatio, lastTime);

        String truncationReason = wallTimeTruncation != null ? wallTimeTruncation : context.truncationReason();
        String status = truncationReason != null ? "limited" : "completed";

        return new CacheAsideResult(
                CacheAsideInput.CURRENT_SCHEMA_VERSION,
                "cache-aside",
                CacheAsideInput.CURRENT_MODEL_VERSION,
                input.seed(),
                status,
                truncationReason,
                lastTime,
                ASSUMPTIONS,
                events,
                outcomes,
                metrics);
    }

    private void validate(CacheAsideInput input) {
        if (input.ttlMs() < 0) {
            throw new IllegalArgumentException("TTL must be non-negative.");
        }
        for (CacheOperation op : input.operations()) {
            if (!CacheOperation.GET.equals(op.kind()) && !CacheOperation.UPDATE.equals(op.kind())) {
                throw new IllegalArgumentException("Unknown operation kind: " + op.kind());
            }
            if (CacheOperation.UPDATE.equals(op.kind()) && (op.value() == null || op.value().isBlank())) {
                throw new IllegalArgumentException("UPDATE operations must have a non-empty value.");
            }
            if (op.timeMs() < 0) {
                throw new IllegalArgumentException("Operation time must be non-negative.");
            }
        }
    }

    /**
     * Internal cache entry state.
     */
    private record CacheEntry(String value, long filledAtMs, long expiresAtMs) {
    }
}
