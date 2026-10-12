package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;

import com.hld.delivery.DeliveryInput;
import com.hld.delivery.DeliveryInput.Message;
import com.hld.delivery.DeliverySimulator;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

/**
 * Delivery registration must participate in the shared guards and release permits on every failure.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "hld.http.max-request-bytes=8192",
            "hld.http.max-simulation-response-bytes=16384",
            "hld.http.max-concurrent-simulations=1"
        })
class DeliveryHttpLimitsTest {
    private static final String RUN = "/api/v1/simulations/queues-delivery/runs";
    private static final HttpClient CLIENT =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired DeliveryController controller;
    @MockitoSpyBean DeliverySimulator simulator;

    private byte[] baseline() {
        return mapper.writeValueAsBytes(controller.descriptor().presets().get(0).input());
    }

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }

    private HttpRequest request(String path, byte[] body, boolean chunked) {
        var publisher =
                chunked
                        ? HttpRequest.BodyPublishers.ofInputStream(
                                () -> new ByteArrayInputStream(body))
                        : HttpRequest.BodyPublishers.ofByteArray(body);
        return HttpRequest.newBuilder(uri(path))
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json")
                .POST(publisher)
                .build();
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
            Thread.sleep(10); // Test recovery only, with no application retry policy.
        } while (System.nanoTime() < deadline);
        return response;
    }

    private void problem(HttpResponse<byte[]> response, int status, String code) {
        assertThat(response.statusCode()).isEqualTo(status);
        var error = mapper.readTree(response.body());
        assertThat(error.propertyNames())
                .containsExactlyInAnyOrder("code", "message", "fieldErrors", "timestamp");
        assertThat(error.path("code").asString()).isEqualTo(code);
        assertThat(error.has("events")).isFalse();
    }

    @Test
    void inclusiveKnownAndChunkedBodyLimitsRejectBeforeParsingAndRecover() throws Exception {
        byte[] input = baseline();
        byte[] exact = Arrays.copyOf(input, 8192);
        Arrays.fill(exact, input.length, exact.length, (byte) ' ');
        byte[] over = Arrays.copyOf(exact, 8193);
        over[8192] = ' ';
        for (boolean chunked : new boolean[] {false, true}) {
            assertThat(send(exact, chunked).statusCode()).isEqualTo(200);
            reset(simulator);
            problem(send(over, chunked), 413, "request_too_large");
            verify(simulator, never()).run(any());
            assertThat(send(input, false).statusCode()).isEqualTo(200);
        }
    }

    @Test
    void oversizedResultModelFailureAndInvalidInputReleaseAdmissionWithoutPartialSuccess()
            throws Exception {
        var b = controller.descriptor().presets().get(0).input();
        var messages = IntStream.range(0, 20).mapToObj(i -> new Message("m" + i, 0)).toList();
        var input =
                new DeliveryInput(
                        b.schemaVersion(),
                        b.modelVersion(),
                        messages,
                        b.consumers(),
                        b.processingTimeMs(),
                        b.acknowledgmentDelayMs(),
                        b.visibilityTimeoutMs(),
                        b.maxDeliveryAttempts(),
                        b.acknowledgmentPolicy(),
                        List.of(),
                        List.of(),
                        b.seed());
        byte[] large = mapper.writeValueAsBytes(input);
        assertThat(large.length).isLessThan(8192);
        problem(send(large, false), 422, "result_too_large");
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
        doThrow(new IllegalStateException("test failure")).when(simulator).run(any());
        try {
            problem(send(baseline(), false), 500, "internal_error");
        } finally {
            reset(simulator);
        }
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
        reset(simulator);
        problem(send(new byte[] {'{'}, false), 400, "invalid_input");
        verify(simulator, never()).run(any());
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
    }

    @Test
    void busyAdmissionIsSharedBeforeParsingAndLeavesBothDraftTopicsReadable() throws Exception {
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        doAnswer(
                        call -> {
                            entered.countDown();
                            if (!release.await(10, TimeUnit.SECONDS))
                                throw new IllegalStateException("test latch timed out");
                            return call.callRealMethod();
                        })
                .when(simulator)
                .run(any());
        var pending =
                CLIENT.sendAsync(
                        request(RUN, baseline(), false), HttpResponse.BodyHandlers.ofByteArray());
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            for (String path :
                    new String[] {
                        RUN,
                        "/api/v1/simulations/queues-tail-latency/runs",
                        "/api/v1/simulations/cache-aside/runs"
                    }) {
                var rejected =
                        once(
                                path,
                                new byte[] {'{'},
                                false); // One request, no retry of a busy assertion.
                problem(rejected, 503, "simulation_busy");
                assertThat(rejected.headers().firstValue("Retry-After")).contains("1");
            }
            for (String path :
                    new String[] {
                        "/api/v1/health",
                        "/api/v1/draft/topics/queues-delivery",
                        "/api/v1/draft/topics/queues-tail-latency",
                        "/api/v1/simulations/queues-delivery"
                    }) {
                var read =
                        HttpRequest.newBuilder(uri(path))
                                .timeout(Duration.ofSeconds(5))
                                .GET()
                                .build();
                assertThat(CLIENT.send(read, HttpResponse.BodyHandlers.ofByteArray()).statusCode())
                        .isEqualTo(200);
            }
        } finally {
            release.countDown();
            try {
                assertThat(pending.get(5, TimeUnit.SECONDS).statusCode()).isEqualTo(200);
            } finally {
                reset(simulator);
            }
        }
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
    }
}
