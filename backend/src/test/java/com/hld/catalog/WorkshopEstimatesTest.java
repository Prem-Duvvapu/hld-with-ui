package com.hld.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.api.EstimatorController;
import com.hld.estimation.CapacityEstimateInput;
import com.hld.estimation.CapacityEstimator;
import com.hld.estimation.CapacityMetrics;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** Check authored estimates against the actual Java preset and calculator, not a second formula. */
@SpringBootTest
class WorkshopEstimatesTest {
    @Autowired CatalogService catalog;
    @Autowired EstimatorController descriptors;
    @Autowired CapacityEstimator estimator;

    private CapacityEstimateInput baseline() {
        var preset = descriptors.descriptor("capacity-estimation").presets().stream()
                .filter(candidate -> "baseline".equals(candidate.id())).findFirst().orElseThrow();
        assertThat(preset.title()).isEqualTo("Interview baseline");
        return preset.input();
    }

    private String reference(String stage) {
        return catalog.caseStudy("url-shortener").workshop().stages().stream()
                .filter(candidate -> candidate.id().equals(stage)).findFirst().orElseThrow().reference();
    }

    private static String formatted(double value) {
        return String.format(Locale.ROOT, "%,.2f", value);
    }

    private static String whole(double value) {
        return String.format(Locale.ROOT, "%,.0f", value);
    }

    private static void claim(String reference, double value, String unit) {
        assertThat(reference).contains("**" + formatted(value) + " " + unit + "**");
    }

    private static CapacityEstimateInput changed(CapacityEstimateInput base, double peak, double reads, double recordKb) {
        return new CapacityEstimateInput(base.schemaVersion(), base.dailyActiveUsers(), base.requestsPerUserPerDay(),
                peak, reads, recordKb, base.responseSizeKb(), base.retentionDays(), base.replicationFactor(),
                base.meanLatencyMs(), base.headroomPercentage());
    }

    @Test
    void theAuthoredBaselineIsTheActualInterviewPresetWithItsUnitsAndLimitations() {
        CapacityEstimateInput input = baseline();
        assertThat(input).isEqualTo(new CapacityEstimateInput("1.0", 1_000_000, 10, 5, 90, 1, 2, 365, 3, 200, 30));
        CapacityMetrics metrics = estimator.calculate(input).metrics();
        String ref = reference("estimates").split("### Change one assumption")[0];
        assertThat(ref).contains("1,000,000 daily users × 10 operations", "1 kB = 1,000 bytes",
                "**" + whole(metrics.dailyRequests()) + " requests/day**",
                "**" + whole(metrics.dailyWrites()) + " writes/day**",
                "**" + whole(metrics.rawStorageGigabytes()) + " GB raw**",
                "**" + whole(metrics.replicatedStorageGigabytes()) + " GB**",
                "**" + whole(metrics.dailyResponseGigabytes()) + " GB/day**",
                "**" + formatted(metrics.meanConcurrentRequests()) + " requests**");
        claim(ref, metrics.averageRequestsPerSecond(), "requests/s");
        claim(ref, metrics.peakRequestsPerSecond(), "requests/s");
        claim(ref, metrics.peakReadsPerSecond(), "reads/s");
        claim(ref, metrics.peakWritesPerSecond(), "writes/s");
        claim(ref, metrics.peakResponseMegabitsPerSecond(), "Mb/s");
        claim(ref, metrics.peakRequestsWithHeadroom(), "requests/s");
        assertThat(reference("estimates")).contains("not 116 CPU workers", "mean does not establish a percentile",
                "permanent code-reservation registry", "24-hour create-retry records");
    }

    @Test
    void doublingPeakOnlyChangesTheAuthoredBusyPeriodQuantities() {
        CapacityEstimateInput input = baseline();
        CapacityMetrics base = estimator.calculate(input).metrics();
        CapacityMetrics peak = estimator.calculate(changed(input, 10, 90, 1)).metrics();
        String ref = reference("estimates").split("1\\. \\*\\*Peak factor 10:")[1].split("2\\. \\*\\*Read percentage")[0];
        claim(ref, peak.peakRequestsPerSecond(), "requests/s");
        claim(ref, peak.peakReadsPerSecond(), "reads/s");
        claim(ref, peak.peakWritesPerSecond(), "writes/s");
        claim(ref, peak.peakResponseMegabitsPerSecond(), "Mb/s");
        assertThat(peak.dailyRequests()).isEqualTo(base.dailyRequests());
        assertThat(peak.dailyWrites()).isEqualTo(base.dailyWrites());
        assertThat(peak.rawStorageGigabytes()).isEqualTo(base.rawStorageGigabytes());
        assertThat(ref).contains("**" + whole(base.rawStorageGigabytes()) + " GB raw** stay fixed");
    }

