package com.hld.retries;

import com.hld.retries.RetryInput.Backoff;
import com.hld.retries.RetryInput.Jitter;
import com.hld.retries.RetryInput.Request;
import java.util.List;

/** Original finite experiments for later API and teaching reuse. No transport registration. */
public final class RetryPresets {
    private RetryPresets() {}
    public record Preset(String id, String title, String description, RetryInput input) {}

    public static RetryInput baseline() {
        return workload(2, 50, 500, 2, Backoff.IMMEDIATE, 0, 0, Jitter.NONE, 48, 0,
                List.of(new Request("a", 0, 80)));
    }

    public static List<Preset> all() {
        var outageRequest = List.of(new Request("a", 0, 20));
        var twoRequests = List.of(new Request("a", 0, 20), new Request("b", 0, 20));
        return List.of(
                new Preset("late-work", "A timeout leaves server work running",
                        "A retry adds another accepted unit of work while its timed-out predecessor still runs.", baseline()),
                new Preset("healthy-timeout", "Let the healthy response arrive",
                        "A longer attempt timeout receives the same 80 ms work without a retry.",
                        workload(2, 100, 500, 2, Backoff.IMMEDIATE, 0, 0, Jitter.NONE, 48, 0,
                                List.of(new Request("a", 0, 80)))),
                new Preset("queue-full", "A retry meets a full admission boundary",
                        "With no waiting room, the retry is rejected while the first accepted work keeps running.",
                        workload(0, 50, 500, 2, Backoff.IMMEDIATE, 0, 0, Jitter.NONE, 48, 0,
                                List.of(new Request("a", 0, 80)))),
                new Preset("immediate-outage", "Immediate retries spend attempts during an outage",
                        "Three sends at the same virtual time cannot outwait an unavailable dependency.",
                        workload(2, 50, 200, 3, Backoff.IMMEDIATE, 0, 0, Jitter.NONE, 48, 60, outageRequest)),
                new Preset("backoff-recovery", "Backoff can reach a recovered dependency",
                        "Compare explicit retry delays of 40 and 80 ms with the same authored outage.",
                        workload(2, 50, 200, 3, Backoff.EXPONENTIAL, 40, 80, Jitter.NONE, 48, 60, outageRequest)),
                new Preset("deadline-before-retry", "A proposed retry would miss the deadline",
                        "Inspect an explicit blocked retry proposal, then the actual overall deadline failure.",
                        workload(2, 50, 100, 3, Backoff.EXPONENTIAL, 40, 80, Jitter.NONE, 48, 60, outageRequest)),
                new Preset("retry-budget", "Planning a retry does not reserve a shared token",
                        "Two callers plan a retry, but only one can dispatch with the remaining batch budget.",
                        workload(2, 50, 200, 3, Backoff.EXPONENTIAL, 40, 80, Jitter.NONE, 1, 60, twoRequests)),
                new Preset("jittered-recovery", "Inspect seeded retry delays",
                        "Replay actual inclusive jitter choices for two callers without assuming spread or success.",
                        workload(2, 50, 300, 5, Backoff.EXPONENTIAL, 40, 80, Jitter.FULL, 8, 60, twoRequests)));
    }

    private static RetryInput workload(int queue, int timeout, int overall, int attempts,
            Backoff backoff, int base, int cap, Jitter jitter, int budget, int unavailable,
            List<Request> requests) {
        return new RetryInput(RetryInput.SCHEMA_VERSION, RetryInput.MODEL_VERSION, 42L, 1,
                queue, timeout, overall, attempts, backoff, base, cap, jitter, budget, unavailable, requests);
    }
}
