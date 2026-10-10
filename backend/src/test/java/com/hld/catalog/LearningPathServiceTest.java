package com.hld.catalog;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.io.InputStream;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

class LearningPathServiceTest {
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final CatalogService catalog = new CatalogService(mapper);
    private List<LearningPathService.Definition> definitions() throws Exception {
        try (InputStream input = new ClassPathResource("content/learning-paths.json").getInputStream()) {
            return mapper.readValue(input, new TypeReference<>() { });
        }
    }
    private LearningPathService.Definition path(List<LearningPathService.StepDefinition> steps, List<String> optional) {
        return new LearningPathService.Definition(1, "test-path", "First design", "A clear starting point", steps, optional);
    }
    private LearningPathService.StepDefinition step(String id) {
        return new LearningPathService.StepDefinition(id, "Explain the decision");
    }
    @Test void resolvesOrderPrerequisitesAndCurrentActivitiesWithoutPublishingDrafts() {
        var result = new LearningPathService(mapper, catalog).path("first-system-design");
        assertThat(result.steps()).extracting(LearningPath.Step::moduleId).containsExactly("request-flow", "capacity-estimation", "cache-aside", "url-shortener");
        assertThat(result.steps().subList(0, 3)).allSatisfy(step -> {
            assertThat(step.available()).isTrue();
            assertThat(step.entry()).isEqualTo(catalog.topic(step.moduleId()).topic());
            var topic = catalog.topic(step.moduleId());
            for (var question : topic.questions()) {
                var activity = step.activities().stream().filter(item -> item.id().equals(question.id())).findFirst().orElseThrow();
                assertThat(activity.optionIds()).containsExactlyElementsOf(question.options() == null ? List.of() : question.options().stream().map(Question.Option::id).toList());
                assertThat(activity.kind()).isEqualTo(activity.optionIds().isEmpty() ? "text" : "choice");
            }
            for (var checkpoint : topic.checkpoints()) {
                assertThat(step.activities()).extracting(LearningPath.Activity::id).contains(checkpoint.id() + "-prediction", checkpoint.id() + "-tradeoff");
            }
        });
        assertThat(result.steps().get(3).available()).isFalse();
        assertThat(result.steps().get(3).entry()).isNull();
        assertThat(result.steps().get(3).activities()).isEmpty();
        assertThat(result.optionalModules()).extracting(CatalogEntry::id).containsExactly("distributed-rate-limiter");
    }
    @Test void rejectsMissingDuplicateReorderedAndUnclosedOptionalModules() {
        for (var definition : List.of(path(List.of(step("missing")), List.of()),
                path(List.of(step("request-flow"), step("request-flow")), List.of()),
                path(List.of(step("capacity-estimation"), step("request-flow")), List.of()),
                path(List.of(step("request-flow")), List.of("distributed-rate-limiter")),
                path(List.of(step("request-flow")), List.of("request-flow")))) {
            assertThatThrownBy(() -> LearningPathService.validate(List.of(definition), catalog.entriesForLearningPaths())).isInstanceOf(IllegalStateException.class);
        }
    }
    @Test void rejectsMalformedEmptyDuplicateAndUnboundedDefinitions() throws Exception {
        var valid = definitions().get(0);
        for (List<LearningPathService.Definition> list : Arrays.<List<LearningPathService.Definition>>asList(null, List.of(), Arrays.asList((LearningPathService.Definition) null), List.of(valid, valid), java.util.Collections.nCopies(9, valid))) {
            assertThatThrownBy(() -> LearningPathService.validate(list, catalog.entriesForLearningPaths())).isInstanceOf(IllegalStateException.class);
        }
        for (var invalid : List.of(new LearningPathService.Definition(2, "valid", "Title", "Summary", valid.steps(), List.of()),
                path(List.of(), List.of()), path(Arrays.asList((LearningPathService.StepDefinition) null), List.of()),
                path(List.of(new LearningPathService.StepDefinition("request-flow", " ")), List.of()),
                path(java.util.Collections.nCopies(13, step("request-flow")), List.of()),
                path(List.of(step("request-flow")), java.util.Collections.nCopies(9, "capacity-estimation")))) {
            assertThatThrownBy(() -> LearningPathService.validate(List.of(invalid), catalog.entriesForLearningPaths())).isInstanceOf(IllegalStateException.class);
        }
    }
    @Test void unknownPathsCannotBecomeResourceReads() {
        var service = new LearningPathService(mapper, catalog);
        for (String id : List.of("unknown", "catalog.json", "../first-system-design"))
            assertThatThrownBy(() -> service.path(id)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
    @Test void aPublishedWorkshopGetsAuthoredActivitiesWhileItsDraftDoesNot() throws Exception {
        var draft = catalog.caseStudy("url-shortener"); var old = draft.entry();
        var published = new CatalogEntry(old.id(), old.kind(), old.title(), old.summary(), old.category(), old.level(), old.order(), "published", old.prerequisites(), old.outcomes(), old.capabilities(), old.lessonPath(), old.questionsPath(), old.resourcesPath(), old.checkpointsPath(), old.workshopPath(), old.simulationIds(), old.estimatorIds(), old.contentVersion(), old.reviewedAt(), old.sourceIds());
        var fake = mock(CatalogService.class); var entries = new ArrayList<>(catalog.entriesForLearningPaths());
        entries.replaceAll(entry -> entry.id().equals(published.id()) ? published : entry);
        when(fake.entriesForLearningPaths()).thenReturn(entries);
        when(fake.topic(anyString())).thenAnswer(invocation -> catalog.topic(invocation.getArgument(0)));
        when(fake.caseStudy("url-shortener")).thenReturn(new CaseStudyDetail(published, draft.workshop()));
        var step = new LearningPathService(definitions(), fake).path("first-system-design").steps().get(3);
        assertThat(step.available()).isTrue(); assertThat(step.entry()).isEqualTo(published);
        for (var stage : draft.workshop().stages()) {
            assertThat(step.activities()).extracting(LearningPath.Activity::id).contains(stage.id() + "-attempt", stage.id() + "-revision");
            for (var criterion : stage.rubric()) assertThat(step.activities()).anySatisfy(activity -> {
                assertThat(activity.id()).isEqualTo(stage.id() + "-check-" + criterion.id());
                assertThat(activity.optionIds()).containsExactly("yes", "revisit");
            });
        }
        assertThat(catalog.caseStudy("url-shortener").entry().status()).isEqualTo("draft");
    }
}
