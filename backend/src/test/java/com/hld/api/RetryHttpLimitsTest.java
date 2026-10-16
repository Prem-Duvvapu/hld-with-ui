package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;

import com.hld.retries.RetrySimulator;
import com.hld.retries.RetryInput;
import com.hld.retries.RetryInput.Backoff;
import com.hld.retries.RetryInput.Jitter;
import com.hld.retries.RetryInput.Request;
import com.hld.retries.RetryPresets;
import com.hld.transactions.ReservationAnalyzer;
import com.hld.transactions.ReservationPresets;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Real shared HTTP guards, including both directions of cross-model admission. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "hld.http.max-request-bytes=4096",
        "hld.http.max-simulation-response-bytes=16384",
        "hld.http.max-concurrent-simulations=1"})
class RetryHttpLimitsTest {
    private static final String RUN = "/api/v1/simulations/timeouts-retries/runs";
    private static final String RESERVATION_RUN = "/api/v1/simulations/transactions-isolation/runs";
    private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @MockitoSpyBean RetrySimulator analyzer;
    @MockitoSpyBean ReservationAnalyzer reservations;

    private static RetryInput smallInput() {
        return RetryPresets.all().stream().filter(p -> p.id().equals("healthy-timeout")).findFirst().orElseThrow().input();
    }
    private byte[] baseline() { return mapper.writeValueAsBytes(smallInput()); }
    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
    private HttpRequest request(String path, byte[] body, boolean chunked) {
        var publisher = chunked ? HttpRequest.BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(body))
                : HttpRequest.BodyPublishers.ofByteArray(body);
        return HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(15))
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
            if (response.statusCode() != 503 || !mapper.readTree(response.body()).path("code").asString().equals("simulation_busy")) return response;
            Thread.sleep(10); // Sequential test recovery only; the model never waits.
        } while (System.nanoTime() < deadline);
        return response;
    }
    private void problem(HttpResponse<byte[]> response, int status, String code) {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(response.headers().firstValue("Content-Type").orElseThrow()).startsWith("application/json");
        var json = mapper.readTree(response.body());
        assertThat(json.propertyNames()).containsExactlyInAnyOrder("code", "message", "fieldErrors", "timestamp");
        assertThat(json.path("code").asString()).isEqualTo(code);
        assertThat(json.path("message").asString()).isNotBlank();
        assertThat(json.has("events")).isFalse();
        assertThat(json.has("finalState")).isFalse();
        assertThat(json.has("metrics")).isFalse();
    }

    @Test void inclusiveBodyLimitAndBothKnownAndChunkedOverflowRecoverWithoutExecutingRejectedInputs() throws Exception {
        byte[] body = baseline();
        assertThat(body.length).isLessThan(4096);
        assertThat(mapper.writeValueAsBytes(new RetrySimulator().run(smallInput())).length).isLessThan(16384);
        byte[] exact = Arrays.copyOf(body, 4096);
        Arrays.fill(exact, body.length, exact.length, (byte) ' ');
        byte[] over = Arrays.copyOf(exact, 4097); over[4096] = ' ';
        for (boolean chunked : new boolean[] {false, true}) {
            var accepted = send(exact, chunked);
            assertThat(accepted.statusCode()).isEqualTo(200);
            assertThat(mapper.readTree(accepted.body())).isEqualTo(mapper.readTree(mapper.writeValueAsBytes(new RetrySimulator().run(smallInput()))));
            reset(analyzer);
            problem(send(over, chunked), 413, "request_too_large");
            verify(analyzer, never()).run(any());
            assertThat(send(body, false).statusCode()).isEqualTo(200);
        }
    }

    private static RetryInput largeInput() {
        var requests = new ArrayList<Request>();
        for (int i = 0; i < 12; i++) requests.add(new Request("r" + "x".repeat(29) + String.format("%02d", i), 0, 1000));
        return new RetryInput("1.0", "1.0.0", 42L, 3, 12, 1, 10000, 5,
                Backoff.IMMEDIATE, 0, 0, Jitter.NONE, 48, 0, requests);
    }

    @Test void actualOversizedWholeResultReturns422AndACompleteSubsequentRunStillWorks() throws Exception {
        var input = largeInput();
        byte[] body = mapper.writeValueAsBytes(input);
        assertThat(body.length).isLessThan(4096);
        assertThat(mapper.writeValueAsBytes(new RetrySimulator().run(input)).length).isGreaterThan(16384);
        problem(send(body, false), 422, "result_too_large");
        var recovered = send(baseline(), false);
        assertThat(recovered.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(recovered.body())).isEqualTo(mapper.readTree(mapper.writeValueAsBytes(new RetrySimulator().run(smallInput()))));
    }

    @Test void parsingValidationAndUnexpectedModelFailuresAllReleaseThePermit() throws Exception {
        reset(analyzer);
        problem(send(new byte[] {'{'}, false), 400, "invalid_input");
        verify(analyzer, never()).run(any());
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
        ObjectNode invalid = (ObjectNode) mapper.valueToTree(smallInput());
        invalid.put("workers", 0);
        reset(analyzer);
        problem(send(mapper.writeValueAsBytes(invalid), false), 400, "invalid_input");
        verify(analyzer, never()).run(any());
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
        doThrow(new IllegalStateException("test failure")).when(analyzer).run(any());
        try { problem(send(baseline(), false), 500, "internal_error"); }
        finally { reset(analyzer); }
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
    }

    @Test void occupiedRetryAdmissionBlocksOtherModelsBeforeParsingButAllowsMetadata() throws Exception {
        sharedAdmission(true);
    }
    @Test void occupiedReservationAdmissionAlsoBlocksRetryAndRecovers() throws Exception {
        sharedAdmission(false);
    }

    private void sharedAdmission(boolean holdRetry) throws Exception {
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        org.mockito.stubbing.Answer<Object> blocked = call -> {
            entered.countDown();
            if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("test latch timed out");
            return call.callRealMethod();
        };
        if (holdRetry) doAnswer(blocked).when(analyzer).run(any());
        else doAnswer(blocked).when(reservations).run(any());
        String heldPath = holdRetry ? RUN : RESERVATION_RUN;
        byte[] heldBody = holdRetry ? baseline() : mapper.writeValueAsBytes(ReservationPresets.baseline());
        var pending = CLIENT.sendAsync(request(heldPath, heldBody, false), HttpResponse.BodyHandlers.ofByteArray());
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            for (String path : List.of(RUN, RESERVATION_RUN, "/api/v1/simulations/transaction-atomicity/runs", "/api/v1/simulations/data-access-models/runs", "/api/v1/simulations/request-flow/runs")) {
                var rejected = once(path, new byte[] {'{'}, false);
                problem(rejected, 503, "simulation_busy");
                assertThat(rejected.headers().firstValue("Retry-After")).contains("1");
            }
            for (String path : List.of("/api/v1/health", "/api/v1/simulations/timeouts-retries",
                    "/api/v1/simulations/transactions-isolation", "/api/v1/simulations/transaction-atomicity")) {
                var response = CLIENT.send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(5)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
                assertThat(response.statusCode()).isEqualTo(200);
            }
        } finally {
            release.countDown();
            try { assertThat(pending.get(15, TimeUnit.SECONDS).statusCode()).isEqualTo(200); }
            finally { reset(analyzer, reservations); }
        }
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
        var recovered = mapper.readTree(send(baseline(), false).body());
        assertThat(recovered).isEqualTo(mapper.readTree(mapper.writeValueAsBytes(new RetrySimulator().run(smallInput()))));
    }
}
