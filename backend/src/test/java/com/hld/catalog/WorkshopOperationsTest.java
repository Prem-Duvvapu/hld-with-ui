package com.hld.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.api.EstimatorController;
import com.hld.estimation.CapacityEstimator;
import java.math.BigDecimal;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** Check the worked operational budget and speaking scaffold against their stated evidence. */
@SpringBootTest
class WorkshopOperationsTest {
    @Autowired CatalogService catalog;
    @Autowired EstimatorController estimates;
    @Autowired CapacityEstimator estimator;

    private Workshop.WorkshopStage stage(String id) {
        return catalog.caseStudy("url-shortener").workshop().stages().stream()
                .filter(stage -> stage.id().equals(id)).findFirst().orElseThrow();
    }

    @Test
    void theIllustrativeBudgetCountsUnavailableAndRejectedResolvesWithoutPretendingToMeasureAnSlo() {
        int allowed = BigDecimal.valueOf(100_000).multiply(BigDecimal.ONE.subtract(new BigDecimal("0.999"))).intValueExact();
        int remaining = allowed - 80;
        assertThat(stage("operations").reference()).contains("**" + allowed + " failed resolves**",
                "**" + remaining + " remain**", "not a deployed measurement", "rolling 30 days",
                "destination-site loading is excluded", "overload rejection of a well-formed resolve also counts as failure",
                "A wrong destination is a correctness failure", "A fast 503");
    }

    @Test
    void speakingScaffoldUsesTheActualEstimatorAndDoesNotClaimMeasuredCapacity() {
        var input = estimates.descriptor("capacity-estimation").presets().stream()
                .filter(preset -> preset.id().equals("baseline")).findFirst().orElseThrow().input();
        var metrics = estimator.calculate(input).metrics();
        assertThat(stage("defense").reference()).contains(
                String.format(Locale.ROOT, "%,.0f operations/day", metrics.dailyRequests()),
                String.format(Locale.ROOT, "%.2f peak reads/s", metrics.peakReadsPerSecond()),
                String.format(Locale.ROOT, "%.2f peak writes/s", metrics.peakWritesPerSecond()),
                "not a timed practice tool", "it has no running short-link service", "not a database throughput benchmark");
    }

    @Test
    void incidentAndRolloutTextKeepTheStrictEligibilityAndDurableOwnershipBoundaries() {
        var operations = stage("operations");
        var incident = operations.walkthroughs().stream().filter(path -> path.id().equals("incident-response")).findFirst().orElseThrow();
        var rollout = operations.walkthroughs().stream().filter(path -> path.id().equals("compatible-rollout")).findFirst().orElseThrow();
        assertThat(incident.steps()).extracting(Workshop.DiagramStep::id).containsExactly("observe", "budget", "fallback", "preserve", "verify");
        assertThat(incident.steps().get(3).detail()).contains("503 with no Location", "404", "never authorizes fallback");
        assertThat(rollout.steps().get(rollout.steps().size() - 1).detail()).contains("Never truncate", "release a code reservation");
        assertThat(operations.reference()).contains("Retain 503",
                "Never release permanent code reservations", "cannot truncate an already promised window",
                "stop creates or use a provably disjoint new code namespace", "adds neither authentication nor a real takedown API");
        assertThat(stage("defense").reference()).contains("warm mapping cache yields 503", "breaks the invariant",
                "Otherwise a historical bookmark", "not an automatic grade");
    }
}
