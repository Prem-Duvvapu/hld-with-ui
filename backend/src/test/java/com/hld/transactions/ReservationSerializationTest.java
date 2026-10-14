package com.hld.transactions;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.api.HttpExecutionLimits;
import com.hld.transactions.ReservationInput.Action;
import com.hld.transactions.ReservationInput.Reservation;
import com.hld.transactions.ReservationInput.Step;
import com.hld.transactions.ReservationInput.Strategy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class ReservationSerializationTest {
    @Autowired ObjectMapper mapper;
    @Autowired HttpExecutionLimits limits;

    private final ReservationAnalyzer analyzer = new ReservationAnalyzer();

    @Test
    void actualUnsafeAndProtectedGoldensCannotBeRewrittenByOrdinaryVerification() throws Exception {
        assertGolden("baseline", ReservationPresets.baseline());
        assertGolden("protected", ReservationPresets.protectedBaseline());
    }

    private void assertGolden(String name, ReservationInput input) throws Exception {
        var result = analyzer.run(input);
        byte[] inputJson = mapper.writeValueAsBytes(input);
        byte[] resultJson = mapper.writeValueAsBytes(result);
        var inputFile = Path.of("../contracts/examples/transactions-isolation-" + name + "-input.json");
        var resultFile = Path.of("../contracts/examples/transactions-isolation-" + name + "-result.json");
        var generated = Path.of("target/transactions-isolation-" + name + "-result.json");
        Files.createDirectories(generated.getParent());
        Files.write(generated, resultJson);
        if (Boolean.getBoolean("hld.transactions.writeExamples")) {
            Files.write(inputFile, inputJson);
            Files.write(resultFile, resultJson);
        }
        assertThat(inputFile).exists();
        assertThat(resultFile).exists();
        assertThat(mapper.readTree(Files.readAllBytes(inputFile))).isEqualTo(mapper.readTree(inputJson));
        assertThat(mapper.readTree(Files.readAllBytes(resultFile))).isEqualTo(mapper.readTree(resultJson));
        assertThat(result.outcomes()).hasSize(4);
        assertThat(result.finalState().remainingUnits()).isZero();
        assertThat(result.finalState().allocatedUnits()).isEqualTo(name.equals("baseline") ? 2 : 1);
        assertThat(result.metrics().invariantStatus()).isEqualTo(name.equals("baseline")
                ? ReservationResult.InvariantStatus.VIOLATED : ReservationResult.InvariantStatus.PRESERVED);
    }

    @Test
    void configuredMapperRoundTripsEveryPresetAndPreservesVariantOmissions() {
        for (var preset : ReservationPresets.all()) {
            byte[] inputJson = mapper.writeValueAsBytes(preset.input());
            assertThat(mapper.readValue(inputJson, ReservationInput.class)).isEqualTo(preset.input());
            var result = analyzer.run(preset.input());
            byte[] resultJson = mapper.writeValueAsBytes(result);
            assertThat(mapper.readValue(resultJson, ReservationResult.class)).isEqualTo(result);
            var tree = mapper.readTree(resultJson);
            assertThat(tree.has("events")).isFalse();
            assertThat(tree.has("seed")).isFalse();
            assertThat(tree.path("initialState").path("reservations").get(0).has("observedRemaining")).isFalse();
            for (int i = 0; i < result.outcomes().size(); i++) {
                var outcome = result.outcomes().get(i);
                var serialized = tree.path("outcomes").get(i);
                assertThat(serialized.has("timeMs")).isFalse();
                if (outcome.action() == Action.READ) {
                    assertThat(serialized.has("observedRemaining")).isTrue();
                    assertThat(serialized.has("checkedRemaining")).isFalse();
                    assertThat(serialized.has("checkSource")).isFalse();
                    assertThat(serialized.has("quantity")).isFalse();
                } else {
                    assertThat(serialized.has("observedRemaining")).isFalse();
                    assertThat(serialized.has("checkedRemaining")).isTrue();
                    assertThat(serialized.has("checkSource")).isTrue();
                    assertThat(serialized.has("quantity")).isTrue();
                }
                assertThat(serialized.has("rejectionReason"))
                        .isEqualTo(outcome.kind() == ReservationResult.Kind.RESERVATION_REJECTED);
            }
            assertThat(tree.path("metrics").has("firstViolationStepId"))
                    .isEqualTo(result.metrics().invariantStatus() == ReservationResult.InvariantStatus.VIOLATED);
            assertThat(result.outcomes().get(result.outcomes().size() - 1).postState()).isEqualTo(result.finalState());
        }
    }

    @Test
    void fourActorsEightSnapshotsAndMaximalIdentifiersFitActualDefaultWireLimits() {
        var reservations = new ArrayList<Reservation>();
        var schedule = new ArrayList<Step>();
        for (int i = 0; i < 4; i++) {
            String suffix = String.valueOf((char) ('a' + i));
            String actor = "a" + "x".repeat(30) + suffix;
            reservations.add(new Reservation(actor, 20));
            schedule.add(new Step("r" + "x".repeat(30) + suffix, actor, Action.READ));
        }
        for (int i = 0; i < 4; i++) {
            String suffix = String.valueOf((char) ('a' + i));
            schedule.add(new Step("s" + "x".repeat(30) + suffix,
                    reservations.get(i).id(), Action.ATTEMPT_RESERVE));
        }
        for (Strategy strategy : Strategy.values()) {
            var input = new ReservationInput("1.0", "1.0.0", strategy, 20, reservations, schedule);
            var result = analyzer.run(input);
            int inputBytes = mapper.writeValueAsBytes(input).length;
            int resultBytes = mapper.writeValueAsBytes(result).length;
            assertThat(inputBytes).isLessThanOrEqualTo(limits.maxRequestBytes());
            assertThat(resultBytes).isLessThanOrEqualTo(limits.maxSimulationResponseBytes());
            assertThat(result.outcomes()).hasSize(8);
            assertThat(result.finalState().reservations()).hasSize(4);
            assertThat(result.input().reservations()).allSatisfy(actor -> assertThat(actor.id()).hasSize(32));
            assertThat(result.input().schedule()).allSatisfy(step -> assertThat(step.id()).hasSize(32));
            assertThat(result.finalState().allocatedUnits()).isEqualTo(
                    strategy == Strategy.STALE_READ_WRITE ? 80 : 20);
            assertThat(result.metrics().rejectedReservations()).isEqualTo(
                    strategy == Strategy.STALE_READ_WRITE ? 0 : 3);
            System.out.printf("RESERVATION_SERIALIZATION strategy=%s inputBytes=%d responseBytes=%d steps=%d%n",
                    strategy, inputBytes, resultBytes, result.outcomes().size());
        }
    }
}
