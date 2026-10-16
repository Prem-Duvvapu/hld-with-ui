package com.hld.retries;

import com.hld.retries.RetryInput.Backoff;
import com.hld.retries.RetryInput.Jitter;
import com.hld.retries.RetryInput.Request;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

final class RetryTestInputs {
    private RetryTestInputs() {}
    static RetryInput preset(String id) {
        return RetryPresets.all().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow().input();
    }
    static RetryInput configured(Consumer<Config> edit) {
        var config = new Config();
        edit.accept(config);
        return config.input();
    }
    static final class Config {
        String schema = "1.0", model = "1.0.0";
        Long seed = 42L;
        Integer workers = 1, queue = 2, attemptTimeout = 50, overallTimeout = 500, maxAttempts = 2;
        Backoff backoff = Backoff.IMMEDIATE;
        Integer base = 0, cap = 0;
        Jitter jitter = Jitter.NONE;
        Integer budget = 48, unavailable = 0;
        List<Request> requests = List.of(new Request("a", 0, 80));
        RetryInput input() {
            return new RetryInput(schema, model, seed, workers, queue, attemptTimeout, overallTimeout,
                    maxAttempts, backoff, base, cap, jitter, budget, unavailable, requests);
        }
    }
    static RetryInput maximumInput() {
        return configured(c -> {
            c.workers = 3; c.queue = 12; c.attemptTimeout = 1; c.overallTimeout = 10000;
            c.maxAttempts = 5; c.seed = 9007199254740991L;
            var requests = new ArrayList<Request>();
            for (int i = 0; i < 12; i++) requests.add(new Request("r" + "x".repeat(29) + String.format("%02d", i), 10000, 1000));
            c.requests = requests;
        });
    }
}
