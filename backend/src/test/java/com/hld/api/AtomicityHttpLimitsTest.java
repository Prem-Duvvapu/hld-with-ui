package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;

import com.hld.atomicity.AtomicityAnalyzer;
import com.hld.atomicity.AtomicityInput;
import com.hld.atomicity.AtomicityInput.Action;
import com.hld.atomicity.AtomicityInput.Mode;
import com.hld.atomicity.AtomicityInput.Step;
import com.hld.atomicity.AtomicityInput.Transaction;
import com.hld.atomicity.AtomicityPresets;
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
        "hld.http.max-simulation-response-bytes=8192",
        "hld.http.max-concurrent-simulations=1"})
class AtomicityHttpLimitsTest {
    private static final String RUN = "/api/v1/simulations/transaction-atomicity/runs";
    private static final String RESERVATION_RUN = "/api/v1/simulations/transactions-isolation/runs";
    private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @MockitoSpyBean AtomicityAnalyzer analyzer;
    @MockitoSpyBean ReservationAnalyzer reservations;

    private byte[] baseline() { return mapper.writeValueAsBytes(AtomicityPresets.baseline()); }
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
        assertThat(json.has("outcomes")).isFalse();
        assertThat(json.has("finalState")).isFalse();
        assertThat(json.has("metrics")).isFalse();
    }

    @Test void inclusiveBodyLimitAndBothKnownAndChunkedOverflowRecoverWithoutExecutingRejectedInputs() throws Exception {
        byte[] body = baseline();
        assertThat(body.length).isLessThan(4096);
        assertThat(mapper.writeValueAsBytes(new AtomicityAnalyzer().run(AtomicityPresets.baseline())).length).isLessThan(8192);
        byte[] exact = Arrays.copyOf(body, 4096);
        Arrays.fill(exact, body.length, exact.length, (byte) ' ');
        byte[] over = Arrays.copyOf(exact, 4097); over[4096] = ' ';
        for (boolean chunked : new boolean[] {false, true}) {
            var accepted = send(exact, chunked);
            assertThat(accepted.statusCode()).isEqualTo(200);
            assertThat(mapper.readTree(accepted.body())).isEqualTo(mapper.valueToTree(new AtomicityAnalyzer().run(AtomicityPresets.baseline())));
            reset(analyzer);
            problem(send(over, chunked), 413, "request_too_large");
            verify(analyzer, never()).run(any());
            assertThat(send(body, false).statusCode()).isEqualTo(200);
        }
    }

    private static AtomicityInput largeInput() {
        var transactions = new ArrayList<Transaction>();
        var schedule = new ArrayList<Step>();
        for (int i = 0; i < 3; i++) transactions.add(new Transaction("a" + "x".repeat(30) + i, 20));
        var actions = List.of(Action.BEGIN, Action.DECREMENT_STOCK, Action.RECORD_ALLOCATION, Action.COMMIT);
        for (int actionIndex = 0; actionIndex < actions.size(); actionIndex++) {
            for (int actorIndex = 0; actorIndex < transactions.size(); actorIndex++) {
                schedule.add(new Step("s" + "x".repeat(29) + actionIndex + actorIndex,
                        transactions.get(actorIndex).id(), actions.get(actionIndex)));
            }
        }
        return new AtomicityInput("1.0", "1.0.0", Mode.STAGED_VERSION_CHECK, 20, transactions, schedule);
    }

    @Test void actualOversizedWholeResultReturns422AndACompleteSubsequentRunStillWorks() throws Exception {
        var input = largeInput();
        byte[] body = mapper.writeValueAsBytes(input);
        assertThat(body.length).isLessThan(4096);
        assertThat(mapper.writeValueAsBytes(new AtomicityAnalyzer().run(input)).length).isGreaterThan(8192);
        problem(send(body, false), 422, "result_too_large");
        var recovered = send(baseline(), false);
        assertThat(recovered.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(recovered.body())).isEqualTo(mapper.valueToTree(new AtomicityAnalyzer().run(AtomicityPresets.baseline())));
    }

    @Test void parsingProgramAndUnexpectedModelFailuresAllReleaseThePermit() throws Exception {
        reset(analyzer);
        problem(send(new byte[] {'{'}, false), 400, "invalid_input");
        verify(analyzer, never()).run(any());
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
        ObjectNode invalid = (ObjectNode) mapper.valueToTree(AtomicityPresets.baseline());
        ((ObjectNode) invalid.path("schedule").get(2)).put("action", "COMMIT");
        reset(analyzer);
        problem(send(mapper.writeValueAsBytes(invalid), false), 400, "invalid_input");
        verify(analyzer, never()).run(any());
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
        doThrow(new IllegalStateException("test failure")).when(analyzer).run(any());
        try { problem(send(baseline(), false), 500, "internal_error"); }
        finally { reset(analyzer); }
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
    }

    @Test void occupiedAtomicityAdmissionBlocksOtherModelsBeforeParsingButAllowsMetadata() throws Exception {
        sharedAdmission(true);
    }
    @Test void occupiedReservationAdmissionAlsoBlocksAtomicityAndRecovers() throws Exception {
        sharedAdmission(false);
    }

    private void sharedAdmission(boolean holdAtomicity) throws Exception {
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        org.mockito.stubbing.Answer<Object> blocked = call -> {
            entered.countDown();
            if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("test latch timed out");
            return call.callRealMethod();
        };
        if (holdAtomicity) doAnswer(blocked).when(analyzer).run(any());
        else doAnswer(blocked).when(reservations).run(any());
        String heldPath = holdAtomicity ? RUN : RESERVATION_RUN;
        byte[] heldBody = holdAtomicity ? baseline() : mapper.writeValueAsBytes(ReservationPresets.baseline());
        var pending = CLIENT.sendAsync(request(heldPath, heldBody, false), HttpResponse.BodyHandlers.ofByteArray());
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            for (String path : List.of(RUN, RESERVATION_RUN, "/api/v1/simulations/data-access-models/runs", "/api/v1/simulations/request-flow/runs")) {
                var rejected = once(path, new byte[] {'{'}, false);
                problem(rejected, 503, "simulation_busy");
                assertThat(rejected.headers().firstValue("Retry-After")).contains("1");
            }
            for (String path : List.of("/api/v1/health", "/api/v1/simulations/transaction-atomicity",
                    "/api/v1/simulations/transactions-isolation", "/api/v1/draft/topics/transactions-isolation")) {
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
        assertThat(recovered).isEqualTo(mapper.valueToTree(new AtomicityAnalyzer().run(AtomicityPresets.baseline())));
    }
}
