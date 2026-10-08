package com.hld.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;

import java.io.InputStream;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

class CaseStudyCatalogTest {
    private CatalogEntry entry(String status, String path) {
        return new CatalogEntry("url-shortener", "case-study", "Title", "Summary", "Design", "Intermediate", 1,
                status, List.of(), List.of("Explain"), List.of("case-study"), null, null,
                "case-studies/url-shortener/resources.json", null, path, List.of(), List.of(), "1.0.0", "2026-10-08", List.of("http-semantics"));
    }

    @Test
    void plannedWorkshopIsNotLoadedOrDelivered() throws Exception {
        ObjectMapper mapper = mock(ObjectMapper.class);
        doReturn(List.of(entry("planned", null))).when(mapper).readValue(any(InputStream.class), ArgumentMatchers.<TypeReference<Object>>any());
        CatalogService service = new CatalogService(mapper);
        assertThat(service.publishedTopics()).isEmpty();
        assertThatThrownBy(() -> service.caseStudy("url-shortener"))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
    }

    @Test
    void publishedCaseNeverAppearsAsATopicAndIsDeliveredOnlyAsACase() throws Exception {
        CatalogEntry published = entry("published", "case-studies/url-shortener/workshop.json");
        Workshop workshop = new Workshop(1, "url-shortener", "1.0.0", "Introduction", "Invariant",
                List.of("requirements", "estimates", "api", "data", "baseline", "flows", "evolution", "failures", "operations", "defense")
                        .stream().map(id -> new Workshop.WorkshopStage(id, "Title", "Prompt", "Reference",
                                List.of(new Workshop.RubricCriterion("explain", "Explain")), List.of(), List.of("http-semantics"))).toList());
        ObjectMapper mapper = mock(ObjectMapper.class);
        doReturn(List.of(published), workshop).when(mapper).readValue(any(InputStream.class), ArgumentMatchers.<TypeReference<Object>>any());
        CatalogService service = new CatalogService(mapper);
        assertThat(service.publishedTopics()).isEmpty();
        assertThat(service.caseStudy("url-shortener").workshop()).isEqualTo(workshop);
        assertThatThrownBy(() -> service.topic("url-shortener"))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
    }

    @Test
    void refusesMissingOrNonCanonicalWorkshopResourcePathsAtStartup() throws Exception {
        for (String path : new String[] {null, "../catalog.json", "topics/cache-aside/lesson.md", "case-studies/other/workshop.json"}) {
            ObjectMapper mapper = mock(ObjectMapper.class);
            doReturn(List.of(entry("draft", path))).when(mapper).readValue(any(InputStream.class), ArgumentMatchers.<TypeReference<Object>>any());
            assertThatThrownBy(() -> new CatalogService(mapper)).isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("path");
        }
    }
}
