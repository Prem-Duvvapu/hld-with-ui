package com.hld.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** Authored contract checks; these do not claim to execute a shortening database. */
@SpringBootTest
class WorkshopWalkthroughTest {
    @Autowired CatalogService catalog;

    private CaseStudyDetail detail() { return catalog.caseStudy("url-shortener"); }
    private Workshop.WorkshopStage stage(String id) {
        return detail().workshop().stages().stream().filter(item -> id.equals(item.id())).findFirst().orElseThrow();
    }
    private void validate(List<Workshop.Walkthrough> diagrams) {
        var original = stage("baseline");
        var changed = new Workshop.WorkshopStage(original.id(), original.title(), original.prompt(), original.reference(),
                original.rubric(), original.experimentLinks(), original.sourceIds(), diagrams);
        var workshop = detail().workshop();
        WorkshopValidator.validate(detail().entry(), new Workshop(workshop.schemaVersion(), workshop.id(), workshop.contentVersion(),
                workshop.introduction(), workshop.invariant(), List.of(changed)), catalog.publishedTopics());
    }
    @Test
    void legacyStagesHaveAnImmutableEmptyWalkthroughListAndNewPathsHaveStableIds() {
        assertThat(stage("requirements").walkthroughs()).isEmpty();
        assertThat(stage("flows").walkthroughs()).extracting(Workshop.Walkthrough::id)
                .containsExactly("create", "resolve", "lost-response", "expired");
        assertThatThrownBy(() -> stage("flows").walkthroughs().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> stage("flows").walkthroughs().get(0).steps().clear()).isInstanceOf(UnsupportedOperationException.class);
    }
    @Test
    void rejectsUnknownParticipantsInsteadOfPublishingAnUnrenderableArrow() {
        var diagram = stage("baseline").walkthroughs().get(0);
        var step = diagram.steps().get(0);
        var bad = new Workshop.DiagramStep(step.id(), step.title(), "missing", step.to(), step.detail());
        assertThatThrownBy(() -> validate(List.of(new Workshop.Walkthrough(diagram.id(), diagram.title(), diagram.summary(), diagram.nodes(), List.of(bad)))))
                .hasMessageContaining("unknown node");
    }
    @Test
    void rejectsDuplicateParticipantsStepsAndWalkthroughIds() {
        var diagram = stage("baseline").walkthroughs().get(0);
        var repeatedNodes = new ArrayList<>(diagram.nodes()); repeatedNodes.add(diagram.nodes().get(0));
        var repeatedSteps = new ArrayList<>(diagram.steps()); repeatedSteps.add(diagram.steps().get(0));
        for (var bad : List.of(
                List.of(diagram, diagram),
                List.of(new Workshop.Walkthrough(diagram.id(), diagram.title(), diagram.summary(), repeatedNodes, diagram.steps())),
                List.of(new Workshop.Walkthrough(diagram.id(), diagram.title(), diagram.summary(), diagram.nodes(), repeatedSteps)))) {
            assertThatThrownBy(() -> validate(bad)).hasMessageContaining("duplicate");
        }
    }
    @Test
    void rejectsEmptyOversizedAndBlankDiagrams() {
        var diagram = stage("baseline").walkthroughs().get(0);
        var steps = new ArrayList<Workshop.DiagramStep>();
        for (int i = 0; i < 21; i++) steps.add(new Workshop.DiagramStep("step-" + i, "Read", "client", "service", "Detail"));
        for (var bad : List.of(
                new Workshop.Walkthrough(diagram.id(), diagram.title(), diagram.summary(), List.of(), diagram.steps()),
                new Workshop.Walkthrough(diagram.id(), diagram.title(), diagram.summary(), diagram.nodes(), List.of()),
                new Workshop.Walkthrough(diagram.id(), diagram.title(), diagram.summary(), diagram.nodes(), steps),
                new Workshop.Walkthrough(diagram.id(), " ", diagram.summary(), diagram.nodes(), diagram.steps()))) {
            assertThatThrownBy(() -> validate(List.of(bad))).isInstanceOf(IllegalStateException.class);
        }
    }
    @Test
    void successOrderingAndAlternativePathsAgreeWithTheApiPolicy() {
        var paths = stage("flows").walkthroughs();
        assertThat(paths.get(0).steps()).extracting(Workshop.DiagramStep::id)
                .containsExactly("submit", "claim", "reserve", "commit", "created");
        assertThat(paths.get(0).steps().get(3).detail()).contains("durable together", "No partial or pending result");
        assertThat(paths.get(2).steps().get(4).detail()).contains("original status/body/Location", "Replay never extends expiry");
        assertThat(paths.get(3).steps().get(2).title()).contains("now >= expiresAt");
        assertThat(paths.get(3).steps().get(3).detail()).contains("unknown or taken-down", "No destination request");
        assertThat(stage("data").reference()).contains("ON CONFLICT (code) DO NOTHING", "maximum of five candidate attempts", "24 hours");
        assertThat(stage("baseline").reference()).contains("in-flight redirect", "additional coordination or fencing");
        assertThat(stage("flows").reference()).contains("Store unavailable", "503, not 404", "future-expiry validation");
    }
}
