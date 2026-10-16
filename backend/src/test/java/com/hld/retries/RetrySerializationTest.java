package com.hld.retries;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.retries.RetryResult.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.EnumSet;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.ObjectMapper;

/** Actual configured JSON, authored only by an explicit root invocation, never ordinary verify. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class RetrySerializationTest {
    @Autowired ObjectMapper mapper;
    private final RetrySimulator simulator = new RetrySimulator();

    @Test void fourActualJavaGoldenPairsCompareWithoutRewritingDuringOrdinaryVerification() throws Exception {
        var coveredKinds = EnumSet.noneOf(Kind.class);
        for (var pair : List.of(new String[]{"baseline", "late-work"}, new String[]{"backoff", "backoff-recovery"},
                new String[]{"deadline", "deadline-before-retry"}, new String[]{"jitter", "jittered-recovery"})) {
            var input = RetryTestInputs.preset(pair[1]);
            var result = simulator.run(input);
            byte[] inputJson = mapper.writeValueAsBytes(input), resultJson = mapper.writeValueAsBytes(result);
            Path inputPath = Path.of("../contracts/examples/timeouts-retries-" + pair[0] + "-input.json");
            Path resultPath = Path.of("../contracts/examples/timeouts-retries-" + pair[0] + "-result.json");
            if (Boolean.getBoolean("hld.writeRetryGoldens")) {
                Files.write(inputPath, inputJson);
                Files.write(resultPath, resultJson);
            }
            assertThat(inputPath).exists(); assertThat(resultPath).exists();
            assertThat(mapper.readTree(Files.readAllBytes(inputPath))).isEqualTo(mapper.readTree(inputJson));
            assertThat(mapper.readTree(Files.readAllBytes(resultPath))).isEqualTo(mapper.readTree(resultJson));
            result.events().forEach(e -> coveredKinds.add(e.kind()));
        }
        assertThat(coveredKinds).containsExactlyInAnyOrder(Kind.values());
    }

    @Test void allPresetRoundTripsRetainExactStateAndOmitEveryInapplicableField() {
        assertThat(RetryPresets.all()).hasSize(8);
        for (var preset : RetryPresets.all()) {
            var input = preset.input();
            assertThat(mapper.readValue(mapper.writeValueAsBytes(input), RetryInput.class)).isEqualTo(input);
            var result = simulator.run(input);
            byte[] json = mapper.writeValueAsBytes(result);
            assertThat(mapper.readValue(json, RetryResult.class)).isEqualTo(result);
            var tree = mapper.readTree(json);
            assertThat(tree.path("simulationId").asString()).isEqualTo("timeouts-retries");
            assertThat(tree.path("kind").asString()).isEqualTo("simulation");
            assertThat(tree.path("status").asString()).isEqualTo("completed");
            for (int i = 0; i < result.events().size(); i++) {
                var event = result.events().get(i);
                var wire = tree.path("events").get(i);
                assertThat(wire.has("attemptId")).isEqualTo(event.attemptId() != null);
                assertThat(wire.has("delayMs")).isEqualTo(event.kind() == Kind.RETRY_SCHEDULED || event.kind() == Kind.RETRY_BLOCKED_BY_DEADLINE);
                assertThat(wire.has("retryAtMs")).isEqualTo(event.kind() == Kind.RETRY_SCHEDULED);
                assertThat(wire.has("proposedRetryAtMs")).isEqualTo(event.kind() == Kind.RETRY_BLOCKED_BY_DEADLINE);
                for (int a = 0; a < event.postState().attempts().size(); a++) {
                    var attempt = event.postState().attempts().get(a);
                    var row = wire.path("postState").path("attempts").get(a);
                    assertThat(row.has("startedAtMs")).isEqualTo(attempt.startedAtMs() != null);
                    assertThat(row.has("completedAtMs")).isEqualTo(attempt.completedAtMs() != null);
                    assertThat(row.has("callerFinishedAtMs")).isEqualTo(attempt.callerFinishedAtMs() != null);
                    assertThat(row.has("timeoutAtMs")).isEqualTo(attempt.timeoutAtMs() != null);
                    assertThat(row.has("failureCause")).isEqualTo(attempt.failureCause() != null);
                }
                for (int r = 0; r < event.postState().requests().size(); r++) {
                    var request = event.postState().requests().get(r);
                    var row = wire.path("postState").path("requests").get(r);
                    assertThat(row.has("overallDeadlineAtMs")).isTrue();
                    assertThat(row.has("activeAttemptId")).isEqualTo(request.activeAttemptId() != null);
                    assertThat(row.has("nextRetryAtMs")).isEqualTo(request.nextRetryAtMs() != null);
                    assertThat(row.has("finishedAtMs")).isEqualTo(request.finishedAtMs() != null);
                    assertThat(row.has("failureReason")).isEqualTo(request.failureReason() != null);
                    assertThat(row.has("lastFailureCause")).isEqualTo(request.lastFailureCause() != null);
                }
            }
            assertThat(result.finalState()).isEqualTo(result.events().get(result.events().size() - 1).postState());
        }
    }

    @Test void maximumBoundarySerializesAndRoundTripsInMemoryWithoutCommittingAGiantTrace() {
        var input = RetryTestInputs.maximumInput();
        var result = simulator.run(input);
        int inputBytes = mapper.writeValueAsBytes(input).length;
        byte[] json = mapper.writeValueAsBytes(result);
        assertThat(input.requests()).hasSize(12).allSatisfy(r -> assertThat(r.id()).hasSize(32));
        assertThat(result.metrics().attemptsSent()).isEqualTo(60);
        assertThat(result.metrics().retriesSent()).isEqualTo(48);
        assertThat(result.events()).hasSizeLessThanOrEqualTo(384);
        assertThat(result.metrics().finalTimeMs()).isLessThanOrEqualTo(80000);
        assertThat(mapper.readValue(json, RetryResult.class)).isEqualTo(result);
        assertThat(result.finalState().queue()).isEmpty();
        assertThat(result.finalState().workers()).allSatisfy(w -> assertThat(w.attemptId()).isNull());
        System.out.printf("RETRY_SERIALIZATION inputBytes=%d responseBytes=%d events=%d attempts=%d finalTimeMs=%d%n",
                inputBytes, json.length, result.events().size(), result.metrics().attemptsSent(), result.metrics().finalTimeMs());
        // This pure foundation measures actual bytes; HTTP budgets are an integration gate, not a claim here.
    }
}
