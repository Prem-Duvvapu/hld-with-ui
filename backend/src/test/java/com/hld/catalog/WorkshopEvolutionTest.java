package com.hld.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.api.CacheAsideController;
import com.hld.api.EstimatorController;
import com.hld.api.SimulationController;
import com.hld.cache.CacheAsideInput;
import com.hld.cache.CacheAsideSimulator;
import com.hld.estimation.CapacityEstimator;
import com.hld.simulation.RequestFlowSimulator;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** Reconcile new workshop transfer claims with actual Java experiments. */
@SpringBootTest
class WorkshopEvolutionTest {
    @Autowired CatalogService catalog;
    @Autowired CacheAsideController caches;
    @Autowired CacheAsideSimulator cacheSimulator;
    @Autowired SimulationController flows;
    @Autowired RequestFlowSimulator flowSimulator;
    @Autowired EstimatorController estimates;
    @Autowired CapacityEstimator estimator;

    private Workshop.WorkshopStage stage(String id) {
        return catalog.caseStudy("url-shortener").workshop().stages().stream()
                .filter(stage -> stage.id().equals(id)).findFirst().orElseThrow();
    }

    private CacheAsideInput cachePreset(String id) {
        return caches.descriptor().presets().stream()
                .filter(preset -> preset.id().equals(id)).findFirst().orElseThrow().input();
    }

    private static String decimal(double value) {
        return String.format(Locale.ROOT, "%,.2f", value);
    }

    @Test
    void cacheHitRatioReducesFullMappingReadsWithoutRemovingStrictEligibilityReads() {
        var input = estimates.descriptor("capacity-estimation").presets().stream()
                .filter(preset -> preset.id().equals("baseline")).findFirst().orElseThrow().input();
        var metrics = estimator.calculate(input).metrics();
        String reference = stage("evolution").reference();
        assertThat(reference).contains("**" + decimal(metrics.peakReadsPerSecond()) + " reads/s**",
                "**" + decimal(metrics.peakReadsPerSecond() * 0.95) + " metadata-only reads/s**",
                "**" + decimal(metrics.peakReadsPerSecond() * 0.05) + " full-mapping reads/s**",
                "Total primary lookup demand remains", "one-primary-read-per-resolve", "not an observed production result");
    }

    @Test
    void coldBurstClaimNamesTheActualPresetAndDoesNotInventCoalescing() {
        var result = cacheSimulator.run(cachePreset("cold-burst"));
        assertThat(result.metrics().totalGets()).isEqualTo(5);
        assertThat(result.metrics().cacheMisses()).isEqualTo(5);
        assertThat(result.metrics().originReads()).isEqualTo(5);
        assertThat(stage("evolution").reference()).contains("five origin reads", "does not coalesce", "strict per-request eligibility");
    }

    @Test
    void cacheOutageAndOriginOutageClaimsRespectConstantAvailabilityAndTheColdInitialState() {
        var cacheDown = cacheSimulator.run(cachePreset("cache-unavailable"));
        assertThat(cacheDown.metrics().cacheBypasses()).isEqualTo(3);
        assertThat(cacheDown.metrics().originReads()).isEqualTo(3);
        assertThat(cacheDown.metrics().cacheHits()).isZero();
        assertThat(cacheDown.metrics().cacheMisses()).isZero();
        var originDown = cacheSimulator.run(cachePreset("origin-unavailable"));
        assertThat(originDown.metrics().totalGets()).isEqualTo(2);
        assertThat(originDown.metrics().failedGets()).isEqualTo(2);
        assertThat(originDown.events()).noneSatisfy(event -> assertThat(event.kind()).isIn("cache.hit", "cache.fill"));
        assertThat(stage("failures").reference()).contains("three bypass", "three origin reads", "starts with an empty cache",
                "availability flags are constant", "Both fail");
    }

    @Test
    void staleValueTransferHasActualVersionEvidenceAndChangedTtlRemovesItsHits() {
        var input = cachePreset("baseline");
        var result = cacheSimulator.run(input);
        assertThat(result.metrics().staleReads()).isEqualTo(1);
        assertThat(result.outcomes()).anySatisfy(outcome -> {
            assertThat(outcome.requestTimeMs()).isEqualTo(70);
            assertThat(outcome.returnedValue()).isEqualTo("v1");
            assertThat(outcome.stale()).isTrue();
        });
        var noRetention = new CacheAsideInput(input.schemaVersion(), input.modelVersion(), input.cacheLookupLatencyMs(),
                input.originReadLatencyMs(), 0, input.initialOriginValue(), input.operations(), input.cacheAvailable(),
                input.originAvailable(), input.seed());
        var changed = cacheSimulator.run(noRetention);
        assertThat(changed.metrics().cacheHits()).isZero();
        assertThat(changed.metrics().originReads()).isEqualTo(4);
        assertThat(stage("failures").reference()).contains("70 ms", "40 ms", "not a short link silently changing destination ownership");
    }

    @Test
    void overloadAndRetryArithmeticAreScopedWithoutPretendingRetriesWereSimulated() {
        var input = flows.descriptor("request-flow").presets().stream()
                .filter(preset -> preset.id().equals("overload")).findFirst().orElseThrow().input();
        var result = flowSimulator.run(input);
        assertThat(result.metrics().completed()).isEqualTo(4);
        assertThat(result.metrics().rejected()).isEqualTo(2);
        assertThat(stage("failures").reference()).contains("four requests", "two requests", "not a database hot-key benchmark",
                "27 leaf attempts", "includes the initial call", "not an observed production load");
    }

    @Test
    void strictSuccessAndFailurePathsKeepTheCurrentEligibilityAndStatusBoundary() {
        var hit = stage("evolution").walkthroughs().get(0);
        assertThat(hit.steps()).extracting(Workshop.DiagramStep::id)
                .containsExactly("get", "hit", "eligibility", "check", "redirect");
        var failures = stage("failures").walkthroughs();
        assertThat(failures).extracting(Workshop.Walkthrough::id)
                .containsExactly("cache-outage", "primary-outage", "stale-revoked", "stale-expired");
        assertThat(failures.get(1).steps().get(3).detail()).contains("no success redirect", "Do not misreport 404");
        assertThat(failures.get(2).steps().get(3).detail()).contains("without Location", "does not cancel a response already authorized");
        assertThat(failures.get(3).steps().get(2).title()).contains("now >= expiresAt");
        assertThat(stage("evolution").reference()).contains("TTL measured from a delayed fill", "older in-flight read from refilling");
    }
}
