package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;

import com.hld.idempotency.IdempotencyInput;
import com.hld.idempotency.IdempotencyInput.Action;
import com.hld.idempotency.IdempotencyInput.Call;
import com.hld.idempotency.IdempotencyInput.Mode;
import com.hld.idempotency.IdempotencyInput.Step;
import com.hld.idempotency.IdempotencySimulator;
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

/** Existing byte and admission guards apply to the new endpoint and release after failure. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "hld.http.max-request-bytes=4096",
        "hld.http.max-simulation-response-bytes=16384",
        "hld.http.max-concurrent-simulations=1"})
class IdempotencyHttpLimitsTest {
    private static final String RUN = "/api/v1/simulations/idempotency/runs";
    private static final String RESERVATION_RUN = "/api/v1/simulations/transactions-isolation/runs";
    private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @MockitoSpyBean IdempotencySimulator simulator;
    @MockitoSpyBean ReservationAnalyzer reservations;

    private static IdempotencyInput smallInput() {
        return new IdempotencyInput("1.0", "1.0.0", Mode.ATOMIC_EFFECT_RECORD, 100,
                List.of(new Call("a", "op", "t", "k", 1)),
                List.of(new Step("lookup", "a", 0, Action.LOOKUP), new Step("crash", "a", 0, Action.CRASH_HANDLER)));
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
            Thread.sleep(10); // Test-only recovery; never part of the virtual-time model.
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
        for (String absent : List.of("outcomes", "initialState", "finalState", "metrics")) assertThat(json.has(absent)).isFalse();
    }
    private void recovered() throws Exception {
        var response = send(baseline(), false);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(response.body())).isEqualTo(mapper.valueToTree(new IdempotencySimulator().run(smallInput())));
    }

    @Test void inclusiveBodyLimitAndKnownAndChunkedOverflowRecoverWithoutExecutingRejectedInput() throws Exception {
        byte[] body = baseline();
        assertThat(body.length).isLessThan(4096);
        assertThat(mapper.writeValueAsBytes(new IdempotencySimulator().run(smallInput())).length).isLessThan(16384);
        byte[] exact = Arrays.copyOf(body, 4096);
        Arrays.fill(exact, body.length, exact.length, (byte) ' ');
        byte[] over = Arrays.copyOf(exact, 4097); over[4096] = ' ';
        for (boolean chunked : new boolean[] {false, true}) {
            var accepted = send(exact, chunked);
            assertThat(accepted.statusCode()).isEqualTo(200);
            assertThat(mapper.readTree(accepted.body())).isEqualTo(mapper.valueToTree(new IdempotencySimulator().run(smallInput())));
            reset(simulator);
            problem(send(over, chunked), 413, "request_too_large");
            verify(simulator, never()).run(any());
            recovered();
        }
    }

    private static IdempotencyInput largeInput() {
        var calls = new ArrayList<Call>();
        var steps = new ArrayList<Step>();
        for (int i = 0; i < 6; i++) {
            String id = "c" + i;
            calls.add(new Call(id, "op" + i, "t", "k" + i, 1000));
            for (Action action : List.of(Action.LOOKUP, Action.WRITE_EFFECT, Action.SAVE_RESULT, Action.RESPOND))
                steps.add(new Step("s" + steps.size(), id, i, action));
        }
        return new IdempotencyInput("1.0", "1.0.0", Mode.ATOMIC_EFFECT_RECORD, 10000, calls, steps);
    }

    @Test void actualOversizedWholeResultReturns422AndSubsequentCompleteRunWorks() throws Exception {
        var input = largeInput();
        byte[] body = mapper.writeValueAsBytes(input);
        assertThat(body.length).isLessThan(4096);
        assertThat(mapper.writeValueAsBytes(new IdempotencySimulator().run(input)).length).isGreaterThan(16384);
        problem(send(body, false), 422, "result_too_large");
        recovered();
    }

    @Test void parseValidationAndUnexpectedModelFailuresAllReleaseThePermit() throws Exception {
        reset(simulator);
        problem(send(new byte[] {'{'}, false), 400, "invalid_input");
        verify(simulator, never()).run(any());
        recovered();
        ObjectNode invalid = (ObjectNode) mapper.valueToTree(smallInput());
        invalid.put("retentionMs", 0);
        reset(simulator);
        problem(send(mapper.writeValueAsBytes(invalid), false), 400, "invalid_input");
        verify(simulator, never()).run(any());
        recovered();
        doThrow(new IllegalStateException("test failure")).when(simulator).run(any());
        try { problem(send(baseline(), false), 500, "internal_error"); }
        finally { reset(simulator); }
        recovered();
    }

    @Test void heldIdempotencyRunBlocksOtherModelsBeforeParsingButAllowsMetadata() throws Exception {
        sharedAdmission(true);
    }
    @Test void heldReservationRunBlocksIdempotencyBeforeParsingAndRecovers() throws Exception {
        sharedAdmission(false);
    }

    private void sharedAdmission(boolean holdIdempotency) throws Exception {
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        org.mockito.stubbing.Answer<Object> blocked = call -> {
            entered.countDown();
            if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("test latch timed out");
            return call.callRealMethod();
        };
        if (holdIdempotency) doAnswer(blocked).when(simulator).run(any());
        else doAnswer(blocked).when(reservations).run(any());
        String heldPath = holdIdempotency ? RUN : RESERVATION_RUN;
        byte[] heldBody = holdIdempotency ? baseline() : mapper.writeValueAsBytes(ReservationPresets.baseline());
        var pending = CLIENT.sendAsync(request(heldPath, heldBody, false), HttpResponse.BodyHandlers.ofByteArray());
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            for (String path : List.of(RUN, RESERVATION_RUN, "/api/v1/simulations/timeouts-retries/runs",
                    "/api/v1/simulations/transaction-atomicity/runs", "/api/v1/simulations/queues-delivery/runs", "/api/v1/simulations/request-flow/runs")) {
                var rejected = once(path, new byte[] {'{'}, false);
                problem(rejected, 503, "simulation_busy");
                assertThat(rejected.headers().firstValue("Retry-After")).contains("1");
            }
            for (String path : List.of("/api/v1/health", "/api/v1/simulations/idempotency",
                    "/api/v1/simulations/transactions-isolation", "/api/v1/simulations/timeouts-retries")) {
                var response = CLIENT.send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(5)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
                assertThat(response.statusCode()).isEqualTo(200);
            }
        } finally {
            release.countDown();
            try { assertThat(pending.get(15, TimeUnit.SECONDS).statusCode()).isEqualTo(200); }
            finally { reset(simulator, reservations); }
        }
        recovered();
    }
}
