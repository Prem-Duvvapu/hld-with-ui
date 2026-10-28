package com.hld.idempotency;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.api.HttpExecutionLimits;
import com.hld.idempotency.IdempotencyInput.Action;
import com.hld.idempotency.IdempotencyInput.Call;
import com.hld.idempotency.IdempotencyInput.Mode;
import com.hld.idempotency.IdempotencyInput.Step;
import com.hld.idempotency.IdempotencyResult.Kind;
import com.hld.idempotency.IdempotencyResult.Phase;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Actual configured JSON; ordinary verification never authors or repairs its evidence. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class IdempotencySerializationTest {
    @Autowired ObjectMapper mapper;
    @Autowired HttpExecutionLimits limits;
    private final IdempotencySimulator simulator = new IdempotencySimulator();

    @Test
    void nineActualJavaPairsCompareWithoutWritingAndCoverEveryOutcomeKind() throws Exception {
        var covered = EnumSet.noneOf(Kind.class);
        assertThat(IdempotencyPresets.all()).hasSize(9);
        for (var preset : IdempotencyPresets.all()) {
            var input = preset.input();
            var result = simulator.run(input);
            byte[] inputJson = mapper.writeValueAsBytes(input);
            byte[] resultJson = mapper.writeValueAsBytes(result);
            Path inputPath = Path.of("../contracts/examples/idempotency-" + preset.id() + "-input.json");
            Path resultPath = Path.of("../contracts/examples/idempotency-" + preset.id() + "-result.json");
            if (Boolean.getBoolean("hld.writeIdempotencyGoldens")) {
                Files.write(inputPath, inputJson);
                Files.write(resultPath, resultJson);
            }
            assertThat(inputPath).exists();
            assertThat(resultPath).exists();
            assertThat(mapper.readTree(Files.readAllBytes(inputPath))).isEqualTo(mapper.readTree(inputJson));
            assertThat(mapper.readTree(Files.readAllBytes(resultPath))).isEqualTo(mapper.readTree(resultJson));
            result.outcomes().forEach(outcome -> covered.add(outcome.kind()));
        }
        assertThat(covered).containsExactlyInAnyOrder(Kind.values());
    }

    @Test
    void configuredMapperRoundTripsCompleteSnapshotsAndOmitsOnlyAbsentFacts() {
        for (var preset : IdempotencyPresets.all()) {
            var input = preset.input();
            assertThat(mapper.readValue(mapper.writeValueAsBytes(input), IdempotencyInput.class)).isEqualTo(input);
            var result = simulator.run(input);
            byte[] bytes = mapper.writeValueAsBytes(result);
            assertThat(mapper.readValue(bytes, IdempotencyResult.class)).isEqualTo(result);
            var tree = mapper.readTree(bytes);
            assertThat(tree.path("simulationId").asString()).isEqualTo("idempotency");
            assertThat(tree.path("kind").asString()).isEqualTo("simulation");
            assertThat(tree.path("status").asString()).isEqualTo("completed");
            assertThat(tree.has("seed")).isFalse();
            assertThat(tree.has("events")).isFalse();
            assertState(result.initialState(), tree.path("initialState"));
            for (int i = 0; i < result.outcomes().size(); i++) {
                var outcome = result.outcomes().get(i);
                var wire = tree.path("outcomes").get(i);
                assertThat(wire.path("stepId").asString()).isEqualTo(input.schedule().get(i).id());
                assertThat(wire.path("callId").asString()).isEqualTo(input.schedule().get(i).callId());
                assertThat(wire.path("timeMs").asInt()).isEqualTo(input.schedule().get(i).timeMs());
                assertState(outcome.postState(), wire.path("postState"));
            }
            assertState(result.finalState(), tree.path("finalState"));
            assertThat(result.outcomes()).hasSameSizeAs(input.schedule());
            assertThat(result.finalState()).isEqualTo(result.outcomes().get(result.outcomes().size() - 1).postState());
            assertThat(result.finalState().calls()).allSatisfy(call ->
                    assertThat(call.phase()).isIn(Phase.RESPONDED, Phase.RESPONSE_LOST, Phase.CRASHED));
        }
    }

    private void assertState(IdempotencyResult.State state, JsonNode wire) {
        assertThat(wire.path("calls").size()).isEqualTo(state.calls().size());
        for (int i = 0; i < state.calls().size(); i++) {
            var call = state.calls().get(i);
            var row = wire.path("calls").get(i);
            assertThat(row.has("pendingUnits")).isTrue();
            assertThat(row.path("pendingUnits").asInt()).isEqualTo(call.pendingUnits());
            assertThat(row.has("lookupDisposition")).isEqualTo(call.lookupDisposition() != null);
            assertThat(row.has("observedRecordId")).isEqualTo(call.observedRecordId() != null);
            assertThat(row.has("resolvedRecordId")).isEqualTo(call.resolvedRecordId() != null);
            assertThat(row.has("publishedEffectId")).isEqualTo(call.publishedEffectId() != null);
            assertThat(row.has("receipt")).isEqualTo(call.receipt() != null);
            assertThat(row.has("resolution")).isEqualTo(call.resolution() != null);
            if (call.receipt() != null) {
                var fields = row.path("receipt").propertyNames();
                assertThat(fields).containsExactlyInAnyOrder("effectId", "units");
            }
        }
    }

    @Test
    void maximumLegalIdsCallsStepsUnitsAndExpirySerializeWithoutAGiantCommittedFixture() {
        for (Mode mode : Mode.values()) {
            var input = maximumInput(mode);
            var result = simulator.run(input);
            byte[] inputJson = mapper.writeValueAsBytes(input);
            byte[] resultJson = mapper.writeValueAsBytes(result);
            assertThat(input.calls()).hasSize(12).allSatisfy(call -> {
                assertThat(call.id()).hasSize(32);
                assertThat(call.tenantId()).hasSize(32);
                assertThat(call.key()).hasSize(32);
                assertThat(call.operationId()).hasSize(32);
            });
            assertThat(input.schedule()).hasSize(48).allSatisfy(step -> assertThat(step.id()).hasSize(32));
            assertThat(result.outcomes()).hasSize(48);
            assertThat(result.metrics().publishedEffects()).isEqualTo(12);
            assertThat(result.metrics().publishedUnits()).isEqualTo(12000);
            assertThat(result.metrics().finalTimeMs()).isEqualTo(10000);
            assertThat(result.finalState().calls()).allSatisfy(call -> assertThat(call.pendingUnits()).isZero());
            if (mode == Mode.NO_DEDUP) assertThat(result.finalState().keyRecords()).isEmpty();
            else assertThat(result.finalState().keyRecords()).hasSize(12)
                    .allSatisfy(record -> assertThat(record.expiresAtMs()).isEqualTo(20000));
            assertThat(inputJson.length).isLessThanOrEqualTo(limits.maxRequestBytes());
            assertThat(resultJson.length).isLessThanOrEqualTo(limits.maxSimulationResponseBytes());
            assertThat(mapper.readValue(resultJson, IdempotencyResult.class)).isEqualTo(result);
            System.out.printf("IDEMPOTENCY_SERIALIZATION mode=%s inputBytes=%d responseBytes=%d steps=%d effects=%d%n",
                    mode, inputJson.length, resultJson.length, result.outcomes().size(), result.metrics().publishedEffects());
        }
        // These are measurements of explicit fixtures, not universal HTTP capacity guarantees.
    }

    private static IdempotencyInput maximumInput(Mode mode) {
        var calls = new ArrayList<Call>();
        for (int i = 0; i < 12; i++) {
            String suffix = String.format("%02d", i);
            calls.add(new Call("a" + "x".repeat(29) + suffix,
                    "o" + "x".repeat(29) + suffix, "t" + "x".repeat(31),
                    "k" + "x".repeat(29) + suffix, 1000));
        }
        var schedule = new ArrayList<Step>();
        var actions = List.of(Action.LOOKUP, Action.WRITE_EFFECT, Action.SAVE_RESULT, Action.RESPOND);
        for (int phase = 0; phase < actions.size(); phase++)
            for (int i = 0; i < calls.size(); i++)
                schedule.add(new Step("s" + "x".repeat(27) + String.format("%02d%02d", phase, i),
                        calls.get(i).id(), 10000, actions.get(phase)));
        return new IdempotencyInput("1.0", "1.0.0", mode, 10000, calls, schedule);
    }
}
