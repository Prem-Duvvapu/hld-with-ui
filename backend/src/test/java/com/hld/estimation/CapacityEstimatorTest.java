package com.hld.estimation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class CapacityEstimatorTest {
    private final CapacityEstimator estimator = new CapacityEstimator();

    @Test
    void reconcilesThePublishedBaselineByHand() {
        CapacityEstimateResult result = estimator.calculate(input(5, 90));

        assertThat(result.metrics().dailyRequests()).isEqualTo(10_000_000);
        assertThat(result.metrics().averageRequestsPerSecond()).isCloseTo(115.7407, within(0.0001));
        assertThat(result.metrics().peakRequestsPerSecond()).isCloseTo(578.7037, within(0.0001));
        assertThat(result.metrics().peakReadsPerSecond()).isCloseTo(520.8333, within(0.0001));
        assertThat(result.metrics().peakWritesPerSecond()).isCloseTo(57.8704, within(0.0001));
        assertThat(result.metrics().rawStorageGigabytes()).isEqualTo(365);
        assertThat(result.metrics().replicatedStorageGigabytes()).isEqualTo(1_095);
        assertThat(result.metrics().dailyResponseGigabytes()).isEqualTo(20);
        assertThat(result.metrics().peakResponseMegabitsPerSecond()).isCloseTo(9.2593, within(0.0001));
        assertThat(result.metrics().meanConcurrentRequests()).isCloseTo(115.7407, within(0.0001));
        assertThat(result.steps()).hasSize(9);
        assertThat(result.sensitivity()).extracting(SensitivityPoint::id).containsExactly("low", "base", "high");
    }

    @Test
    void peakFactorChangesPeakDemandWithoutChangingDailyStorage() {
        CapacityEstimateResult base = estimator.calculate(input(5, 90));
        CapacityEstimateResult burstier = estimator.calculate(input(10, 90));

        assertThat(burstier.metrics().peakRequestsPerSecond())
                .isEqualTo(base.metrics().peakRequestsPerSecond() * 2);
        assertThat(burstier.metrics().peakResponseMegabitsPerSecond())
                .isEqualTo(base.metrics().peakResponseMegabitsPerSecond() * 2);
        assertThat(burstier.metrics().rawStorageGigabytes()).isEqualTo(base.metrics().rawStorageGigabytes());
    }

    @Test
    void rejectsAnIncompatibleSchemaVersion() {
        CapacityEstimateInput input = new CapacityEstimateInput(
                "2.0", 1_000_000, 10, 5, 90, 1, 2, 365, 3, 200, 30);
        assertThatThrownBy(() -> estimator.calculate(input))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("schemaVersion must be 1.0");
    }

    private CapacityEstimateInput input(double peakFactor, double readPercentage) {
        return new CapacityEstimateInput(
                "1.0", 1_000_000, 10, peakFactor, readPercentage, 1, 2, 365, 3, 200, 30);
    }

    private static org.assertj.core.data.Offset<Double> within(double value) {
        return org.assertj.core.data.Offset.offset(value);
    }
}
