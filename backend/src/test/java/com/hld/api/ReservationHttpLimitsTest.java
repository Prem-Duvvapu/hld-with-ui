package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;

import com.hld.transactions.ReservationAnalyzer;
import com.hld.transactions.ReservationInput;
import com.hld.transactions.ReservationInput.Action;
import com.hld.transactions.ReservationInput.Reservation;
import com.hld.transactions.ReservationInput.Step;
import com.hld.transactions.ReservationInput.Strategy;
import com.hld.transactions.ReservationPresets;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Actual shared resource guards on the new analysis route, with permit recovery on failures. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "hld.http.max-request-bytes=4096",
        "hld.http.max-simulation-response-bytes=8192",
        "hld.http.max-concurrent-simulations=1"})
class ReservationHttpLimitsTest {
    private static final String RUN = "/api/v1/simulations/transactions-isolation/runs";
    private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @MockitoSpyBean ReservationAnalyzer analyzer;

    private byte[] baseline() { return mapper.writeValueAsBytes(ReservationPresets.baseline()); }
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
            Thread.sleep(10); // Sequential test setup/recovery only; the model never waits.
        } while (System.nanoTime() < deadline);
        return response;
    }

    private void problem(HttpResponse<byte[]> response, int status, String code) {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(response.headers().firstValue("Content-Type").orElseThrow()).startsWith("application/json");
        var json = mapper.readTree(response.body());
        assertThat(json.propertyNames()).containsExactlyInAnyOrder("code", "message", "fieldErrors", "timestamp");
        assertThat(json.path("code").asString()).isEqualTo(code);
        assertThat(json.has("outcomes")).isFalse();
        assertThat(json.has("finalState")).isFalse();
    }

    @Test void inclusiveKnownAndChunkedBodyLimitsRejectBeforeTheAnalyzerAndRecover() throws Exception {
        byte[] input = baseline();
        assertThat(input.length).isLessThan(4096);
        byte[] exact = Arrays.copyOf(input, 4096);
        Arrays.fill(exact, input.length, exact.length, (byte) ' ');
        byte[] over = Arrays.copyOf(exact, 4097); over[4096] = ' ';
        for (boolean chunked : new boolean[] {false, true}) {
            assertThat(send(exact, chunked).statusCode()).isEqualTo(200);
            reset(analyzer);
            problem(send(over, chunked), 413, "request_too_large");
            verify(analyzer, never()).run(any());
            assertThat(send(input, false).statusCode()).isEqualTo(200);
        }
    }

    private static ReservationInput largeInput() {
        var reservations = new ArrayList<Reservation>();
        var schedule = new ArrayList<Step>();
        for (int i = 0; i < 4; i++) {
            String suffix = String.valueOf((char) ('a' + i));
            String id = "a" + "x".repeat(30) + suffix;
            reservations.add(new Reservation(id, 20));
            schedule.add(new Step("r" + "x".repeat(30) + suffix, id, Action.READ));
        }
        for (int i = 0; i < 4; i++) {
            String suffix = String.valueOf((char) ('a' + i));
            schedule.add(new Step("s" + "x".repeat(30) + suffix, reservations.get(i).id(), Action.ATTEMPT_RESERVE));
        }
        return new ReservationInput("1.0", "1.0.0", Strategy.STALE_READ_WRITE, 20, reservations, schedule);
    }

    @Test void actualOversizedResultProducesNoPartialSuccessAndReleasesAdmission() throws Exception {
        var input = largeInput();
        byte[] body = mapper.writeValueAsBytes(input);
        assertThat(body.length).isLessThan(4096);
        assertThat(mapper.writeValueAsBytes(new ReservationAnalyzer().run(input)).length).isGreaterThan(8192);
        assertThat(mapper.writeValueAsBytes(new ReservationAnalyzer().run(ReservationPresets.baseline())).length).isLessThan(8192);
        problem(send(body, false), 422, "result_too_large");
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
    }

    @Test void parseDomainAndModelFailuresReleasePermitsWithoutInvokingInvalidRuns() throws Exception {
        reset(analyzer);
        problem(send(new byte[] {'{'}, false), 400, "invalid_input");
        verify(analyzer, never()).run(any());
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);

        ObjectNode invalid = (ObjectNode) mapper.valueToTree(ReservationPresets.baseline());
        ((ObjectNode) ((ArrayNode) invalid.get("schedule")).get(3)).put("reservationId", "unknown");
        reset(analyzer);
        problem(send(mapper.writeValueAsBytes(invalid), false), 400, "invalid_input");
        verify(analyzer, never()).run(any());
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);

        doThrow(new IllegalStateException("test failure")).when(analyzer).run(any());
        try { problem(send(baseline(), false), 500, "internal_error"); }
        finally { reset(analyzer); }
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
    }

    @Test void busyAdmissionIsSharedBeforeParsingWhileMetadataAndDraftReadsRemainAvailable() throws Exception {
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        doAnswer(call -> {
            entered.countDown();
            if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("test latch timed out");
            return call.callRealMethod();
        }).when(analyzer).run(any());
        var pending = CLIENT.sendAsync(request(RUN, baseline(), false), HttpResponse.BodyHandlers.ofByteArray());
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            for (String path : new String[] {RUN, "/api/v1/simulations/data-access-models/runs", "/api/v1/simulations/request-flow/runs"}) {
                var rejected = once(path, new byte[] {'{'}, false);
                problem(rejected, 503, "simulation_busy");
                assertThat(rejected.headers().firstValue("Retry-After")).contains("1");
            }
            for (String path : new String[] {"/api/v1/health", "/api/v1/simulations/transactions-isolation", "/api/v1/draft/topics/transactions-isolation"}) {
                var response = CLIENT.send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(5)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
                assertThat(response.statusCode()).isEqualTo(200);
            }
        } finally {
            release.countDown();
            assertThat(pending.get(15, TimeUnit.SECONDS).statusCode()).isEqualTo(200);
            reset(analyzer);
        }
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
    }
}
