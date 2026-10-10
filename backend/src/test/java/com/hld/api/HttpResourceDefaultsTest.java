package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.cache.CacheAsideInput;
import com.hld.cache.CacheAsideLimits;
import com.hld.cache.CacheOperation;
import com.hld.ratelimit.RateLimiterInput;
import com.hld.simulation.RequestFlowInput;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.ObjectMapper;

/** Real HTTP with production defaults: maximum-count/escaped fixtures still deliver bounded results. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class HttpResourceDefaultsTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired HttpExecutionLimits limits;
    @Autowired SimulationController flow;
    @Autowired RateLimiterController limiter;

    private void run(String id, Object input, int requests, String collection) throws Exception {
        // Control-character keys/values below force worst-case JSON escaping.
        byte[] body = mapper.writeValueAsBytes(input);
        assertThat(body.length).isLessThanOrEqualTo(limits.maxRequestBytes());
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/simulations/" + id + "/runs"))
                .timeout(Duration.ofSeconds(15)).header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofByteArray(body)).build();
        var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofByteArray());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body().length).isLessThanOrEqualTo(limits.maxSimulationResponseBytes());
        var result = mapper.readTree(response.body());
        assertThat(result.get("status").asString()).isEqualTo("completed");
        assertThat(result.get(collection).size()).isEqualTo(requests);
        System.out.printf("HTTP_GUARD_DEFAULT id=%s bodyBytes=%d responseBytes=%d status=%s%n", id, body.length, response.body().length, result.get("status").asString());
    }

    @Test void acceptsMaximumRequestFlowAndLimiterCountsWithUnchangedOutcomeCounts() throws Exception {
        var baseline = flow.descriptor("request-flow").presets().get(0).input();
        run("request-flow", RequestFlowInput.current(baseline.policy(), Collections.nCopies(100, 0L), Collections.nCopies(8, 100L), 1, 100, 7), 100, "outcomes");
        RateLimiterInput p = limiter.descriptor().presets().get(0).input();
        run("distributed-rate-limiter", new RateLimiterInput(p.schemaVersion(), p.modelVersion(), p.algorithm(), p.counterScope(), 20,
                p.limit(), p.windowMs(), p.refillTokensPerSecond(), p.counterBackendAvailable(), p.backendFailurePolicy(), Collections.nCopies(500, 0L), p.seed()), 500, "outcomes");
    }

    @Test void acceptsMaximumEscapedCachePayloadAndFullEnvelopeWithoutDroppingTraceOrOutcomes() throws Exception {
        String value = "\u0001".repeat(CacheAsideLimits.MAX_VALUE_LENGTH);
        for (boolean reads : new boolean[] {false, true}) {
            List<CacheOperation> operations = new ArrayList<>();
            int pairs = reads ? CacheAsideLimits.MAX_OPERATIONS / 2 : CacheAsideLimits.MAX_OPERATIONS;
            for (int i = 0; i < pairs; i++) {
                String prefix = i + "-";
                String key = prefix + "\u0001".repeat(CacheAsideLimits.MAX_KEY_LENGTH - prefix.length());
                operations.add(new CacheOperation("UPDATE", key, value, i * 4L));
                if (reads) operations.add(new CacheOperation("GET", key, null, i * 4L + 1));
            }
            var input = CacheAsideInput.create(0, 0, CacheAsideLimits.MAX_TTL_MS, value, operations, 7);
            run("cache-aside", input, reads ? pairs : 0, "outcomes");
        }
    }
}
