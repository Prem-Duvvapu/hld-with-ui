package com.hld.atomicity;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.api.HttpExecutionLimits;
import com.hld.atomicity.AtomicityInput.Action;
import com.hld.atomicity.AtomicityInput.Mode;
import com.hld.atomicity.AtomicityInput.Step;
import com.hld.atomicity.AtomicityInput.Transaction;
import com.hld.atomicity.AtomicityResult.InvariantStatus;
import com.hld.atomicity.AtomicityResult.Kind;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.ObjectMapper;

/** The configured wire representation is frozen separately from the Java domain expectations. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class AtomicitySerializationTest {
    @Autowired ObjectMapper mapper;
    @Autowired HttpExecutionLimits limits;
    private final AtomicityAnalyzer analyzer = new AtomicityAnalyzer();

    @Test
    void actualGoldensCompareWithoutRewritingDuringOrdinaryVerification() throws Exception {
        assertGolden("baseline", preset("baseline"));
        assertGolden("protected", preset("protected-baseline"));
        assertGolden("conflict", preset("protected-conflict"));
        assertGolden("max-boundary", maximumInput(Mode.STAGED_VERSION_CHECK));
    }

    private AtomicityInput preset(String id) {
        return AtomicityPresets.all().stream().filter(value -> value.id().equals(id))
                .findFirst().orElseThrow().input();
    }

    private void assertGolden(String name, AtomicityInput input) throws Exception {
        var result = analyzer.run(input);
        byte[] inputJson = mapper.writeValueAsBytes(input);
        byte[] resultJson = mapper.writeValueAsBytes(result);
        var inputFile = Path.of("../contracts/examples/transaction-atomicity-" + name + "-input.json");
        var resultFile = Path.of("../contracts/examples/transaction-atomicity-" + name + "-result.json");
        var generated = Path.of("target/transaction-atomicity-" + name + "-result.json");
        Files.write(generated, resultJson);
        if (Boolean.getBoolean("hld.atomicity.writeExamples")) {
            Files.write(inputFile, inputJson);
            Files.write(resultFile, resultJson);
        }
        assertThat(inputFile).exists();
        assertThat(resultFile).exists();
        assertThat(mapper.readTree(Files.readAllBytes(inputFile))).isEqualTo(mapper.readTree(inputJson));
        assertThat(mapper.readTree(Files.readAllBytes(resultFile))).isEqualTo(mapper.readTree(resultJson));
        assertThat(result.outcomes()).hasSize(input.schedule().size());
        assertThat(result.metrics().invariantStatus()).isEqualTo(name.equals("baseline")
                ? InvariantStatus.VIOLATED : InvariantStatus.PRESERVED);
        if (name.equals("baseline")) {
            assertThat(result.finalState().remainingUnits()).isZero();
            assertThat(result.finalState().allocatedUnits()).isZero();
            assertThat(result.finalState().invariants().abortedEffectsAbsent()).isFalse();
        } else if (name.equals("protected")) {
            assertThat(result.finalState().remainingUnits()).isEqualTo(1);
            assertThat(result.finalState().allocatedUnits()).isZero();
        } else {
            assertThat(result.metrics().committedTransactions()).isEqualTo(1);
            assertThat(result.metrics().conflictedTransactions()).isEqualTo(name.equals("conflict") ? 1 : 2);
        }
    }

    @Test
    void configuredMapperRoundTripsAllPresetsAndOmitsInapplicableEvidence() {
        assertThat(AtomicityPresets.all()).hasSize(8);
        for (var preset : AtomicityPresets.all()) {
            var input = preset.input();
            assertThat(mapper.readValue(mapper.writeValueAsBytes(input), AtomicityInput.class)).isEqualTo(input);
            var result = analyzer.run(input);
            byte[] json = mapper.writeValueAsBytes(result);
            assertThat(mapper.readValue(json, AtomicityResult.class)).isEqualTo(result);
            var tree = mapper.readTree(json);
            assertThat(tree.has("events")).isFalse();
            assertThat(tree.has("seed")).isFalse();
            for (int index = 0; index < result.outcomes().size(); index++) {
                var outcome = result.outcomes().get(index);
                var serialized = tree.path("outcomes").get(index);
                assertThat(serialized.has("timeMs")).isFalse();
                assertThat(serialized.has("checkedRemaining")).isEqualTo(outcome.action() == Action.DECREMENT_STOCK);
                assertThat(serialized.has("checkSource")).isEqualTo(outcome.action() == Action.DECREMENT_STOCK);
                assertThat(serialized.has("expectedRevision")).isEqualTo(outcome.expectedRevision() != null);
                assertThat(serialized.has("actualRevision")).isEqualTo(outcome.expectedRevision() != null);
                assertThat(serialized.has("reason")).isEqualTo(List.of(Kind.STOCK_REJECTED,
                        Kind.WORK_SKIPPED, Kind.TRANSACTION_ABORTED).contains(outcome.kind()));
                for (int actorIndex = 0; actorIndex < outcome.postState().transactions().size(); actorIndex++) {
                    var actor = outcome.postState().transactions().get(actorIndex);
                    var actorJson = serialized.path("postState").path("transactions").get(actorIndex);
                    assertThat(actorJson.has("workingRemaining")).isEqualTo(actor.workingRemaining() != null);
                    assertThat(actorJson.has("pendingAllocation")).isEqualTo(actor.pendingAllocation() != null);
                    assertThat(actorJson.has("failureReason")).isEqualTo(actor.failureReason() != null);
                }
            }
            assertThat(tree.path("metrics").has("firstViolationStepId"))
                    .isEqualTo(result.metrics().invariantStatus() == InvariantStatus.VIOLATED);
            assertThat(result.finalState()).isEqualTo(result.outcomes().get(result.outcomes().size() - 1).postState());
        }
    }

    @Test
    void maximalActorIdsAndTwelveSnapshotsFitTheActualDefaultWireLimits() {
        for (Mode mode : Mode.values()) {
            var input = maximumInput(mode);
            var result = analyzer.run(input);
            int inputBytes = mapper.writeValueAsBytes(input).length;
            int resultBytes = mapper.writeValueAsBytes(result).length;
            assertThat(inputBytes).isLessThanOrEqualTo(limits.maxRequestBytes());
            assertThat(resultBytes).isLessThanOrEqualTo(limits.maxSimulationResponseBytes());
            assertThat(result.outcomes()).hasSize(12);
            assertThat(input.transactions()).allSatisfy(actor -> assertThat(actor.id()).hasSize(32));
            assertThat(input.schedule()).allSatisfy(step -> assertThat(step.id()).hasSize(32));
            assertThat(result.finalState().remainingUnits()).isZero();
            assertThat(result.finalState().allocatedUnits()).isEqualTo(20);
            assertThat(result.metrics().committedTransactions()).isEqualTo(1);
            assertThat(result.metrics().abortedTransactions()).isEqualTo(2);
            assertThat(result.metrics().conflictedTransactions()).isEqualTo(mode == Mode.STAGED_VERSION_CHECK ? 2 : 0);
            System.out.printf("ATOMICITY_SERIALIZATION mode=%s inputBytes=%d responseBytes=%d steps=%d%n",
                    mode, inputBytes, resultBytes, result.outcomes().size());
        }
    }

    private static AtomicityInput maximumInput(Mode mode) {
        var actors = new ArrayList<Transaction>();
        var steps = new ArrayList<Step>();
        for (int index = 0; index < 3; index++)
            actors.add(new Transaction("a" + "x".repeat(30) + index, 20));
        var actions = List.of(Action.BEGIN, Action.DECREMENT_STOCK, Action.RECORD_ALLOCATION, Action.COMMIT);
        for (int actionIndex = 0; actionIndex < actions.size(); actionIndex++) {
            for (int actorIndex = 0; actorIndex < actors.size(); actorIndex++) {
                String id = "s" + "x".repeat(29) + actionIndex + actorIndex;
                steps.add(new Step(id, actors.get(actorIndex).id(), actions.get(actionIndex)));
            }
        }
        return new AtomicityInput("1.0", "1.0.0", mode, 20, actors, steps);
    }
}
