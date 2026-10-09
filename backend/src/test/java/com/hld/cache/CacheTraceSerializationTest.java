package com.hld.cache;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.simulation.engine.SimulationBudget;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.ObjectMapper;

/** Test the declared events-array budget using the application's real JSON serializer. */
@SpringBootTest
class CacheTraceSerializationTest {
    @Autowired ObjectMapper mapper;

    private CacheAsideInput maximumEscapedPayload() {
        String value = "漢🌱\n\u0001\"\\".repeat(37).substring(0, CacheAsideLimits.MAX_VALUE_LENGTH);
        assertThat(value.length()).isEqualTo(CacheAsideLimits.MAX_VALUE_LENGTH);
        String key = "雪".repeat(CacheAsideLimits.MAX_KEY_LENGTH);
        List<CacheOperation> operations = new ArrayList<>();
        for (int i = 0; i < CacheAsideLimits.MAX_OPERATIONS / 2; i++) {
            operations.add(new CacheOperation("UPDATE", key, value, i * 4L));
            operations.add(new CacheOperation("GET", key, null, i * 4L + 1));
        }
        return CacheAsideInput.create(0, 0, CacheAsideLimits.MAX_TTL_MS, value, operations, 7);
    }

    @Test
    void actualUtf8EventsArrayStaysInsideEachDeclaredBudgetIncludingSnapshotsAndEscapes() {
        CacheAsideInput input = maximumEscapedPayload();
        for (long bytes : new long[] {512, 4096, 32768, SimulationBudget.DEFAULT_MAX_TRACE_BYTES}) {
            var simulator = new CacheAsideSimulator(new SimulationBudget(10_000, 60_000, bytes, 0));
            var result = simulator.run(input);
            byte[] serialized = mapper.writeValueAsBytes(result.events());
            assertThat(serialized.length).as("events-array bytes with budget %s", bytes).isLessThanOrEqualTo((int) bytes);
            var decoded = mapper.readTree(serialized);
            assertThat(decoded.size()).isEqualTo(result.events().size());
            if (bytes < SimulationBudget.DEFAULT_MAX_TRACE_BYTES) {
                assertThat(result.status()).isEqualTo("limited");
                assertThat(result.truncationReason()).isEqualTo("trace_size_limit");
                assertThat(result.incompleteGets()).isPositive();
            } else {
                assertThat(result.status()).isEqualTo("completed");
                assertThat(result.incompleteGets()).isZero();
                assertThat(result.outcomes()).hasSize(50);
                assertThat(result.outcomes()).allSatisfy(outcome -> assertThat(outcome.returnedValue()).isEqualTo(input.initialOriginValue()));
            }
            System.out.printf("CACHE_SERIALIZATION budget=%d events=%d eventBytes=%d responseBytes=%d status=%s%n",
                    bytes, result.events().size(), serialized.length, mapper.writeValueAsBytes(result).length, result.status());
        }
    }

    @Test
    void anEmptyRejectedTraceStillSerializesAsAnArrayAndNeverFabricatesTerminalOutcomes() {
        var simulator = new CacheAsideSimulator(new SimulationBudget(10_000, 60_000, 2, 0));
        var result = simulator.run(maximumEscapedPayload());
        assertThat(mapper.writeValueAsString(result.events())).isEqualTo("[]");
        assertThat(result.events()).isEmpty();
        assertThat(result.outcomes()).isEmpty();
        assertThat(result.incompleteGets()).isEqualTo(50);
        assertThat(result.status()).isEqualTo("limited");
        assertThat(result.truncationReason()).isEqualTo("trace_size_limit");
        // The full response still carries assumptions, initial origin and incomplete metrics.
        assertThat(mapper.writeValueAsBytes(result).length).isGreaterThan(2);
    }
}
