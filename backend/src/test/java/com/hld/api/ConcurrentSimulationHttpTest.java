package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Concurrent real HTTP runs use shared Spring simulator beans, never shared modeled state. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ConcurrentSimulationHttpTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired CacheAsideController cache;
    @Autowired SimulationController flow;
    @Autowired RateLimiterController limiter;

    private record Call(String path, String body, int status) {}
    private record Expected(Call call, JsonNode body) {}

    private HttpRequest request(Call call) {
        return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + call.path()))
                .timeout(Duration.ofSeconds(10)).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(call.body())).build();
    }

    private JsonNode semanticBody(String body, int status) {
        ObjectNode parsed = (ObjectNode) mapper.readTree(body);
        if (status == 400) {
            assertThat(parsed.get("timestamp")).isNotNull();
            parsed.remove("timestamp"); // Error observation time is not modeled replay state.
        }
        return parsed;
    }

    @Test
    void interleavedCacheFlowLimiterAndInvalidHttpCallsMatchTheirIsolatedResults() throws Exception {
        List<Call> calls = new ArrayList<>();
        var limiterPresets = limiter.descriptor().presets();
        for (int i = 0; i < 4; i++) {
            ObjectNode cached = (ObjectNode) mapper.valueToTree(cache.descriptor().presets().get(i).input());
            cached.put("initialOriginValue", "isolated-" + i + "-雪🌱");
            cached.put("seed", 101 + i);
            calls.add(new Call("/api/v1/simulations/cache-aside/runs", mapper.writeValueAsString(cached), 200));
            ObjectNode routed = (ObjectNode) mapper.valueToTree(flow.descriptor("request-flow").presets().get(i).input());
            routed.put("seed", 201 + i);
            calls.add(new Call("/api/v1/simulations/request-flow/runs", mapper.writeValueAsString(routed), 200));
            ObjectNode limited = (ObjectNode) mapper.valueToTree(limiterPresets.get(i % limiterPresets.size()).input());
            limited.put("seed", 301 + i);
            calls.add(new Call("/api/v1/simulations/distributed-rate-limiter/runs", mapper.writeValueAsString(limited), 200));
        }
        ObjectNode invalid = (ObjectNode) mapper.valueToTree(cache.descriptor().presets().get(0).input());
        invalid.put("modelVersion", "unsupported");
        calls.add(new Call("/api/v1/simulations/cache-aside/runs", mapper.writeValueAsString(invalid), 400));
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        List<Expected> expected = new ArrayList<>();
        for (Call call : calls) {
            var response = client.send(request(call), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).as(call.path()).isEqualTo(call.status());
            expected.add(new Expected(call, semanticBody(response.body(), response.statusCode())));
        }
        List<CompletableFuture<HttpResponse<String>>> pending = new ArrayList<>();
        // Two simultaneous copies exercise identical runs as well as differing initial state/failures.
        for (int repeat = 0; repeat < 2; repeat++) {
            for (Call call : calls) pending.add(client.sendAsync(request(call), HttpResponse.BodyHandlers.ofString()));
        }
        CompletableFuture.allOf(pending.toArray(CompletableFuture[]::new)).get(15, TimeUnit.SECONDS);
        for (int i = 0; i < pending.size(); i++) {
            var response = pending.get(i).get();
            Expected isolated = expected.get(i % expected.size());
            assertThat(response.statusCode()).as("parallel call %s", i).isEqualTo(isolated.call().status());
            assertThat(semanticBody(response.body(), response.statusCode())).as("parallel call %s for %s", i, isolated.call().path()).isEqualTo(isolated.body());
        }
        // A later run must also remain identical after all concurrent work and rejected inputs.
        for (Expected isolated : expected) {
            var response = client.send(request(isolated.call()), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(isolated.call().status());
            assertThat(semanticBody(response.body(), response.statusCode())).isEqualTo(isolated.body());
        }
    }
}
