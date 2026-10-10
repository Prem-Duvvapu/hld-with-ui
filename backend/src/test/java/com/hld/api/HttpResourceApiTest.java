package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;

import com.hld.cache.CacheAsideSimulator;
import com.hld.simulation.RequestFlowSimulator;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "hld.http.max-request-bytes=4096", "hld.http.max-simulation-response-bytes=8192", "hld.http.max-concurrent-simulations=1"})
class HttpResourceApiTest {
    private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired SimulationController flow;
    @Autowired CacheAsideController cache;
    @Autowired RateLimiterController limiter;
    @MockitoSpyBean CacheAsideSimulator cacheSimulator;
    @MockitoSpyBean RequestFlowSimulator flowSimulator;
    private static final String FLOW = "/api/v1/simulations/request-flow/runs";
    private static final String CACHE = "/api/v1/simulations/cache-aside/runs";

    private byte[] baseline() { return mapper.writeValueAsBytes(flow.descriptor("request-flow").presets().get(0).input()); }
    private HttpRequest post(String path, byte[] body, boolean chunked) {
        var publisher = chunked ? HttpRequest.BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(body)) : HttpRequest.BodyPublishers.ofByteArray(body);
        return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json").POST(publisher).build();
    }
    private HttpResponse<byte[]> send(String path, byte[] body, boolean chunked) throws Exception {
        // The client can finish reading before the preceding filter's finally releases its permit.
        // Only test setup/recovery polls transient busy responses; held-permit assertions use sendOnce.
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        HttpResponse<byte[]> response;
        do {
            response = sendOnce(path, body, chunked);
            if (response.statusCode() != 503 || !mapper.readTree(response.body()).path("code").asString().equals("simulation_busy")) {
                return response;
            }
            Thread.sleep(10);
        } while (System.nanoTime() < deadline);
        return response; // A leaked permit still fails the caller's expected response assertion.
    }
    private HttpResponse<byte[]> sendOnce(String path, byte[] body, boolean chunked) throws Exception {
        return CLIENT.send(post(path, body, chunked), HttpResponse.BodyHandlers.ofByteArray());
    }
    private void problem(HttpResponse<byte[]> response, int status, String code) {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(response.headers().firstValue("Content-Type").orElseThrow()).startsWith("application/json");
        var json = mapper.readTree(response.body());
        assertThat(json.size()).isEqualTo(4);
        assertThat(json.get("code").asString()).isEqualTo(code);
        assertThat(json.get("fieldErrors").isObject()).isTrue();
        assertThat(json.has("timestamp")).isTrue();
        assertThat(json.has("events")).isFalse();
        assertThat(response.body().length).isLessThanOrEqualTo(8192);
    }

    @Test void acceptsExactRawUtf8BodyBytesAndRejectsOneMoreForKnownAndChunkedLengths() throws Exception {
        ObjectNode input = (ObjectNode) mapper.valueToTree(cache.descriptor().presets().get(0).input());
        input.put("initialOriginValue", "雪".repeat(32));
        byte[] json = mapper.writeValueAsBytes(input);
        byte[] exact = Arrays.copyOf(json, 4096);
        Arrays.fill(exact, json.length, exact.length, (byte) ' ');
        byte[] over = Arrays.copyOf(exact, 4097); over[4096] = ' ';
        assertThat(new String(over, StandardCharsets.UTF_8).length()).isLessThan(4096);
        for (boolean chunked : new boolean[] {false, true}) {
            assertThat(send(CACHE, exact, chunked).statusCode()).isEqualTo(200);
            problem(send(CACHE, over, chunked), 413, "request_too_large");
            assertThat(send(FLOW, baseline(), false).statusCode()).isEqualTo(200);
        }
    }

    @Test void alsoBoundsCalculatorPostsAndDoesNotRunAnOversizedRequest() throws Exception {
        var invoked = new java.util.concurrent.atomic.AtomicInteger();
        doAnswer(call -> {invoked.incrementAndGet(); return call.callRealMethod();}).when(flowSimulator).run(any());
        byte[] over = new byte[4097]; Arrays.fill(over, (byte) ' ');
        problem(send(FLOW, over, false), 413, "request_too_large");
        assertThat(invoked.get()).isZero();
        problem(send("/api/v1/estimators/capacity-estimation/calculations", over, true), 413, "request_too_large");
    }

    @Test void acceptedMatrixAndEncodedPathsStillEnforceBodyLimits() throws Exception {
        byte[] over = new byte[4097]; Arrays.fill(over, (byte) ' ');
        for (String path : new String[] {
                "/api;tag=x/v1/simulations/request-flow/runs",
                "/api/v1;tag=x/simulations/request-flow/runs",
                "/api/v1/simulations;tag=x/request-flow/runs",
                "/api/v1/simulations/request-flow;tag=x/runs;tag=x",
                "/%61pi/v1/simulations/request-flow/runs"}) {
            assertThat(send(path, baseline(), false).statusCode()).as(path).isEqualTo(200);
            for (boolean chunked : new boolean[] {false, true}) {
                problem(send(path, over, chunked), 413, "request_too_large");
            }
        }
    }

    @Test void returnsOnlyABoundedErrorWhenTheEntireRunEnvelopeExceedsTheResponseLimit() throws Exception {
        ObjectNode input = (ObjectNode) mapper.valueToTree(flow.descriptor("request-flow").presets().get(0).input());
        var arrivals = mapper.createArrayNode(); for (int i = 0; i < 100; i++) arrivals.add(0);
        input.set("arrivalTimesMs", arrivals);
        problem(send(FLOW, mapper.writeValueAsBytes(input), false), 422, "result_too_large");
        assertThat(send(FLOW, baseline(), false).statusCode()).isEqualTo(200);
    }

    @Test void aBusyRunRejectsOtherModelsBeforeParsingWhileHealthAndDiscoveryStayReadable() throws Exception {
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        doAnswer(call -> {
            entered.countDown();
            if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("test latch timed out");
            return call.callRealMethod();
        }).when(cacheSimulator).run(any());
        var pending = CLIENT.sendAsync(post(CACHE, mapper.writeValueAsBytes(cache.descriptor().presets().get(0).input()), false), HttpResponse.BodyHandlers.ofByteArray());
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            for (String path : new String[] {FLOW, "/api/v1/simulations/distributed-rate-limiter/runs",
                    "/api;tag=x/v1/simulations/request-flow/runs",
                    "/api/v1/simulations;tag=x/cache-aside/runs",
                    "/api/v1/simulations/cache-aside/runs;tag=x",
                    "/%61pi/v1/simulations/request-flow/runs"}) {
                var response = sendOnce(path, "{".getBytes(StandardCharsets.UTF_8), false);
                problem(response, 503, "simulation_busy");
                assertThat(response.headers().firstValue("Retry-After")).contains("1");
            }
            for (String path : new String[] {"/api/v1/health", "/api/v1/topics", "/api/v1/simulations/cache-aside"}) {
                var read = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).GET().build();
                assertThat(CLIENT.send(read, HttpResponse.BodyHandlers.ofByteArray()).statusCode()).isEqualTo(200);
            }
        } finally {release.countDown();}
        assertThat(pending.get(5, TimeUnit.SECONDS).statusCode()).isEqualTo(200);
        assertThat(send(FLOW, baseline(), false).statusCode()).isEqualTo(200);
    }

    @Test void releasesAdmissionAfterMalformedUnknownValidationAndModelExceptions() throws Exception {
        for (byte[] invalid : new byte[][] {"{".getBytes(StandardCharsets.UTF_8), "{}".getBytes(StandardCharsets.UTF_8),
                (new String(baseline(), StandardCharsets.UTF_8) + "{}").getBytes(StandardCharsets.UTF_8)}) {
            problem(send(FLOW, invalid, false), 400, "invalid_input");
            assertThat(send(FLOW, baseline(), false).statusCode()).isEqualTo(200);
        }
        problem(send("/api/v1/simulations/unknown/runs", baseline(), false), 404, "not_found");
        assertThat(send(FLOW, baseline(), false).statusCode()).isEqualTo(200);
        doThrow(new IllegalStateException("test model error")).when(flowSimulator).run(any());
        problem(send(FLOW, baseline(), false), 500, "internal_error");
        reset(flowSimulator);
        assertThat(send(FLOW, baseline(), false).statusCode()).isEqualTo(200);
    }

    @Test void everyModelUsesTheSameBoundedResponseAndKeepsItsBaselineSemantics() throws Exception {
        for (var pathAndInput : java.util.Map.of(
                FLOW, baseline(), CACHE, mapper.writeValueAsBytes(cache.descriptor().presets().get(0).input()),
                "/api/v1/simulations/distributed-rate-limiter/runs", mapper.writeValueAsBytes(limiter.descriptor().presets().get(0).input())).entrySet()) {
            var response = send(pathAndInput.getKey(), pathAndInput.getValue(), false);
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(response.body().length).isLessThanOrEqualTo(8192);
            assertThat(mapper.readTree(response.body()).get("status").asString()).isEqualTo("completed");
        }
    }
}
