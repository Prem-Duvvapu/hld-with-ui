package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;

import com.hld.queues.QueueCapacityInput;
import com.hld.queues.QueueCapacityInput.Job;
import com.hld.queues.QueueCapacitySimulator;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import tools.jackson.databind.ObjectMapper;

/** New endpoint actually uses existing byte/admission guards and releases permits on failure. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "hld.http.max-request-bytes=4096", "hld.http.max-simulation-response-bytes=8192", "hld.http.max-concurrent-simulations=1"})
class QueueCapacityHttpLimitsTest {
    private static final String RUN = "/api/v1/simulations/queues-tail-latency/runs";
    private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired QueueCapacityController controller;
    @MockitoSpyBean QueueCapacitySimulator simulator;

    private byte[] baseline() { return mapper.writeValueAsBytes(controller.descriptor().presets().get(0).input()); }
    private HttpRequest request(String path, byte[] body, boolean chunked) {
        var publisher = chunked ? HttpRequest.BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(body)) : HttpRequest.BodyPublishers.ofByteArray(body);
        return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json").POST(publisher).build();
    }
    private HttpResponse<byte[]> once(String path, byte[] body, boolean chunked) throws Exception {
        return CLIENT.send(request(path, body, chunked), HttpResponse.BodyHandlers.ofByteArray());
    }
    private HttpResponse<byte[]> send(byte[] body, boolean chunked) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        HttpResponse<byte[]> response;
        do {
            response = once(RUN, body, chunked);
            if (response.statusCode() != 503) return response;
            Thread.sleep(10); // Test recovery only: response receipt can precede filter finally.
        } while (System.nanoTime() < deadline);
        return response;
    }
    private void problem(HttpResponse<byte[]> response, int status, String code) {
        assertThat(response.statusCode()).isEqualTo(status);
        var json = mapper.readTree(response.body());
        assertThat(json.size()).isEqualTo(4);
        assertThat(json.path("code").asString()).isEqualTo(code);
        assertThat(json.has("events")).isFalse();
    }

    @Test void inclusiveKnownAndChunkedBodyCapsRejectBeforeModelExecutionAndRecover() throws Exception {
        byte[] input = baseline();
        byte[] exact = Arrays.copyOf(input, 4096); Arrays.fill(exact, input.length, exact.length, (byte) ' ');
        byte[] over = Arrays.copyOf(exact, 4097); over[4096] = ' ';
        for (boolean chunked : new boolean[] {false, true}) {
            assertThat(send(exact, chunked).statusCode()).isEqualTo(200);
            problem(send(over, chunked), 413, "request_too_large");
            assertThat(send(input, false).statusCode()).isEqualTo(200);
        }
    }

    @Test void oversizedEnvelopeAndModelExceptionNeverReturnPartialSuccessAndReleaseAdmission() throws Exception {
        var jobs = IntStream.range(0, 25).mapToObj(i -> new Job("job-" + i, 0, 1)).toList();
        byte[] large = mapper.writeValueAsBytes(new QueueCapacityInput("1.0", "1.0.0", 1, 25, jobs, 7));
        assertThat(large.length).isLessThan(4096);
        problem(send(large, false), 422, "result_too_large");
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
        doThrow(new IllegalStateException("test failure")).when(simulator).run(any());
        try { problem(send(baseline(), false), 500, "internal_error"); }
        finally { reset(simulator); }
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
    }

    @Test void busyAdmissionIsSharedAcrossModelsBeforeParsingWhileDraftContentRemainsReadable() throws Exception {
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        doAnswer(call -> {
            entered.countDown();
            if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("test latch timed out");
            return call.callRealMethod();
        }).when(simulator).run(any());
        var pending = CLIENT.sendAsync(request(RUN, baseline(), false), HttpResponse.BodyHandlers.ofByteArray());
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            for (String path : new String[] {RUN, "/api/v1/simulations/cache-aside/runs"}) {
                var rejected = once(path, new byte[] {'{'}, false);
                problem(rejected, 503, "simulation_busy");
                assertThat(rejected.headers().firstValue("Retry-After")).contains("1");
            }
            for (String path : new String[] {"/api/v1/health", "/api/v1/draft/topics/queues-tail-latency", "/api/v1/simulations/queues-tail-latency"}) {
                var read = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).timeout(Duration.ofSeconds(5)).GET().build();
                assertThat(CLIENT.send(read, HttpResponse.BodyHandlers.ofByteArray()).statusCode()).isEqualTo(200);
            }
        } finally { release.countDown(); }
        assertThat(pending.get(5, TimeUnit.SECONDS).statusCode()).isEqualTo(200);
        reset(simulator);
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
    }
}