    @Test
    void changingTheReadFractionChangesNewRecordsButNotTotalArrivalsOrPayload() {
        CapacityEstimateInput input = baseline();
        CapacityMetrics base = estimator.calculate(input).metrics();
        CapacityMetrics reads = estimator.calculate(changed(input, 5, 99, 1)).metrics();
        String ref = reference("estimates").split("2\\. \\*\\*Read percentage 99:")[1].split("3\\. \\*\\*Record size")[0];
        claim(ref, reads.peakReadsPerSecond(), "reads/s");
        claim(ref, reads.peakWritesPerSecond(), "writes/s");
        assertThat(ref).contains("**" + whole(reads.dailyWrites()) + " writes/day**",
                "**" + reads.rawStorageGigabytes() + " GB**", "**" + reads.replicatedStorageGigabytes() + " GB**");
        assertThat(reads.peakRequestsPerSecond()).isEqualTo(base.peakRequestsPerSecond());
        assertThat(reads.peakResponseMegabitsPerSecond()).isEqualTo(base.peakResponseMegabitsPerSecond());
        assertThat(ref).contains("not simply on adding a cache");
    }

    @Test
    void recordSizeChangesStoredBytesIndependentlyOfResponsePayloadSize() {
        CapacityEstimateInput input = baseline();
        CapacityMetrics base = estimator.calculate(input).metrics();
        CapacityMetrics larger = estimator.calculate(changed(input, 5, 90, 5)).metrics();
        String ref = reference("estimates").split("3\\. \\*\\*Record size 5 kB:")[1].split("### What this estimate")[0];
        assertThat(ref).contains("**" + whole(larger.rawStorageGigabytes()) + " GB**",
                "**" + whole(larger.replicatedStorageGigabytes()) + " GB**");
        claim(ref, larger.peakResponseMegabitsPerSecond(), "Mb/s");
        assertThat(larger.peakRequestsPerSecond()).isEqualTo(base.peakRequestsPerSecond());
        assertThat(larger.peakResponseMegabitsPerSecond()).isEqualTo(base.peakResponseMegabitsPerSecond());
        assertThat(larger.rawStorageGigabytes()).isEqualTo(base.rawStorageGigabytes() * 5);
    }

    @Test
    void missingDefenseStillPreventsPublicationEvenAfterTenStagesAreAuthored() {
        CaseStudyDetail detail = catalog.caseStudy("url-shortener");
        CatalogEntry entry = detail.entry();
        CatalogEntry published = new CatalogEntry(entry.id(), entry.kind(), entry.title(), entry.summary(),
                entry.category(), entry.level(), entry.order(), "published", entry.prerequisites(), entry.outcomes(),
                entry.capabilities(), entry.lessonPath(), entry.questionsPath(), entry.resourcesPath(), entry.checkpointsPath(),
                entry.workshopPath(), entry.simulationIds(), entry.estimatorIds(), entry.contentVersion(), entry.reviewedAt(), entry.sourceIds());
        assertThat(detail.workshop().stages()).extracting(Workshop.WorkshopStage::id).containsExactly("requirements", "estimates", "api", "data", "baseline", "flows", "evolution", "failures", "operations", "defense");
        assertThat(entry.status()).isEqualTo("draft");
        Workshop incomplete = new Workshop(detail.workshop().schemaVersion(), detail.workshop().id(),
                detail.workshop().contentVersion(), detail.workshop().introduction(), detail.workshop().invariant(),
                detail.workshop().stages().stream().filter(stage -> !stage.id().equals("defense")).toList());
        assertThatThrownBy(() -> WorkshopValidator.validate(published, incomplete, catalog.publishedTopics()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("every design stage");
    }

    @Test
    void apiReferencePreservesReplayAndExpiryBoundariesAndCitesTheCorrectStandards() {
        var stage = catalog.caseStudy("url-shortener").workshop().stages().stream()
                .filter(candidate -> "api".equals(candidate.id())).findFirst().orElseThrow();
        assertThat(stage.sourceIds()).contains("rfc-9110-http-semantics", "rfc-9111-http-caching", "rfc-6585-429", "rfc-3986-uri-syntax");
        assertThat(stage.reference()).contains("section-15.3.2", "section-5.2.2.5", "rfc6585#section-4",
                "before applying new-create validation", "the replay still describes the original creation",
                "24-hour window has ended", "At `now >= expiresAt`", "302 alone does not prevent caching",
                "does not invalidate our internal mapping cache", "our product contract, not a guarantee provided by HTTP");
        assertThat(stage.reference()).doesNotContain("HTTP/1.1 301", "HTTP/1.1 308");
    }
}
