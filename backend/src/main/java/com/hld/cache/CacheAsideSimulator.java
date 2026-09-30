package com.hld.cache;

import com.hld.simulation.SimulationEvent;
import com.hld.simulation.engine.BudgetExceededException;
import com.hld.simulation.engine.SimulationBudget;
import com.hld.simulation.engine.SimulationContext;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.TreeMap;
import org.springframework.stereotype.Service;

/** Request-local discrete-event cache-aside model. No concurrent miss coalescing. */
@Service
public class CacheAsideSimulator {
    public static final String MODEL_VERSION = CacheAsideInput.CURRENT_MODEL_VERSION;
    public static final List<String> ASSUMPTIONS = List.of(
            "Initially only key k exists; unknown keys return not found and are not cached.",
            "Cache lookup and origin read latencies are fixed constants.",
            "Origin values are sampled when the origin read completes; fills are instantaneous.",
            "TTL starts at fill time; a lookup at or after expiry misses. TTL zero never hits.",
            "UPDATE commits instantly if origin is available and does not invalidate the cache.",
            "Concurrent misses independently read origin; there is no coalescing.",
            "Events use time then insertion order; input arrivals are scheduled first in input order.",
            "Staleness compares committed origin versions at lookup completion (observer view).",
            "Hit ratio is hits / (hits + misses); bypasses are excluded, failed misses are included.",
            "Counts describe emitted events; incomplete GETs include requests not yet observed.");

    private final SimulationBudget budget;

    public CacheAsideSimulator() { this(SimulationBudget.defaults()); }
    CacheAsideSimulator(SimulationBudget budget) { this.budget = budget; }

    public CacheAsideResult run(CacheAsideInput input) {
        validate(input);
        return new Run(input, budget).execute();
    }

    private static final class Run {
        private final CacheAsideInput input;
        private final SimulationContext context;
        private final PriorityQueue<Action> pending = new PriorityQueue<>(
                Comparator.comparingLong(Action::time).thenComparingLong(Action::order));
        private final Map<String, VersionedValue> origin = new HashMap<>();
        private final Map<String, CacheEntry> cache = new HashMap<>();
        private final Map<Integer, CacheGetOutcome> outcomes = new TreeMap<>();
        private long order;
        private long now;
        private int hits;
        private int misses;
        private int bypasses;
        private int errors;
        private int staleReads;
        private int originReads;

        Run(CacheAsideInput input, SimulationBudget budget) {
            this.input = input;
            context = new SimulationContext(budget, input.seed(), input.seed() + 1);
            origin.put("k", new VersionedValue(input.initialOriginValue(), 1));
            for (int i = 0; i < input.operations().size(); i++) {
                int id = i;
                CacheOperation op = input.operations().get(i);
                schedule(op.timeMs(), () -> arrive(id, op));
            }
        }

        CacheAsideResult execute() {
            String reason = null;
            try {
                while (!pending.isEmpty()) {
                    context.checkDeadline();
                    Action action = pending.remove();
                    if (context.virtualTimeExceeded(action.time())) {
                        reason = "virtual_time_limit";
                        break;
                    }
                    now = action.time();
                    action.work().run();
                }
            } catch (BudgetExceededException e) {
                reason = e.truncationReason();
            }
            List<SimulationEvent> events = List.copyOf(context.emitter().events());
            long lastTime = events.isEmpty() ? 0 : events.get(events.size() - 1).timeMs();
            int totalGets = (int) input.operations().stream()
                    .filter(op -> CacheOperation.GET.equals(op.kind())).count();
            CacheAsideMetrics metrics = new CacheAsideMetrics(totalGets, hits, misses, staleReads,
                    originReads, hits + misses == 0 ? 0.0 : (double) hits / (hits + misses),
                    lastTime, bypasses, errors);
            return new CacheAsideResult(CacheAsideInput.CURRENT_SCHEMA_VERSION, "cache-aside", MODEL_VERSION,
                    input.seed(), reason == null ? "completed" : "limited", reason, lastTime,
                    totalGets - outcomes.size(), ASSUMPTIONS, events, List.copyOf(outcomes.values()), metrics);
        }

        private void arrive(int id, CacheOperation op) throws BudgetExceededException {
            if (CacheOperation.UPDATE.equals(op.kind())) {
                if (!input.originAvailable()) {
                    emit(id, "origin.error", "origin", "Origin unavailable; UPDATE did not commit.");
                    return;
                }
                emit(id, "origin.update", "origin", "Origin updated to '" + op.value() + "'.");
                VersionedValue previous = origin.get(op.key());
                origin.put(op.key(), new VersionedValue(op.value(), previous == null ? 1 : previous.version() + 1));
            } else if (!input.cacheAvailable()) {
                emit(id, "cache.bypass", "cache", "Cache unavailable; bypassing to origin.");
                bypasses++;
                readOrigin(id, op, CacheGetOutcome.BYPASS);
            } else {
                schedule(now + input.cacheLookupLatencyMs(), () -> lookup(id, op));
            }
        }

