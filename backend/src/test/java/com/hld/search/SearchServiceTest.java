package com.hld.search;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.hld.catalog.CatalogEntry;
import com.hld.catalog.CatalogService;
import com.hld.catalog.CaseStudyDetail;
import com.hld.catalog.TopicDetail;
import com.hld.catalog.Workshop;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class SearchServiceTest {
    private static CatalogEntry entry(String id, String title, String summary, int order, String capability) {
        return new CatalogEntry(id, "topic", title, summary, "Foundations", "Beginner", order, "published",
                List.of(), List.of("Explain the example"), List.of("study", capability), null, null, null, null, null,
                List.of(), List.of(), "1.0.0", "2026-10-09", List.of());
    }

    private static SearchService service(List<CatalogEntry> entries, List<String> bodies) {
        var catalog = mock(CatalogService.class);
        when(catalog.publishedTopics()).thenReturn(entries);
        when(catalog.publishedCaseStudies()).thenReturn(List.of());
        for (int i = 0; i < entries.size(); i++) {
            var entry = entries.get(i);
            when(catalog.topic(entry.id())).thenReturn(new TopicDetail(entry, bodies.get(i), List.of(), List.of()));
        }
        return new SearchService(catalog);
    }

    @Test
    void findsBodyTerminologyAndRanksTitleBeforeSummaryBeforeBody() {
        var search = service(List.of(
                entry("body", "Other concept", "Other summary", 1, "simulation"),
                entry("summary", "Other concept", "Stale reads matter", 2, "simulation"),
                entry("title", "Stale reads", "First explanation", 3, "simulation")),
                List.of("## Lesson\n[Stale reads](https://example.com/reference) can hide an **update**.", "Body", "Body"));
        var response = search.search("  STALE   reads  ", "", "");
        assertThat(response.query()).isEqualTo("STALE reads");
        assertThat(response.results()).extracting(hit -> hit.entry().id()).containsExactly("title", "summary", "body");
        assertThat(response.results().get(2).excerpt()).contains("Stale reads can hide an update.").doesNotContain("https://", "**", "##");
        assertThat(response.results()).allSatisfy(hit -> assertThat(hit.path()).endsWith("?view=study"));
    }

    @Test
    void allTermsAndActualCapabilitiesMustMatch() {
        var search = service(List.of(entry("cache", "Cache", "Origin copies", 1, "simulation")), List.of("Stale reads and expiry"));
        assertThat(search.search("stale missing", "", "").results()).isEmpty();
        assertThat(search.search("stale", "Intermediate", "").results()).isEmpty();
        assertThat(search.search("stale", "", "estimator").results()).isEmpty();
        assertThat(search.search("stale", "Beginner", "simulation").totalMatches()).isEqualTo(1);
    }

    @Test
    void capsResultsButReportsAllMatchesInDeterministicCatalogOrder() {
        List<CatalogEntry> entries = new ArrayList<>();
        List<String> bodies = new ArrayList<>();
        for (int i = 24; i >= 0; i--) {
            entries.add(entry("lesson-" + i, "Matching lesson", "Summary", i + 1, "simulation"));
            bodies.add("Body");
        }
        var response = service(entries, bodies).search("matching", "", "");
        assertThat(response.totalMatches()).isEqualTo(25);
        assertThat(response.limit()).isEqualTo(20);
        assertThat(response.results()).hasSize(20);
        assertThat(response.results().get(0).entry().id()).isEqualTo("lesson-0");
        assertThat(response.results().get(19).entry().id()).isEqualTo("lesson-19");
        assertThatThrownBy(() -> response.results().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void unicodeAndLiteralPunctuationDoNotBecomeRegexOrBrokenExcerptSurrogates() {
        var search = service(List.of(entry("unicode", "Another title", "Summary", 1, "simulation")),
                List.of("😀".repeat(250) + " ＣＡＦＥ́ [a+b] and literal regex.* are examples " + "😀".repeat(250)));
        var hit = search.search("café", "", "").results().get(0);
        assertThat(hit.excerpt().codePointCount(0, hit.excerpt().length())).isLessThanOrEqualTo(222);
        for (int i = 0; i < hit.excerpt().length(); i++) {
            char current = hit.excerpt().charAt(i);
            if (Character.isHighSurrogate(current)) {
                assertThat(i + 1).isLessThan(hit.excerpt().length());
                assertThat(Character.isLowSurrogate(hit.excerpt().charAt(++i))).isTrue();
            } else assertThat(Character.isLowSurrogate(current)).isFalse();
        }
        assertThat(search.search("regex.*", "", "").totalMatches()).isEqualTo(1);
        assertThat(search.search("nothing.*", "", "").results()).isEmpty();
    }

    @Test
    void rejectsInvalidQueriesAndFiltersAndKeepsBlankSearchExplicitlyEmpty() {
        var search = service(List.of(), List.of());
        assertThat(search.search(" \t\n ", "", "").results()).isEmpty();
        for (String query : List.of("a", "x".repeat(101), "ab\u0000cd")) {
            assertThatThrownBy(() -> search.search(query, "", "")).isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> search.search("cache", "Expert", "")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> search.search("cache", "", "planned")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void publishedWorkshopTermsLinkToTheMatchingStableStage() {
        var catalog = mock(CatalogService.class);
        var entry = new CatalogEntry("url-shortener", "case-study", "URL Shortener", "Design stable codes", "Case Studies",
                "Intermediate", 5, "published", List.of(), List.of("Explain"), List.of("case-study"), null, null, null,
                null, "case-studies/url-shortener/workshop.json", List.of(), List.of(), "1.0.0", "2026-10-09", List.of());
        var stage = new Workshop.WorkshopStage("api", "API decisions", "Define expiry", "Reject a revoked mapping", List.of(), List.of(), List.of(),
                List.of(new Workshop.Walkthrough("create", "Create flow", "Persist safely",
                        List.of(new Workshop.DiagramNode("app", "Application", "Validate"), new Workshop.DiagramNode("store", "Store", "Persist")),
                        List.of(new Workshop.DiagramStep("reserve", "Reserve", "app", "store", "Conditional reservation")))));
        when(catalog.publishedTopics()).thenReturn(List.of());
        when(catalog.publishedCaseStudies()).thenReturn(List.of(entry));
        when(catalog.caseStudy(entry.id())).thenReturn(new CaseStudyDetail(entry, new Workshop(1, entry.id(), "1.0.0", "Intro", "Invariant", List.of(stage,
                new Workshop.WorkshopStage("data", "Data decisions", "Choose a key", "Preserve ownership", List.of(), List.of(), List.of())))));
        var hit = new SearchService(catalog).search("revoked", "Intermediate", "case-study").results().get(0);
        assertThat(hit.stageId()).isEqualTo("api");
        assertThat(hit.path()).isEqualTo("/case-studies/url-shortener?stage=api");
        assertThat(new SearchService(catalog).search("conditional reservation", "", "").results())
                .extracting(SearchHit::stageId).containsExactly("api");
        assertThat(new SearchService(catalog).search("design", "", "").results())
                .extracting(SearchHit::stageId).containsExactly("api", "data");
    }
}
