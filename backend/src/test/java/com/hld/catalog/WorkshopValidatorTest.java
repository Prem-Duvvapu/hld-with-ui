package com.hld.catalog;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class WorkshopValidatorTest {
    private static final List<String> SOURCES = List.of("rfc-http");
    private final CatalogEntry draft = entry("url-shortener", "case-study", "draft");
    private final CatalogEntry topic = entry("cache-aside", "topic", "published");
    private final Workshop.WorkshopStage stage = new Workshop.WorkshopStage(
            "requirements", "Requirements", "State assumptions.", "Defend constraints.",
            List.of(new Workshop.RubricCriterion("invariant", "Preserve each live mapping.")),
            List.of(new Workshop.ExperimentLink("cache-aside", "Cache experiment", "Compare stale reads.")), SOURCES);

    private static CatalogEntry entry(String id, String kind, String status) {
        return entry(id, kind, status, kind.equals("case-study")
                ? List.of("case-study") : List.of("study", "simulation"));
    }

    private static CatalogEntry entry(String id, String kind, String status, List<String> capabilities) {
        return new CatalogEntry(id, kind, "Title", "Summary", "Design", "Intermediate", 1, status,
                List.of(), List.of("Explain"), capabilities,
                null, null, "case-studies/" + id + "/resources.json", null,
                kind.equals("case-study") ? "case-studies/" + id + "/workshop.json" : null,
                List.of(), List.of(), "1.0.0", "2026-10-08", SOURCES);
    }

    private Workshop workshop(List<Workshop.WorkshopStage> stages) {
        return new Workshop(1, "url-shortener", "1.0.0", "Choose a product contract.", "A live code has one destination.", stages);
    }

    private Workshop.WorkshopStage changedStage(String id, List<Workshop.RubricCriterion> rubric,
            List<Workshop.ExperimentLink> links, List<String> sources) {
        return new Workshop.WorkshopStage(id, stage.title(), stage.prompt(), stage.reference(), rubric, links, sources);
    }

    @Test
    void acceptsOneDraftStageWithPublishedExperimentAndStableDerivedAnswerIds() {
        assertThatCode(() -> WorkshopValidator.validate(draft, workshop(List.of(stage)), List.of(draft, topic)))
                .doesNotThrowAnyException();
    }

    @Test
    void rejectsPublishedTheoryTopicsAsExperimentTargets() {
        CatalogEntry theory = entry("cache-aside", "topic", "published", List.of("study", "practice"));
        assertThatThrownBy(() -> WorkshopValidator.validate(draft, workshop(List.of(stage)), List.of(theory)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("simulation or estimator");
    }

    @Test
    void rejectsCrossStageCollisionsBetweenRubricChecksAndAttemptOrRevisionRecords() {
        for (String suffix : List.of("attempt", "revision")) {
            var first = changedStage("scope",
                    List.of(new Workshop.RubricCriterion("x-" + suffix, "Check this constraint")),
                    stage.experimentLinks(), SOURCES);
            var second = changedStage("scope-check-x", stage.rubric(), stage.experimentLinks(), SOURCES);
            assertThatThrownBy(() -> WorkshopValidator.validate(draft, workshop(List.of(first, second)), List.of(topic)))
                    .isInstanceOf(IllegalStateException.class).hasMessageContaining("duplicate derived activity ID");
        }
    }

    @Test
    void rejectsMismatchedIdentityVersionAndSchema() {
        for (Workshop invalid : List.of(
                new Workshop(2, "url-shortener", "1.0.0", "Intro", "Invariant", List.of(stage)),
                new Workshop(1, "other-workshop", "1.0.0", "Intro", "Invariant", List.of(stage)),
                new Workshop(1, "url-shortener", "1.0.1", "Intro", "Invariant", List.of(stage)),
                new Workshop(1, "url-shortener", "latest", "Intro", "Invariant", List.of(stage)))) {
            assertThatThrownBy(() -> WorkshopValidator.validate(draft, invalid, List.of(topic)))
                    .isInstanceOf(IllegalStateException.class);
        }
    }

    @Test
    void rejectsBlankOversizedMissingAndDuplicateLearningStages() {
        for (Workshop invalid : List.of(
                workshop(List.of()), workshop(List.of(stage, stage)),
                new Workshop(1, "url-shortener", "1.0.0", " ", "Invariant", List.of(stage)),
                new Workshop(1, "url-shortener", "1.0.0", "Intro", "x".repeat(10_001), List.of(stage)),
                workshop(List.of(changedStage("invalid/id", stage.rubric(), stage.experimentLinks(), SOURCES))))) {
            assertThatThrownBy(() -> WorkshopValidator.validate(draft, invalid, List.of(topic)))
                    .isInstanceOf(IllegalStateException.class);
        }
    }

    @Test
    void rejectsEmptyDuplicateRubricAndUnusableDerivedActivityIds() {
        var criterion = stage.rubric().get(0);
        for (var invalid : List.of(
                changedStage("requirements", List.of(), stage.experimentLinks(), SOURCES),
                changedStage("requirements", List.of(criterion, criterion), stage.experimentLinks(), SOURCES),
                changedStage("s".repeat(95), stage.rubric(), stage.experimentLinks(), SOURCES),
                changedStage("requirements", List.of(new Workshop.RubricCriterion("r".repeat(90), "Prompt")), stage.experimentLinks(), SOURCES))) {
            assertThatThrownBy(() -> WorkshopValidator.validate(draft, workshop(List.of(invalid)), List.of(topic)))
                    .isInstanceOf(IllegalStateException.class);
        }
    }

    @Test
    void requiresSourcesDeclaredByTheCatalogAndUniquePublishedTopicLinks() {
        var link = stage.experimentLinks().get(0);
        for (var invalid : List.of(
                changedStage("requirements", stage.rubric(), List.of(link), List.of("unlisted-source")),
                changedStage("requirements", stage.rubric(), List.of(link), List.of()),
                changedStage("requirements", stage.rubric(), List.of(link, link), SOURCES),
                changedStage("requirements", stage.rubric(), List.of(new Workshop.ExperimentLink("url-shortener", "Wrong kind", "Explain")), SOURCES))) {
            assertThatThrownBy(() -> WorkshopValidator.validate(draft, workshop(List.of(invalid)), List.of(draft, topic)))
                    .isInstanceOf(IllegalStateException.class);
        }
        for (String status : List.of("draft", "planned")) {
            assertThatThrownBy(() -> WorkshopValidator.validate(draft, workshop(List.of(stage)),
                    List.of(entry("cache-aside", "topic", status))))
                    .isInstanceOf(IllegalStateException.class);
        }
    }

    @Test
    void draftCanBeDeliveredBeforeCompletionButPublishedWorkshopNeedsTheFullDesignPath() {
        CatalogEntry published = entry("url-shortener", "case-study", "published");
        assertThatThrownBy(() -> WorkshopValidator.validate(published, workshop(List.of(stage)), List.of(topic)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("every design stage");
        List<Workshop.WorkshopStage> complete = new ArrayList<>();
        for (String id : Set.of("requirements", "estimates", "api", "data", "baseline", "flows", "evolution", "failures", "operations", "defense")) {
            complete.add(changedStage(id, stage.rubric(), stage.experimentLinks(), SOURCES));
        }
        assertThatCode(() -> WorkshopValidator.validate(published, workshop(complete), List.of(topic)))
                .doesNotThrowAnyException();
    }
}
