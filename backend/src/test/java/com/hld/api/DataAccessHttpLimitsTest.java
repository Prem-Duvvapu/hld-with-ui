package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;

import com.hld.dataaccess.DataAccessAnalyzer;
import com.hld.dataaccess.DataAccessInput;
import com.hld.dataaccess.DataAccessInput.IndexOrder;
import com.hld.dataaccess.DataAccessInput.Operation;
import com.hld.dataaccess.DataAccessInput.Row;
import com.hld.dataaccess.DataAccessPresets;
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
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import tools.jackson.databind.ObjectMapper;

/** The new analysis participates in shared HTTP guards despite having no event timeline. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "hld.http.max-request-bytes=8192", "hld.http.max-simulation-response-bytes=16384", "hld.http.max-concurrent-simulations=1"})
class DataAccessHttpLimitsTest {
    private static final String RUN = "/api/v1/simulations/data-access-models/runs";
    private static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @MockitoSpyBean DataAccessAnalyzer analyzer;
    private byte[] baseline() { return mapper.writeValueAsBytes(DataAccessPresets.baseline()); }
    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
    private HttpRequest request(String path, byte[] body, boolean chunked) {
        var publisher = chunked ? HttpRequest.BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(body)) : HttpRequest.BodyPublishers.ofByteArray(body);
        return HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(15)).header("Content-Type", "application/json").POST(publisher).build();
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
            Thread.sleep(10); // Sequential test recovery only.
        } while (System.nanoTime() < deadline);
        return response;
    }
    private void problem(HttpResponse<byte[]> response, int status, String code) {
        assertThat(response.statusCode()).isEqualTo(status);
        var json = mapper.readTree(response.body());
        assertThat(json.propertyNames()).containsExactlyInAnyOrder("code", "message", "fieldErrors", "timestamp");
        assertThat(json.path("code").asString()).isEqualTo(code);
        assertThat(json.has("outcomes")).isFalse();
    }
    @Test void inclusiveBodyLimitRejectsKnownAndChunkedExcessBeforeAnalysisAndRecovers() throws Exception {
        byte[] input = baseline();
        byte[] exact = Arrays.copyOf(input, 8192); Arrays.fill(exact, input.length, exact.length, (byte) ' ');
        byte[] over = Arrays.copyOf(exact, 8193); over[8192] = ' ';
        for (boolean chunked : new boolean[] {false, true}) {
            assertThat(send(exact, chunked).statusCode()).isEqualTo(200);
            reset(analyzer);
            problem(send(over, chunked), 413, "request_too_large");
            verify(analyzer, never()).run(any());
            assertThat(send(input, false).statusCode()).isEqualTo(200);
        }
    }
    @Test void oversizedResultsInvalidInputAndModelErrorsReleasePermitsWithoutPartialSuccess() throws Exception {
        List<Row> rows = IntStream.range(0, 20).mapToObj(i -> new Row("r" + "x".repeat(29) + String.format("%02d", i), "t" + "x".repeat(31), "k" + "x".repeat(29) + String.format("%02d", i), i)).toList();
        List<Operation> operations = IntStream.range(0, 10).mapToObj(i -> Operation.allRange("q" + i, 0, 1_000_000, 20)).toList();
        byte[] large = mapper.writeValueAsBytes(new DataAccessInput("1.0", "1.0.0", IndexOrder.TENANT_CREATED, true, rows, operations));
        assertThat(large.length).isLessThan(8192);
        problem(send(large, false), 422, "result_too_large");
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
        reset(analyzer);
        problem(send(new byte[] {'{'}, false), 400, "invalid_input");
        verify(analyzer, never()).run(any());
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
        doThrow(new IllegalStateException("test failure")).when(analyzer).run(any());
        try { problem(send(baseline(), false), 500, "internal_error"); }
        finally { reset(analyzer); }
        assertThat(send(baseline(), false).statusCode()).isEqualTo(200);
    }
    @Test void sharedBusyAdmissionRejectsBeforeParsingWhileDraftReadsStayAvailable() throws Exception {
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        doAnswer(call -> {
            entered.countDown();
            if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("test latch timed out");
            return call.callRealMethod();
        }).when(analyzer).run(any());
        var pending = CLIENT.sendAsync(request(RUN, baseline(), false), HttpResponse.BodyHandlers.ofByteArray());
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            for (String path : List.of(RUN, "/api/v1/simulations/queues-delivery/runs", "/api/v1/simulations/request-flow/runs")) {
                var rejected = once(path, new byte[] {'{'}, false);
                problem(rejected, 503, "simulation_busy");
                assertThat(rejected.headers().firstValue("Retry-After")).contains("1");
            }
            for (String path : List.of("/api/v1/health", "/api/v1/simulations/data-access-models", "/api/v1/draft/topics/data-access-models")) {
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