        private void lookup(int id, CacheOperation op) throws BudgetExceededException {
            CacheEntry entry = cache.get(op.key());
            if (entry != null && now < entry.expiresAt()) {
                VersionedValue current = origin.get(op.key());
                boolean stale = current != null && entry.value().version() != current.version();
                emit(id, "cache.hit", "cache", "Cache returns '" + entry.value().value()
                        + "'" + (stale ? " (stale origin version)." : "."));
                hits++;
                if (stale) staleReads++;
                finish(id, op, entry.value().value(), CacheGetOutcome.HIT, stale);
            } else {
                emit(id, "cache.miss", "cache", entry == null ? "Cache miss (no entry)." : "Cache miss (expired).");
                misses++;
                readOrigin(id, op, CacheGetOutcome.MISS);
            }
        }

        private void readOrigin(int id, CacheOperation op, String result) throws BudgetExceededException {
            if (!input.originAvailable()) {
                emit(id, "cache.error", "origin", "Origin unavailable; GET failed.");
                errors++;
                finish(id, op, null, CacheGetOutcome.ERROR, false);
                return;
            }
            schedule(now + input.originReadLatencyMs(), () -> {
                VersionedValue value = origin.get(op.key());
                emit(id, "origin.read", "origin", value == null ? "Origin key not found."
                        : "Origin returns '" + value.value() + "'.");
                originReads++;
                if (input.cacheAvailable() && value != null) {
                    long expiry = now + input.ttlMs();
                    emit(id, "cache.fill", "cache", "Cache filled with '" + value.value()
                            + "'; expires at " + expiry + " ms.");
                    cache.put(op.key(), new CacheEntry(value, expiry));
                }
                finish(id, op, value == null ? null : value.value(), result, false);
            });
        }

        private void finish(int id, CacheOperation op, String value, String result, boolean stale) {
            outcomes.put(id, new CacheGetOutcome(op.key(), value, result, stale, op.timeMs(), now, now - op.timeMs()));
        }

        private void emit(int id, String kind, String node, String message) throws BudgetExceededException {
            if (!context.emit(new SimulationEvent(context.emitter().size() + 1, now, kind,
                    "Operation " + (id + 1), node, message))) {
                throw new BudgetExceededException(context.truncationReason(), "Trace budget reached");
            }
        }

        private void schedule(long time, Work work) { pending.add(new Action(time, order++, work)); }
    }

    private static void validate(CacheAsideInput input) {
        if (input == null || !CacheAsideInput.CURRENT_SCHEMA_VERSION.equals(input.schemaVersion())
                || !MODEL_VERSION.equals(input.modelVersion())) {
            throw new IllegalArgumentException("Unsupported cache schemaVersion or modelVersion; use " + MODEL_VERSION);
        }
        CacheAsideLimits limits = CacheAsideLimits.CURRENT;
        if (input.cacheLookupLatencyMs() < 0 || input.cacheLookupLatencyMs() > limits.maxLatencyMs()
                || input.originReadLatencyMs() < 0 || input.originReadLatencyMs() > limits.maxLatencyMs()
                || input.ttlMs() < 0 || input.ttlMs() > limits.maxTtlMs()) {
            throw new IllegalArgumentException("Latencies must be 0–" + limits.maxLatencyMs()
                    + " ms and TTL 0–" + limits.maxTtlMs() + " ms.");
        }
        if (input.initialOriginValue() == null || input.initialOriginValue().length() > limits.maxValueLength()) {
            throw new IllegalArgumentException("initialOriginValue must contain at most "
                    + limits.maxValueLength() + " characters.");
        }
        if (input.operations() == null || input.operations().isEmpty()
                || input.operations().size() > limits.maxOperations()) {
            throw new IllegalArgumentException("operations must contain 1–" + limits.maxOperations() + " entries.");
        }
        for (CacheOperation op : input.operations()) {
            if (op == null) throw new IllegalArgumentException("operations cannot contain null entries.");
            if (!CacheOperation.GET.equals(op.kind()) && !CacheOperation.UPDATE.equals(op.kind())) {
                throw new IllegalArgumentException("Unknown operation kind: " + op.kind());
            }
            if (op.key() == null || op.key().isBlank() || op.key().length() > limits.maxKeyLength()) {
                throw new IllegalArgumentException("Operation key must contain 1–" + limits.maxKeyLength()
                        + " non-blank characters.");
            }
            if (CacheOperation.UPDATE.equals(op.kind()) && (op.value() == null || op.value().isBlank())) {
                throw new IllegalArgumentException("UPDATE operations must have a non-empty value.");
            }
            if (op.value() != null && op.value().length() > limits.maxValueLength()) {
                throw new IllegalArgumentException("Operation value cannot exceed " + limits.maxValueLength()
                        + " characters.");
            }
            if (CacheOperation.GET.equals(op.kind()) && op.value() != null) {
                throw new IllegalArgumentException("GET operations cannot have a value.");
            }
            if (op.timeMs() < 0 || op.timeMs() > limits.maxOperationTimeMs()) {
                throw new IllegalArgumentException("Operation time must be 0–" + limits.maxOperationTimeMs()
                        + " ms.");
            }
        }
    }

    @FunctionalInterface
    private interface Work { void run() throws BudgetExceededException; }

    private record Action(long time, long order, Work work) {}
    private record VersionedValue(String value, long version) {}
    private record CacheEntry(VersionedValue value, long expiresAt) {}
}
