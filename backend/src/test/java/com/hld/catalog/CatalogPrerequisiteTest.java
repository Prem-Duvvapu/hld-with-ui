package com.hld.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;

import java.io.InputStream;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

class CatalogPrerequisiteTest {
    private static CatalogEntry entry(String id, String status, List<String> prerequisites) {
        return new CatalogEntry(id, "topic", "A topic", "A prerequisite fixture", "Foundations", "Beginner", 1,
                status, prerequisites, List.of("Explain the prerequisite"), List.of("study"),
                null, null, null, null, null, List.of(), List.of(), "1.0.0", "2026-10-09", List.of());
    }

    private static CatalogService catalog(List<CatalogEntry> entries) throws Exception {
        ObjectMapper mapper = mock(ObjectMapper.class);
        doReturn(entries).when(mapper).readValue(any(InputStream.class), ArgumentMatchers.<TypeReference<Object>>any());
        return new CatalogService(mapper);
    }

    @Test
    void acceptsForwardReferencesSharedPrerequisitesAndDraftPlanningDependencies() throws Exception {
        var service = catalog(List.of(
                entry("capstone", "published", List.of("left", "right")),
                entry("draft-lesson", "draft", List.of("planned-lesson")),
                entry("right", "published", List.of("foundation")),
                entry("left", "published", List.of("foundation")),
                entry("planned-lesson", "planned", List.of("foundation")),
                entry("foundation", "published", List.of())));
        assertThat(service.publishedTopics()).extracting(CatalogEntry::id)
                .containsExactly("capstone", "right", "left", "foundation");
        assertThat(service.publishedCaseStudies()).isEmpty();
    }

    @Test
    void refusesDanglingPrerequisitesForEveryPublicationState() {
        for (String status : List.of("published", "draft", "planned")) {
            assertThatThrownBy(() -> catalog(List.of(entry("lesson", status, List.of("missing")))))
                    .isInstanceOf(IllegalStateException.class).hasMessageContaining("unknown prerequisite missing");
        }
    }

    @Test
    void publishedEntriesCannotDependOnDraftOrPlannedLessons() {
        for (String status : List.of("draft", "planned")) {
            assertThatThrownBy(() -> catalog(List.of(
                    entry("lesson", "published", List.of("unfinished")),
                    entry("unfinished", status, List.of()))))
                    .isInstanceOf(IllegalStateException.class).hasMessageContaining("requires unpublished unfinished");
        }
    }

    @Test
    void publishedCaseCannotBypassAnUnfinishedTopicPrerequisite() {
        var published = new CatalogEntry("url-shortener", "case-study", "Title", "Summary", "Case Studies", "Intermediate", 5,
                "published", List.of("unfinished"), List.of("Explain"), List.of("case-study"), null, null,
                "case-studies/url-shortener/resources.json", null, "case-studies/url-shortener/workshop.json",
                List.of(), List.of(), "1.4.0", "2026-10-09", List.of());
        assertThatThrownBy(() -> catalog(List.of(published, entry("unfinished", "draft", List.of()))))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("requires unpublished unfinished");
    }

    @Test
    void refusesDuplicateMalformedNullAndSelfPrerequisites() {
        for (List<String> prerequisites : Arrays.asList(
                null, List.of("foundation", "foundation"), List.of("invalid/id"),
                Arrays.asList((String) null), List.of("lesson"))) {
            assertThatThrownBy(() -> catalog(List.of(
                    entry("lesson", "draft", prerequisites),
                    entry("foundation", "published", List.of()))))
                    .isInstanceOf(IllegalStateException.class);
        }
    }

    @Test
    void refusesIndirectAndDisconnectedPlanningCycles() {
        for (String status : List.of("published", "draft", "planned")) {
            assertThatThrownBy(() -> catalog(List.of(
                    entry("good", "published", List.of()),
                    entry("first", status, List.of("second")),
                    entry("second", status, List.of("third")),
                    entry("third", status, List.of("first")))))
                    .isInstanceOf(IllegalStateException.class).hasMessageContaining("prerequisite cycle");
        }
    }

    @Test
    void refusesAbsentEntriesAndDuplicateCatalogIdsBeforeResourceLoading() {
        for (List<CatalogEntry> entries : Arrays.asList(null, Arrays.asList((CatalogEntry) null), List.of(
                entry("same", "published", List.of()), entry("same", "draft", List.of())))) {
            assertThatThrownBy(() -> catalog(entries)).isInstanceOf(IllegalStateException.class);
        }
    }
}
